import React, { useMemo, useState } from 'react';
import {
  Check,
  CheckSquare,
  Copy,
  Download,
  RefreshCw,
  Square,
} from 'lucide-react';
import type { AppsScriptConfig, PollInterval } from '../types/school';
import {
  generateAppsScript,
  generateAutomationYaml,
  generateConfigurationYaml,
  generateGmailFilterQuery,
  generateLovelaceYaml,
  getFullWebhookUrl,
  slugifySensor,
} from '../utils/haGenerators';

interface AppsScriptStudioProps {
  config: AppsScriptConfig;
  onChangeConfig: (patch: Partial<AppsScriptConfig>) => void;
}

type ArtifactTab = 'apps_script' | 'config_yaml' | 'lovelace_yaml' | 'automation_yaml';

interface ChecklistStep {
  id: string;
  title: string;
  description: string;
}

export const AppsScriptStudio: React.FC<AppsScriptStudioProps> = ({
  config,
  onChangeConfig,
}) => {
  const [activeTab, setActiveTab] = useState<ArtifactTab>('apps_script');
  const [copiedKey, setCopiedKey] = useState<string | null>(null);
  const [completedSteps, setCompletedSteps] = useState<Record<string, boolean>>({});

  const gmailFilterQuery = useMemo(() => generateGmailFilterQuery(config), [config]);
  const fullWebhookUrl = useMemo(() => getFullWebhookUrl(config), [config]);
  const sensorEntity = useMemo(() => `sensor.${slugifySensor(config.sensorName)}`, [config.sensorName]);

  const artifacts = useMemo(() => {
    return {
      apps_script: {
        filename: 'Code.gs',
        label: 'Code.gs (Apps Script)',
        hint: 'Paste into script.google.com, add GEMINI_API_KEY and HA_WEBHOOK_URL in Script Properties, and run setupScheduleTrigger().',
        content: generateAppsScript(config),
      },
      config_yaml: {
        filename: 'configuration.yaml',
        label: 'configuration.yaml',
        hint: `Defines the webhook trigger-based template sensor (${sensorEntity}) that stores your school digest across HA restarts.`,
        content: generateConfigurationYaml(config),
      },
      lovelace_yaml: {
        filename: 'lovelace-card.yaml',
        label: 'lovelace-card.yaml',
        hint: 'Add a Manual Card to your Home Assistant dashboard and paste this YAML.',
        content: generateLovelaceYaml(config),
      },
      automation_yaml: {
        filename: 'automations.yaml',
        label: 'automations.yaml',
        hint: 'Optional automation to add extracted deadlines to a To-Do list and send mobile alerts.',
        content: generateAutomationYaml(config),
      },
    };
  }, [config, sensorEntity]);

  const currentArtifact = artifacts[activeTab];

  const handleCopy = async (key: string, text: string) => {
    await navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 1800);
  };

  const handleDownload = (filename: string, content: string) => {
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRandomizeWebhookId = () => {
    const bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    onChangeConfig({ webhookId: `school_digest_${hex}` });
  };

  const toggleStep = (id: string) => {
    setCompletedSteps((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const checklistSteps: ChecklistStep[] = [
    {
      id: 'gmail-filter',
      title: '1. Create a Gmail filter for your child’s school',
      description: `In Gmail, paste "${gmailFilterQuery}" into the search bar, click Show search options > Create filter, and apply the label "${
        config.gmailLabel || 'School'
      }".`,
    },
    {
      id: 'apps-script',
      title: '2. Create your Google Apps Script project',
      description:
        'Open script.google.com, create a new project named "SchoolPulse HA", and replace Code.gs with the generated script above.',
    },
    {
      id: 'script-props',
      title: '3. Add Script Properties & install the schedule trigger',
      description: `Open Project Settings > Script Properties and add GEMINI_API_KEY and HA_WEBHOOK_URL (${fullWebhookUrl}). Run setupScheduleTrigger() once and grant Gmail access to your own script.`,
    },
    {
      id: 'ha-sensor',
      title: '4. Add the webhook template sensor to Home Assistant',
      description: `Append configuration.yaml to your Home Assistant config and reload Template Entities (Developer Tools > YAML). This creates ${sensorEntity}.`,
    },
    {
      id: 'ha-card',
      title: '5. Add the Lovelace dashboard card & test sync',
      description:
        'Paste lovelace-card.yaml into a Manual Card on your dashboard, then run forceResyncNow() inside Apps Script to watch your dashboard populate immediately.',
    },
  ];

  const completedCount = checklistSteps.filter((s) => completedSteps[s.id]).length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
        {/* Left: Configuration Form */}
        <section className="xl:col-span-4 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200">
            <h2 className="text-base font-semibold text-slate-900">
              Apps Script &amp; Home Assistant Config
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Customize once — all 4 generated files update live.
            </p>
          </div>

          <div className="p-5 space-y-4">
            <div>
              <label
                htmlFor="cfg-senders"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                School Sender Address(es) or Domain
              </label>
              <input
                id="cfg-senders"
                type="text"
                value={config.schoolSenders}
                onChange={(e) => onChangeConfig({ schoolSenders: e.target.value })}
                placeholder="office@school.edu, @school.edu"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
              />
              <div className="mt-1.5 flex items-center justify-between gap-2 text-xs text-slate-500">
                <span className="truncate font-mono text-[11px]" title={gmailFilterQuery}>
                  Gmail query: {gmailFilterQuery}
                </span>
                <button
                  type="button"
                  onClick={() => handleCopy('gmail-query', gmailFilterQuery)}
                  className="text-sky-700 hover:text-sky-800 font-medium whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {copiedKey === 'gmail-query' ? 'Copied' : 'Copy'}
                </button>
              </div>
            </div>

            <div className="flex items-center justify-between gap-3 pt-1">
              <label
                htmlFor="cfg-use-label"
                className="text-xs font-medium text-slate-700 cursor-pointer"
              >
                Query Gmail by Label (recommended)
              </label>
              <input
                id="cfg-use-label"
                type="checkbox"
                checked={config.useLabelFilter}
                onChange={(e) => onChangeConfig({ useLabelFilter: e.target.checked })}
                className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600 cursor-pointer"
              />
            </div>

            {config.useLabelFilter && (
              <div>
                <label
                  htmlFor="cfg-label"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Gmail Label Name
                </label>
                <input
                  id="cfg-label"
                  type="text"
                  value={config.gmailLabel}
                  onChange={(e) => onChangeConfig({ gmailLabel: e.target.value })}
                  placeholder="School"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                />
              </div>
            )}

            <hr className="border-slate-100" />

            <div>
              <label
                htmlFor="cfg-ha-url"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Home Assistant External URL (Nabu Casa / HTTPS)
              </label>
              <input
                id="cfg-ha-url"
                type="url"
                value={config.webhookBaseUrl}
                onChange={(e) => onChangeConfig({ webhookBaseUrl: e.target.value })}
                placeholder="https://your-instance.ui.nabu.casa"
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
              />
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="cfg-webhook-id"
                  className="block text-xs font-medium text-slate-700"
                >
                  Secret Webhook ID
                </label>
                <button
                  type="button"
                  onClick={handleRandomizeWebhookId}
                  className="text-xs text-sky-700 hover:text-sky-800 font-medium flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw className="w-3 h-3" />
                  <span>Randomize</span>
                </button>
              </div>
              <input
                id="cfg-webhook-id"
                type="text"
                value={config.webhookId}
                onChange={(e) => onChangeConfig({ webhookId: e.target.value })}
                className="w-full px-3 py-2 text-sm font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="cfg-sensor"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Sensor Friendly Name
                </label>
                <input
                  id="cfg-sensor"
                  type="text"
                  value={config.sensorName}
                  onChange={(e) => onChangeConfig({ sensorName: e.target.value })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                />
              </div>
              <div>
                <label
                  htmlFor="cfg-lookback"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Lookback Window
                </label>
                <select
                  id="cfg-lookback"
                  value={config.lookbackDays}
                  onChange={(e) => onChangeConfig({ lookbackDays: Number(e.target.value) })}
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                >
                  <option value={7}>Last 7 days</option>
                  <option value={14}>Last 14 days</option>
                  <option value={30}>Last 30 days</option>
                </select>
              </div>
            </div>

            <div>
              <label
                htmlFor="cfg-poll"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Apps Script Sync Schedule
              </label>
              <select
                id="cfg-poll"
                value={config.pollInterval}
                onChange={(e) =>
                  onChangeConfig({ pollInterval: e.target.value as PollInterval })
                }
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
              >
                <option value="15min">Every 15 minutes</option>
                <option value="30min">Every 30 minutes</option>
                <option value="hourly">Every hour</option>
                <option value="daily_7am">Daily at 7:00 AM</option>
              </select>
            </div>

            <div className="space-y-2.5 pt-1">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="cfg-attachments"
                  className="text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Read PDF &amp; photo attachments
                </label>
                <input
                  id="cfg-attachments"
                  type="checkbox"
                  checked={config.includeAttachments}
                  onChange={(e) => onChangeConfig({ includeAttachments: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600 cursor-pointer"
                />
              </div>

              {config.includeAttachments && (
                <div>
                  <label
                    htmlFor="cfg-max-att-mb"
                    className="block text-[11px] text-slate-500 mb-1"
                  >
                    Max size per attachment (skips tiny &lt;12 KB signature icons)
                  </label>
                  <select
                    id="cfg-max-att-mb"
                    value={config.maxAttachmentSizeMb}
                    onChange={(e) =>
                      onChangeConfig({ maxAttachmentSizeMb: Number(e.target.value) })
                    }
                    className="w-full px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                  >
                    <option value={2}>Up to 2 MB per file</option>
                    <option value={5}>Up to 5 MB per file (Recommended)</option>
                    <option value={8}>Up to 8 MB per file</option>
                  </select>
                </div>
              )}
            </div>

            <hr className="border-slate-100" />

            {/* Optional HA integrations */}
            <div className="space-y-3">
              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="cfg-todo"
                  className="text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Sync deadlines to HA To-Do list
                </label>
                <input
                  id="cfg-todo"
                  type="checkbox"
                  checked={config.enableTodoSync}
                  onChange={(e) => onChangeConfig({ enableTodoSync: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600 cursor-pointer"
                />
              </div>

              {config.enableTodoSync && (
                <input
                  type="text"
                  value={config.todoEntityId}
                  onChange={(e) => onChangeConfig({ todoEntityId: e.target.value })}
                  aria-label="Home Assistant To-Do entity ID"
                  placeholder="todo.school_actions"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                />
              )}

              <div className="flex items-center justify-between gap-3">
                <label
                  htmlFor="cfg-notify"
                  className="text-xs font-medium text-slate-700 cursor-pointer"
                >
                  Mobile alert for urgent deadlines
                </label>
                <input
                  id="cfg-notify"
                  type="checkbox"
                  checked={config.enableMobileNotify}
                  onChange={(e) => onChangeConfig({ enableMobileNotify: e.target.checked })}
                  className="h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600 cursor-pointer"
                />
              </div>

              {config.enableMobileNotify && (
                <input
                  type="text"
                  value={config.notifyService}
                  onChange={(e) => onChangeConfig({ notifyService: e.target.value })}
                  aria-label="Home Assistant notify service"
                  placeholder="notify.mobile_app_phone"
                  className="w-full px-3 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                />
              )}
            </div>
          </div>
        </section>

        {/* Right: Generated Code Artifacts */}
        <section className="xl:col-span-8 bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
              {(
                ['apps_script', 'config_yaml', 'lovelace_yaml', 'automation_yaml'] as ArtifactTab[]
              ).map((tabKey) => (
                <button
                  key={tabKey}
                  type="button"
                  onClick={() => setActiveTab(tabKey)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                    activeTab === tabKey
                      ? 'bg-white text-slate-900 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {artifacts[tabKey].label}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handleCopy(activeTab, currentArtifact.content)}
                className="px-3 py-1.5 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                {copiedKey === activeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    <span>Copied</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    <span>Copy {currentArtifact.filename}</span>
                  </>
                )}
              </button>
              <button
                type="button"
                onClick={() => handleDownload(currentArtifact.filename, currentArtifact.content)}
                className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Download</span>
              </button>
            </div>
          </div>

          <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 text-xs text-slate-600">
            {currentArtifact.hint}
          </div>

          <div className="bg-slate-950 text-slate-100 p-5 overflow-x-auto max-h-[560px] overflow-y-auto">
            <pre className="text-xs font-mono leading-relaxed">{currentArtifact.content}</pre>
          </div>
        </section>
      </div>

      {/* Deployment Checklist */}
      <section className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              5-Step Deployment Checklist
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Follow these steps once you are happy with how your pasted school emails summarize.
            </p>
          </div>
          <span className="text-xs font-mono tabular-nums text-slate-600 whitespace-nowrap shrink-0">
            {completedCount} / {checklistSteps.length} completed
          </span>
        </div>

        <ul className="divide-y divide-slate-100">
          {checklistSteps.map((step) => {
            const done = Boolean(completedSteps[step.id]);
            return (
              <li
                key={step.id}
                className={`px-5 py-3.5 flex items-start gap-3.5 transition-colors hover:bg-slate-50/70 ${
                  done ? 'opacity-60' : ''
                }`}
              >
                <button
                  type="button"
                  onClick={() => toggleStep(step.id)}
                  aria-label={`Mark ${step.title} complete`}
                  className="mt-0.5 text-slate-400 hover:text-sky-700 cursor-pointer shrink-0"
                >
                  {done ? (
                    <CheckSquare className="w-4 h-4 text-emerald-600" />
                  ) : (
                    <Square className="w-4 h-4" />
                  )}
                </button>
                <div className="min-w-0">
                  <div
                    className={`text-sm font-medium text-slate-900 ${
                      done ? 'line-through' : ''
                    }`}
                  >
                    {step.title}
                  </div>
                  <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                    {step.description}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </section>
    </div>
  );
};
