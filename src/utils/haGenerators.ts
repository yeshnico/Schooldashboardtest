import type { AppsScriptConfig, HAWebhookPayload, SchoolDigestResult } from '../types/school';

export function slugifySensor(name: string): string {
  const cleaned = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return cleaned || 'school_digest';
}

export function getFullWebhookUrl(config: AppsScriptConfig): string {
  const base = config.webhookBaseUrl.trim().replace(/\/+$/, '');
  const id = config.webhookId.trim().replace(/^\/+/, '') || 'school_email_digest';
  if (!base) {
    return `https://your-instance.ui.nabu.casa/api/webhook/${id}`;
  }
  if (base.includes('/api/webhook/')) {
    return base;
  }
  return `${base}/api/webhook/${id}`;
}

export function generateGmailFilterQuery(config: AppsScriptConfig): string {
  const senders = config.schoolSenders
    .split(/[,\n]+/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (senders.length === 0) {
    return 'from:(@yourschool.edu)';
  }
  if (senders.length === 1) {
    return `from:${senders[0]}`;
  }
  return `from:(${senders.join(' OR ')})`;
}

export function buildWebhookPayload(result: SchoolDigestResult): HAWebhookPayload {
  const activeDeadlines = result.deadlines.filter((d) => !d.completed);
  const urgentCount = activeDeadlines.filter(
    (d) => d.urgency === 'overdue' || d.urgency === 'urgent'
  ).length;
  const openActions = result.actions.filter((a) => !a.completed);

  return {
    digest: result.digest,
    urgent_count: urgentCount,
    total_deadlines: activeDeadlines.length,
    open_actions: openActions.length,
    last_updated: result.generatedAt,
    deadlines: activeDeadlines.map((d) => ({
      title: d.title,
      due_date: d.dueDate,
      due_time: d.dueTime || '',
      urgency: d.urgency,
      category: d.category,
      action: d.actionRequired,
      amount: d.amount || '',
    })),
    actions: openActions.map((a) => ({
      task: a.task,
      when: a.when,
      category: a.category,
      details: a.details,
    })),
    events: result.events.map((e) => ({
      title: e.title,
      date: e.date,
      time: e.time,
      location: e.location || '',
      notes: e.notes,
    })),
  };
}

export function generateAppsScript(config: AppsScriptConfig): string {
  const gmailQuery = config.useLabelFilter
    ? `label:${config.gmailLabel.trim() || 'School'} newer_than:${config.lookbackDays}d`
    : `${generateGmailFilterQuery(config)} newer_than:${config.lookbackDays}d`;

  const triggerCode = (() => {
    switch (config.pollInterval) {
      case '15min':
        return `  ScriptApp.newTrigger('syncSchoolEmailsToHomeAssistant')\n    .timeBased()\n    .everyMinutes(15)\n    .create();`;
      case '30min':
        return `  ScriptApp.newTrigger('syncSchoolEmailsToHomeAssistant')\n    .timeBased()\n    .everyMinutes(30)\n    .create();`;
      case 'hourly':
        return `  ScriptApp.newTrigger('syncSchoolEmailsToHomeAssistant')\n    .timeBased()\n    .everyHours(1)\n    .create();`;
      case 'daily_7am':
        return `  ScriptApp.newTrigger('syncSchoolEmailsToHomeAssistant')\n    .timeBased()\n    .everyDays(1)\n    .atHour(7)\n    .create();`;
    }
  })();

  const childContextLine = config.childContext.trim()
    ? `const CHILD_CONTEXT = ${JSON.stringify(config.childContext.trim())};`
    : `const CHILD_CONTEXT = '';`;

  const maxBytesExpr = `${Math.max(1, config.maxAttachmentSizeMb)} * 1024 * 1024`;

  return `/**
 * SchoolPulse HA — Google Apps Script Sync (Text + PDF & Photo Attachments)
 *
 * Reads recent school emails AND their PDF/photo attachments from Gmail,
 * summarizes deadlines, actions, and events with Gemini, and pushes structured
 * JSON to your Home Assistant Webhook.
 *
 * SETUP (Script Properties — Project Settings > Script Properties):
 *   1. GEMINI_API_KEY  = Your Gemini API key from aistudio.google.com
 *   2. HA_WEBHOOK_URL  = ${getFullWebhookUrl(config)}
 *
 * Then run setupScheduleTrigger() once to enable automatic syncing.
 */

const GMAIL_QUERY = ${JSON.stringify(gmailQuery)};
const MAX_THREADS = 10;
const GEMINI_MODEL = 'gemini-3.1-flash-lite';
const INCLUDE_ATTACHMENTS = ${config.includeAttachments ? 'true' : 'false'};
const MAX_ATTACHMENT_BYTES = ${maxBytesExpr}; // ${config.maxAttachmentSizeMb} MB per file
const MIN_IMAGE_BYTES = 12 * 1024; // Skip tiny <12 KB email-signature logos & icons
const MAX_TOTAL_ATTACHMENTS = 6;   // Keeps Apps Script request payload well under 20 MB
const SUPPORTED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
];
${childContextLine}

function syncSchoolEmailsToHomeAssistant() {
  const props = PropertiesService.getScriptProperties();
  const apiKey = props.getProperty('GEMINI_API_KEY');
  const webhookUrl = props.getProperty('HA_WEBHOOK_URL');

  if (!apiKey) {
    throw new Error('Missing Script Property: GEMINI_API_KEY');
  }
  if (!webhookUrl) {
    throw new Error('Missing Script Property: HA_WEBHOOK_URL');
  }

  const emails = fetchRecentSchoolEmails_();
  if (emails.length === 0) {
    Logger.log('No matching school emails found for query: ' + GMAIL_QUERY);
    return;
  }

  // Skip calling Gemini if the exact same set of message IDs was already synced
  const fingerprint = emails.map(function (e) { return e.id; }).join(',');
  if (props.getProperty('LAST_SYNC_FINGERPRINT') === fingerprint) {
    Logger.log('No new school emails since last sync. Skipping update.');
    return;
  }

  const summary = summarizeWithGemini_(apiKey, emails);
  const payload = buildHomeAssistantPayload_(summary);

  const response = UrlFetchApp.fetch(webhookUrl, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  });

  const code = response.getResponseCode();
  if (code < 200 || code >= 300) {
    throw new Error('Home Assistant webhook failed (' + code + '): ' + response.getContentText());
  }

  props.setProperty('LAST_SYNC_FINGERPRINT', fingerprint);
  Logger.log(
    'Synced ' + emails.length + ' school emails to Home Assistant. Urgent deadlines: ' + payload.urgent_count
  );
}

function fetchRecentSchoolEmails_() {
  const threads = GmailApp.search(GMAIL_QUERY, 0, MAX_THREADS);
  const results = [];
  let totalAttached = 0;

  threads.forEach(function (thread) {
    const messages = thread.getMessages();
    const latest = messages[messages.length - 1];
    const attachments = [];

    if (INCLUDE_ATTACHMENTS && totalAttached < MAX_TOTAL_ATTACHMENTS) {
      // includeInlineImages: false ignores most embedded email signature banners
      const rawAtts = latest.getAttachments({
        includeInlineImages: false,
        includeAttachments: true,
      });

      rawAtts.forEach(function (att) {
        if (totalAttached >= MAX_TOTAL_ATTACHMENTS) return;
        const mime = (att.getContentType() || '').toLowerCase().split(';')[0].trim();
        if (SUPPORTED_MIMES.indexOf(mime) === -1) return;

        const bytes = att.getBytes();
        const size = bytes.length;
        if (size > MAX_ATTACHMENT_BYTES) {
          Logger.log('Skipping oversized attachment: ' + att.getName() + ' (' + size + ' bytes)');
          return;
        }
        // Ignore tiny decorative images (logos/social icons), but always keep PDFs
        if (mime.indexOf('image/') === 0 && size < MIN_IMAGE_BYTES) {
          return;
        }

        attachments.push({
          name: att.getName(),
          mimeType: mime,
          base64: Utilities.base64Encode(bytes),
        });
        totalAttached += 1;
      });
    }

    results.push({
      id: latest.getId(),
      sender: latest.getFrom(),
      subject: latest.getSubject(),
      date: Utilities.formatDate(latest.getDate(), Session.getScriptTimeZone(), 'yyyy-MM-dd'),
      body: latest.getPlainBody().slice(0, 8000),
      attachments: attachments,
    });
  });

  return results;
}

function summarizeWithGemini_(apiKey, emails) {
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const emailBlocks = emails
    .map(function (e, i) {
      const attNames = e.attachments.length
        ? e.attachments.map(function (a) { return a.name + ' (' + a.mimeType + ')'; }).join(', ')
        : 'None';
      return [
        '--- EMAIL ' + (i + 1) + ' ---',
        'From: ' + e.sender,
        'Date: ' + e.date,
        'Subject: ' + e.subject,
        'Attachments: ' + attNames,
        'Body:\\n' + e.body,
      ].join('\\n');
    })
    .join('\\n\\n');

  const prompt = [
    'Today is ' + today + '. ' + (CHILD_CONTEXT ? 'Child context: ' + CHILD_CONTEXT : ''),
    'Analyze these school emails AND all attached PDF documents or photos (including flyers, permission slips, maps, or safety/hazard photos).',
    'Extract deadlines, upcoming parent actions (including safety reminders if a photo shows something children should avoid), and school events for a Home Assistant dashboard.',
    'Convert relative dates into YYYY-MM-DD. Set urgency to overdue, urgent (<=3 days), upcoming (4-14 days), or normal.',
    'Keep titles concise (<65 chars) and deduplicate repeated reminders across emails and PDFs.',
    '',
    emailBlocks,
  ].join('\\n');

  // Build multimodal parts: text prompt first, followed by inline_data for each PDF/photo
  const parts = [{ text: prompt }];
  emails.forEach(function (e, i) {
    e.attachments.forEach(function (att) {
      parts.push({ text: 'Attached file from Email ' + (i + 1) + ': ' + att.name });
      parts.push({
        inline_data: {
          mime_type: att.mimeType,
          data: att.base64,
        },
      });
    });
  });

  const url =
    'https://generativelanguage.googleapis.com/v1beta/models/' +
    encodeURIComponent(GEMINI_MODEL) +
    ':generateContent?key=' +
    encodeURIComponent(apiKey);

  const requestBody = {
    contents: [{ parts: parts }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'OBJECT',
        properties: {
          digest: { type: 'STRING' },
          deadlines: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                due_date: { type: 'STRING' },
                due_time: { type: 'STRING' },
                urgency: { type: 'STRING' },
                category: { type: 'STRING' },
                action: { type: 'STRING' },
                amount: { type: 'STRING' },
              },
              required: ['title', 'due_date', 'urgency', 'category', 'action'],
            },
          },
          actions: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                task: { type: 'STRING' },
                when: { type: 'STRING' },
                category: { type: 'STRING' },
                details: { type: 'STRING' },
              },
              required: ['task', 'when', 'category', 'details'],
            },
          },
          events: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: {
                title: { type: 'STRING' },
                date: { type: 'STRING' },
                time: { type: 'STRING' },
                location: { type: 'STRING' },
                notes: { type: 'STRING' },
              },
              required: ['title', 'date', 'time', 'notes'],
            },
          },
        },
        required: ['digest', 'deadlines', 'actions', 'events'],
      },
    },
  };

  const res = UrlFetchApp.fetch(url, {
    method: 'post',
    contentType: 'application/json',
    payload: JSON.stringify(requestBody),
    muteHttpExceptions: true,
  });

  if (res.getResponseCode() !== 200) {
    throw new Error('Gemini API error (' + res.getResponseCode() + '): ' + res.getContentText());
  }

  const parsed = JSON.parse(res.getContentText());
  const text = parsed.candidates[0].content.parts[0].text;
  return JSON.parse(text);
}

function buildHomeAssistantPayload_(summary) {
  const deadlines = summary.deadlines || [];
  const actions = summary.actions || [];
  const events = summary.events || [];
  const urgentCount = deadlines.filter(function (d) {
    return d.urgency === 'overdue' || d.urgency === 'urgent';
  }).length;

  return {
    digest: summary.digest || 'School updates synced.',
    urgent_count: urgentCount,
    total_deadlines: deadlines.length,
    open_actions: actions.length,
    last_updated: new Date().toISOString(),
    deadlines: deadlines,
    actions: actions,
    events: events,
  };
}

/** Run once to create your automatic schedule trigger. */
function setupScheduleTrigger() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'syncSchoolEmailsToHomeAssistant') {
      ScriptApp.deleteTrigger(t);
    }
  });
${triggerCode}
  Logger.log('Scheduled trigger installed for syncSchoolEmailsToHomeAssistant.');
}

/** Utility: clear cache to force a fresh sync on the next run. */
function forceResyncNow() {
  PropertiesService.getScriptProperties().deleteProperty('LAST_SYNC_FINGERPRINT');
  syncSchoolEmailsToHomeAssistant();
}
`;
}

export function generateConfigurationYaml(config: AppsScriptConfig): string {
  const webhookId = config.webhookId.trim() || 'school_email_digest';
  const sensorName = config.sensorName.trim() || 'School Digest';
  const uniqueId = `${slugifySensor(sensorName)}_webhook_sensor`;

  return `# Add this to your Home Assistant configuration.yaml
# (or inside a packages/school_digest.yaml file)
# After saving, restart Home Assistant or reload Template Entities.

template:
  - trigger:
      - platform: webhook
        webhook_id: "${webhookId}"
        allowed_methods:
          - POST
        # Keep false when receiving webhooks from Google Apps Script over Nabu Casa / external HTTPS.
        local_only: false
    sensor:
      - name: "${sensorName}"
        unique_id: "${uniqueId}"
        icon: mdi:school-outline
        # State holds the urgent deadline count (keeps state well under HA's 255-char limit)
        state: "{{ trigger.json.urgent_count | default(0) | int }}"
        unit_of_measurement: "urgent"
        attributes:
          digest: "{{ trigger.json.digest | default('Waiting for first school email sync.') }}"
          total_deadlines: "{{ trigger.json.total_deadlines | default(0) | int }}"
          open_actions: "{{ trigger.json.open_actions | default(0) | int }}"
          last_updated: "{{ trigger.json.last_updated | default(now().isoformat()) }}"
          deadlines: "{{ trigger.json.deadlines | default([]) }}"
          actions: "{{ trigger.json.actions | default([]) }}"
          events: "{{ trigger.json.events | default([]) }}"
`;
}

export function generateLovelaceYaml(config: AppsScriptConfig): string {
  const sensorEntity = `sensor.${slugifySensor(config.sensorName)}`;
  const todoBlock = config.enableTodoSync
    ? `
  - type: todo-list
    entity: ${config.todoEntityId.trim() || 'todo.school_actions'}
    title: School Action Checklist`
    : '';

  return `# Paste into Home Assistant Dashboard > Edit Dashboard > Add Card > Manual (YAML)
type: vertical-stack
cards:
  - type: markdown
    title: "${config.sensorName.trim() || 'School Digest'}"
    content: |
      {% set digest = state_attr('${sensorEntity}', 'digest') %}
      {% set deadlines = state_attr('${sensorEntity}', 'deadlines') or [] %}
      {% set actions = state_attr('${sensorEntity}', 'actions') or [] %}
      {% set events = state_attr('${sensorEntity}', 'events') or [] %}
      {% set updated = state_attr('${sensorEntity}', 'last_updated') %}

      {{ digest if digest else 'No school updates synced yet.' }}

      ---
      ### Upcoming Deadlines ({{ deadlines | length }})
      {% if deadlines | length == 0 %}
      All caught up — no pending school deadlines.
      {% else %}
      {% for d in deadlines %}
      - **{{ d.title }}** — Due **{{ d.due_date }}**{% if d.due_time %} at {{ d.due_time }}{% endif %} ({{ d.urgency | upper }}){% if d.amount %} · {{ d.amount }}{% endif %}
        _{{ d.action }}_
      {% endfor %}
      {% endif %}

      ### Action Checklist ({{ actions | length }})
      {% if actions | length == 0 %}
      No upcoming parent actions.
      {% else %}
      {% for a in actions %}
      - **{{ a.when }}** — {{ a.task }} ({{ a.category }})
        _{{ a.details }}_
      {% endfor %}
      {% endif %}

      ### Key Dates & Events ({{ events | length }})
      {% if events | length == 0 %}
      No upcoming events listed.
      {% else %}
      {% for e in events %}
      - **{{ e.date }}**{% if e.time %} ({{ e.time }}){% endif %} — **{{ e.title }}**{% if e.location %} · {{ e.location }}{% endif %}
      {% endfor %}
      {% endif %}

      {% if updated %}
      *Last synced: {{ as_timestamp(updated) | timestamp_custom('%b %d, %I:%M %p') }}*
      {% endif %}${todoBlock}
`;
}

export function generateAutomationYaml(config: AppsScriptConfig): string {
  const webhookId = config.webhookId.trim() || 'school_email_digest';
  const todoEntity = config.todoEntityId.trim() || 'todo.school_actions';
  const notifyService = config.notifyService.trim() || 'notify.mobile_app_phone';

  const todoStep = config.enableTodoSync
    ? `  - repeat:
      for_each: "{{ trigger.json.deadlines | default([]) }}"
      sequence:
        - action: todo.add_item
          target:
            entity_id: ${todoEntity}
          data:
            item: "{{ repeat.item.title }} ({{ repeat.item.category }})"
            due_date: "{{ repeat.item.due_date }}"
            description: "{{ repeat.item.action }}"`
    : `  # Enable "Sync deadlines to Home Assistant To-Do list" in config to auto-add tasks here.`;

  const notifyStep = config.enableMobileNotify
    ? `  - condition: template
    value_template: "{{ (trigger.json.urgent_count | default(0) | int) > 0 }}"
  - action: ${notifyService}
    data:
      title: "School Deadlines: {{ trigger.json.urgent_count }} urgent"
      message: "{{ trigger.json.digest }}"`
    : `  # Enable "Send mobile alert for urgent deadlines" in config to add companion app alerts.`;

  return `# Optional: Add to automations.yaml to push school deadlines into a To-Do list
# and/or send a mobile notification when urgent school deadlines arrive.

alias: "School Digest — Sync To-Do & Urgent Alerts"
description: "Processes incoming school email webhook payloads from Google Apps Script"
mode: queued
trigger:
  - platform: webhook
    webhook_id: "${webhookId}"
    allowed_methods:
      - POST
    local_only: false
action:
${todoStep}
${notifyStep}
`;
}
