import 'dotenv/config';
import express from 'express';
import type { Request, Response } from 'express';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { GoogleGenAI, ThinkingLevel, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT || 3000);
const isProduction = process.env.NODE_ENV === 'production';
const MODEL_NAME = 'gemini-3.1-flash-lite';

const SUPPORTED_ATTACHMENT_MIMES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

const MAX_ATTACHMENT_BASE64_CHARS = 12 * 1024 * 1024; // ~9MB raw file

interface IncomingAttachment {
  name?: string;
  mimeType?: string;
  sizeBytes?: number;
  base64Data?: string;
}

interface IncomingEmail {
  id?: string;
  sender?: string;
  subject?: string;
  date?: string;
  body?: string;
  attachments?: IncomingAttachment[];
}

interface SummarizeRequestBody {
  emails?: IncomingEmail[];
  referenceDate?: string;
  childName?: string;
  model?: string;
}

interface ValidatedAttachment {
  name: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
  emailIndex: number;
}

function getGeminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw Object.assign(
      new Error('GEMINI_API_KEY is not configured on the server. Check Settings > Secrets.'),
      { status: 500 }
    );
  }
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

function buildMultimodalContents(
  validEmails: IncomingEmail[],
  attachments: ValidatedAttachment[],
  referenceDate: string,
  childName?: string
) {
  const childContext =
    typeof childName === 'string' && childName.trim()
      ? `Child / Grade context: ${childName.trim()}.`
      : '';

  const formattedEmails = validEmails
    .map((email, idx) => {
      const sender = (email.sender || 'Unknown sender').slice(0, 200);
      const subject = (email.subject || '(No subject)').slice(0, 300);
      const date = (email.date || 'Unspecified date').slice(0, 100);
      const text = (email.body || '').trim().slice(0, 12000) || '(No body text — inspect attached files)';
      const emailAtts = attachments.filter((a) => a.emailIndex === idx);
      const attLine =
        emailAtts.length > 0
          ? `Attachments: ${emailAtts.map((a) => `${a.name} (${a.mimeType})`).join(', ')}`
          : 'Attachments: None';
      return [
        `--- EMAIL ${idx + 1} ---`,
        `From: ${sender}`,
        `Date: ${date}`,
        `Subject: ${subject}`,
        attLine,
        `Body:\n${text}`,
      ].join('\n');
    })
    .join('\n\n');

  const promptText = [
    `Today's reference date is ${referenceDate}. ${childContext}`,
    'Analyze the following emails AND any attached PDF documents, permission slips, flyers, or photos from a school.',
    'Extract every actionable deadline, upcoming parent/student action, and calendar event for a Home Assistant family dashboard.',
    '',
    'Rules:',
    '- Carefully inspect ALL attached PDFs and photos (flyers, permission slips, calendars, lunch menus, safety/warning photos like pest bait traps, campus maps, or newsletters) in addition to the email body.',
    '- For EVERY attached file provided, include an entry in attachmentInsights stating the exact fileName, what is visually/textually shown in the file (whatWasSeen), and how it was used (extractedRelevance).',
    '- If a photo shows a safety hazard, equipment to avoid (such as bait traps), pickup zone, or dress code example without a hard due date, still note it clearly in attachmentInsights and include a parent/child awareness action if appropriate.',
    '- Convert relative dates ("this Friday", "next Tuesday") into ISO YYYY-MM-DD dates using the email date and reference date whenever possible.',
    '- Classify deadline urgency relative to the reference date: "overdue" if before reference date, "urgent" if within 3 days, "upcoming" if within 4–14 days, "normal" if more than 14 days away or no exact date.',
    '- Keep titles concise (under 65 characters) so they look clean on a Home Assistant dashboard card.',
    '- Include exact dollar amounts, required items, dress codes, or submission methods found in either the email text or attachments.',
    '- Deduplicate repeated reminders across emails and attachments.',
    '- Return strictly valid JSON matching the schema.',
    '',
    formattedEmails,
  ].join('\n');

  const parts: Array<
    | { text: string }
    | { inlineData: { mimeType: string; data: string } }
  > = [{ text: promptText }];

  for (const att of attachments) {
    parts.push({
      text: `Attached file from Email ${att.emailIndex + 1}: "${att.name}" (${att.mimeType})`,
    });
    parts.push({
      inlineData: {
        mimeType: att.mimeType,
        data: att.base64Data,
      },
    });
  }

  return { parts };
}

const RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    digest: {
      type: Type.STRING,
      description:
        'A concise 2-sentence parent-friendly summary highlighting the most urgent deadlines and upcoming school events.',
    },
    deadlines: {
      type: Type.ARRAY,
      description: 'All hard deadlines such as permission slips, payments, RSVPs, or homework due dates.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Short deadline title (under 65 chars).' },
          dueDate: {
            type: Type.STRING,
            description: 'ISO date YYYY-MM-DD if known, otherwise short readable date.',
          },
          dueTime: {
            type: Type.STRING,
            description: 'Optional time such as "3:00 PM" or empty string if none.',
          },
          urgency: {
            type: Type.STRING,
            description: 'One of: overdue, urgent, upcoming, normal',
          },
          category: {
            type: Type.STRING,
            description: 'One of: Form, Payment, RSVP, Academic, Supply, General',
          },
          actionRequired: {
            type: Type.STRING,
            description: 'Specific step the parent needs to take.',
          },
          amount: {
            type: Type.STRING,
            description: 'Optional payment amount (e.g. "$18.00") or empty string.',
          },
          sourceSubject: {
            type: Type.STRING,
            description: 'Subject of the email or attachment name this deadline came from.',
          },
        },
        required: ['title', 'dueDate', 'urgency', 'category', 'actionRequired', 'sourceSubject'],
      },
    },
    actions: {
      type: Type.ARRAY,
      description: 'Upcoming parent or child checklist actions (pack, wear, bring, sign, register).',
      items: {
        type: Type.OBJECT,
        properties: {
          task: { type: Type.STRING, description: 'Clear action item starting with a verb.' },
          when: { type: Type.STRING, description: 'When it needs to happen (date or day).' },
          category: {
            type: Type.STRING,
            description: 'One of: Pack, Wear, Sign, Pay, Attend, Prepare',
          },
          details: { type: Type.STRING, description: 'Short helpful detail or reminder.' },
        },
        required: ['task', 'when', 'category', 'details'],
      },
    },
    events: {
      type: Type.ARRAY,
      description: 'Upcoming school events, half-days, field trips, concerts, or closures.',
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING, description: 'Event name.' },
          date: { type: Type.STRING, description: 'ISO date YYYY-MM-DD or readable date.' },
          time: { type: Type.STRING, description: 'Time window or "All day".' },
          location: { type: Type.STRING, description: 'Location if mentioned, or empty string.' },
          notes: { type: Type.STRING, description: 'Short extra note for parents.' },
        },
        required: ['title', 'date', 'time', 'notes'],
      },
    },
    emailSummaries: {
      type: Type.ARRAY,
      description: 'One-line takeaway for each input email (incorporating its attachments).',
      items: {
        type: Type.OBJECT,
        properties: {
          subject: { type: Type.STRING },
          takeaway: { type: Type.STRING },
          hasActionRequired: { type: Type.BOOLEAN },
        },
        required: ['subject', 'takeaway', 'hasActionRequired'],
      },
    },
    attachmentInsights: {
      type: Type.ARRAY,
      description:
        'One entry per attached PDF or photo describing exactly what was seen in the image/document and how it was used (empty array if no attachments were provided).',
      items: {
        type: Type.OBJECT,
        properties: {
          fileName: { type: Type.STRING, description: 'Exact attached filename.' },
          contentType: {
            type: Type.STRING,
            description:
              'Short type label such as Photo, Safety Notice, Flyer, Permission Slip, Calendar, Menu, or Decorative Logo.',
          },
          whatWasSeen: {
            type: Type.STRING,
            description: 'Clear 1-2 sentence description of what is visible or written inside the attachment.',
          },
          extractedRelevance: {
            type: Type.STRING,
            description:
              'What the system did with it (e.g. "Added safety reminder to Actions", "Extracted 2 deadlines", or "Visual reference only — no deadlines found").',
          },
          hasActionableInfo: {
            type: Type.BOOLEAN,
            description: 'True if the attachment contained actionable dates, fees, or safety instructions.',
          },
        },
        required: ['fileName', 'contentType', 'whatWasSeen', 'extractedRelevance', 'hasActionableInfo'],
      },
    },
  },
  required: ['digest', 'deadlines', 'actions', 'events', 'emailSummaries', 'attachmentInsights'],
};

const SYSTEM_INSTRUCTION =
  'You are a precise family logistics assistant that extracts structured deadlines, parent action items, and calendar events from school emails, PDF documents, and flyer photos for display on a Home Assistant dashboard. Never invent dates or amounts not present in the emails or attachments.';

function normalizeDigestResponse(rawText: string, referenceDate: string) {
  const cleaned = rawText
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/, '');

  const parsed = JSON.parse(cleaned || '{}');

  const normalizeUrgency = (u: string): 'overdue' | 'urgent' | 'upcoming' | 'normal' => {
    const lower = (u || '').toLowerCase();
    if (lower === 'overdue' || lower === 'urgent' || lower === 'upcoming' || lower === 'normal') {
      return lower;
    }
    return 'upcoming';
  };

  const deadlines = Array.isArray(parsed.deadlines)
    ? parsed.deadlines.map((d: Record<string, unknown>, i: number) => ({
        id: `dl-${Date.now()}-${i}`,
        title: String(d.title || 'Untitled deadline'),
        dueDate: String(d.dueDate || 'TBD'),
        dueTime: d.dueTime ? String(d.dueTime) : '',
        urgency: normalizeUrgency(String(d.urgency || 'upcoming')),
        category: String(d.category || 'General'),
        actionRequired: String(d.actionRequired || ''),
        amount: d.amount ? String(d.amount) : '',
        sourceSubject: String(d.sourceSubject || ''),
        completed: false,
      }))
    : [];

  const actions = Array.isArray(parsed.actions)
    ? parsed.actions.map((a: Record<string, unknown>, i: number) => ({
        id: `act-${Date.now()}-${i}`,
        task: String(a.task || ''),
        when: String(a.when || 'Soon'),
        category: String(a.category || 'Prepare'),
        details: String(a.details || ''),
        completed: false,
      }))
    : [];

  const events = Array.isArray(parsed.events)
    ? parsed.events.map((e: Record<string, unknown>, i: number) => ({
        id: `evt-${Date.now()}-${i}`,
        title: String(e.title || ''),
        date: String(e.date || 'TBD'),
        time: String(e.time || 'All day'),
        location: e.location ? String(e.location) : '',
        notes: String(e.notes || ''),
      }))
    : [];

  const emailSummaries = Array.isArray(parsed.emailSummaries)
    ? parsed.emailSummaries.map((s: Record<string, unknown>) => ({
        subject: String(s.subject || ''),
        takeaway: String(s.takeaway || ''),
        hasActionRequired: Boolean(s.hasActionRequired),
      }))
    : [];

  const attachmentInsights = Array.isArray(parsed.attachmentInsights)
    ? parsed.attachmentInsights.map((a: Record<string, unknown>) => ({
        fileName: String(a.fileName || 'Attachment'),
        contentType: String(a.contentType || 'File'),
        whatWasSeen: String(a.whatWasSeen || ''),
        extractedRelevance: String(a.extractedRelevance || 'Reviewed as context'),
        hasActionableInfo: Boolean(a.hasActionableInfo),
      }))
    : [];

  return {
    generatedAt: new Date().toISOString(),
    referenceDate,
    digest: String(parsed.digest || 'School emails analyzed.'),
    deadlines,
    actions,
    events,
    emailSummaries,
    attachmentInsights,
  };
}

function parseAndValidateRequest(body: SummarizeRequestBody) {
  const emails = Array.isArray(body?.emails) ? body.emails : [];
  const validEmails: IncomingEmail[] = [];
  const validatedAttachments: ValidatedAttachment[] = [];
  const skippedAttachments: string[] = [];

  for (const email of emails) {
    if (!email) continue;
    const hasBody = typeof email.body === 'string' && email.body.trim().length > 0;
    const rawAttachments = Array.isArray(email.attachments) ? email.attachments : [];
    const emailIdx = validEmails.length;
    const emailValidAtts: ValidatedAttachment[] = [];

    for (const att of rawAttachments) {
      if (!att || typeof att.base64Data !== 'string' || !att.base64Data) continue;
      const mime = String(att.mimeType || '').toLowerCase();
      const name = String(att.name || 'attachment').slice(0, 120);
      if (!SUPPORTED_ATTACHMENT_MIMES.has(mime)) {
        skippedAttachments.push(`${name} (unsupported type ${mime || 'unknown'})`);
        continue;
      }
      if (att.base64Data.length > MAX_ATTACHMENT_BASE64_CHARS) {
        skippedAttachments.push(`${name} (exceeds 9 MB limit)`);
        continue;
      }
      emailValidAtts.push({
        name,
        mimeType: mime,
        sizeBytes: typeof att.sizeBytes === 'number' ? att.sizeBytes : Math.round((att.base64Data.length * 3) / 4),
        base64Data: att.base64Data,
        emailIndex: emailIdx,
      });
    }

    if (hasBody || emailValidAtts.length > 0) {
      validEmails.push(email);
      validatedAttachments.push(...emailValidAtts);
    }
  }

  if (validEmails.length === 0) {
    throw Object.assign(
      new Error('Please paste email text or attach at least one PDF/photo to summarize.'),
      { status: 400 }
    );
  }
  if (validEmails.length > 20) {
    throw Object.assign(new Error('Please submit up to 20 emails per batch.'), { status: 400 });
  }
  if (validatedAttachments.length > 12) {
    throw Object.assign(new Error('Please attach up to 12 files per batch.'), { status: 400 });
  }

  const referenceDate =
    typeof body.referenceDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(body.referenceDate)
      ? body.referenceDate
      : new Date().toISOString().slice(0, 10);

  return {
    validEmails,
    validatedAttachments,
    skippedAttachments,
    referenceDate,
    childName: body.childName,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '25mb' }));

  app.get('/api/health', (_req: Request, res: Response) => {
    res.json({
      ok: true,
      model: MODEL_NAME,
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
    });
  });

  app.get('/api/check-connection', async (_req: Request, res: Response) => {
    const modelsToTest = ['gemini-3.1-flash-lite', 'gemini-4-hydrogen'] as const;
    const results: Array<{
      model: string;
      ok: boolean;
      elapsedMs: number;
      status?: number;
      error?: string;
    }> = [];

    for (const model of modelsToTest) {
      const t0 = Date.now();
      try {
        const ai = getGeminiClient();
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 12000);
        try {
          const r = await ai.models.generateContent({
            model,
            contents: 'Reply with JSON: {"pong": true}',
            config: {
              responseMimeType: 'application/json',
              abortSignal: controller.signal,
              thinkingConfig: {
                thinkingLevel:
                  model === 'gemini-3.1-flash-lite'
                    ? ThinkingLevel.MINIMAL
                    : ThinkingLevel.LOW,
              },
            },
          });
          results.push({
            model,
            ok: Boolean(r.text),
            elapsedMs: Date.now() - t0,
          });
        } finally {
          clearTimeout(timer);
        }
      } catch (err: unknown) {
        const e = err as { status?: number; message?: string; name?: string };
        results.push({
          model,
          ok: false,
          elapsedMs: Date.now() - t0,
          status: e?.status,
          error:
            e?.name === 'AbortError'
              ? 'Timed out after 12s'
              : e?.message || 'Unknown error',
        });
      }
    }

    res.json({
      hasApiKey: Boolean(process.env.GEMINI_API_KEY),
      results,
    });
  });

  // Live SSE streaming endpoint with real step-by-step logs, multimodal PDF/photo support, and streaming chunks
  app.post('/api/summarize-stream', async (req: Request, res: Response) => {
    const startedAt = Date.now();
    let closed = false;
    const abortController = new AbortController();
    const timeoutId = setTimeout(() => {
      abortController.abort(new Error('Model request timed out after 45 seconds.'));
    }, 45000);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache, no-transform');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Accel-Buffering', 'no');
    res.flushHeaders?.();

    res.on('close', () => {
      if (!res.writableEnded) {
        closed = true;
        abortController.abort(new Error('Client disconnected'));
      }
    });

    const sendEvent = (event: string, data: unknown) => {
      if (closed || res.writableEnded) return;
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const emitLog = (level: 'info' | 'warn' | 'error' | 'success', step: string, message: string) => {
      sendEvent('log', {
        id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        level,
        step,
        message,
        elapsedMs: Date.now() - startedAt,
      });
    };

    try {
      emitLog('info', 'Validate', 'Received request on /api/summarize-stream. Validating emails & attachments...');
      const reqBody = req.body as SummarizeRequestBody;
      const {
        validEmails,
        validatedAttachments,
        skippedAttachments,
        referenceDate,
        childName,
      } = parseAndValidateRequest(reqBody);

      const selectedModel =
        reqBody.model === 'gemini-4-hydrogen' ? 'gemini-4-hydrogen' : MODEL_NAME;
      const thinkingLevel =
        selectedModel === 'gemini-3.1-flash-lite'
          ? ThinkingLevel.MINIMAL
          : ThinkingLevel.LOW;

      const totalChars = validEmails.reduce((sum, e) => sum + (e.body || '').trim().length, 0);
      emitLog(
        'info',
        'Prepare',
        `Validated ${validEmails.length} email(s) (${totalChars.toLocaleString()} text chars). Reference date: ${referenceDate}.`
      );

      if (validatedAttachments.length > 0) {
        const listDesc = validatedAttachments
          .map((a) => `${a.name} (${Math.max(1, Math.round(a.sizeBytes / 1024))} KB)`)
          .join(', ');
        emitLog(
          'info',
          'Attach',
          `Encoded ${validatedAttachments.length} multimodal attachment(s): ${listDesc}.`
        );
      }
      if (skippedAttachments.length > 0) {
        emitLog('warn', 'Attach', `Skipped ${skippedAttachments.length} file(s): ${skippedAttachments.join(', ')}.`);
      }

      const ai = getGeminiClient();
      emitLog('info', 'Auth', 'Server-side Gemini API key detected. Preparing multimodal payload & JSON schema.');

      const contents = buildMultimodalContents(
        validEmails,
        validatedAttachments,
        referenceDate,
        childName
      );
      emitLog(
        'info',
        'Model',
        `Sending streaming request to ${selectedModel} (ThinkingLevel.${thinkingLevel})...`
      );

      const heartbeat = setInterval(() => {
        if (!closed && !res.writableEnded) {
          emitLog(
            'info',
            'Waiting',
            `Waiting on ${selectedModel} response (${((Date.now() - startedAt) / 1000).toFixed(1)}s elapsed)...`
          );
        }
      }, 4000);

      let fullText = '';
      let chunksReceived = 0;
      let firstChunkLogged = false;

      try {
        const stream = await ai.models.generateContentStream({
          model: selectedModel,
          contents,
          config: {
            systemInstruction: SYSTEM_INSTRUCTION,
            responseMimeType: 'application/json',
            responseSchema: RESPONSE_SCHEMA,
            thinkingConfig: { thinkingLevel },
            abortSignal: abortController.signal,
          },
        });

        for await (const chunk of stream) {
          if (closed) break;
          const piece = chunk.text ?? '';
          if (piece) {
            chunksReceived += 1;
            fullText += piece;
            if (!firstChunkLogged) {
              firstChunkLogged = true;
              clearInterval(heartbeat);
              emitLog(
                'info',
                'Streaming',
                `First JSON chunk received in ${Date.now() - startedAt} ms. Streaming structured output...`
              );
            }
            sendEvent('progress', {
              chunks: chunksReceived,
              chars: fullText.length,
              elapsedMs: Date.now() - startedAt,
            });
          }
        }
      } finally {
        clearInterval(heartbeat);
      }

      if (closed) {
        return;
      }

      emitLog(
        'info',
        'Parse',
        `Stream finished (${chunksReceived} chunks, ${fullText.length.toLocaleString()} chars). Parsing structured JSON...`
      );

      if (!fullText.trim()) {
        throw Object.assign(new Error('Model returned an empty response.'), { status: 502 });
      }

      const normalized = normalizeDigestResponse(fullText, referenceDate);

      if (normalized.attachmentInsights.length > 0) {
        for (const insight of normalized.attachmentInsights) {
          emitLog(
            'info',
            'Vision',
            `${insight.fileName} (${insight.contentType}): ${insight.whatWasSeen} -> ${insight.extractedRelevance}`
          );
        }
      }

      emitLog(
        'success',
        'Complete',
        `Extracted ${normalized.deadlines.length} deadline(s), ${normalized.actions.length} action(s), ${normalized.events.length} event(s), and ${normalized.attachmentInsights.length} attachment insight(s) in ${((Date.now() - startedAt) / 1000).toFixed(2)}s.`
      );

      sendEvent('result', normalized);
      res.end();
    } catch (error: unknown) {
      console.error('Error in /api/summarize-stream:', error);
      const errObj = error as { status?: number; message?: string; name?: string };
      const isTimeout =
        errObj?.name === 'AbortError' ||
        (abortController.signal.aborted &&
          String(abortController.signal.reason || '').includes('timed out'));
      const statusCode = isTimeout
        ? 504
        : typeof errObj?.status === 'number' && errObj.status >= 400 && errObj.status < 600
        ? errObj.status
        : 500;
      const message = isTimeout
        ? 'The Gemini API request timed out after 45 seconds. Try attaching fewer or smaller files and retrying.'
        : errObj?.message || 'Failed to summarize school emails. Please check your input and try again.';

      emitLog('error', `Error ${statusCode}`, message);
      sendEvent('error', { statusCode, message, elapsedMs: Date.now() - startedAt });
      res.end();
    } finally {
      clearTimeout(timeoutId);
    }
  });

  // Standard JSON endpoint (multimodal + fast ThinkingLevel.MINIMAL)
  app.post('/api/summarize', async (req: Request, res: Response) => {
    try {
      const { validEmails, validatedAttachments, referenceDate, childName } =
        parseAndValidateRequest(req.body as SummarizeRequestBody);
      const ai = getGeminiClient();
      const contents = buildMultimodalContents(
        validEmails,
        validatedAttachments,
        referenceDate,
        childName
      );

      const response = await ai.models.generateContent({
        model: MODEL_NAME,
        contents,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          responseMimeType: 'application/json',
          responseSchema: RESPONSE_SCHEMA,
          thinkingConfig: { thinkingLevel: ThinkingLevel.MINIMAL },
        },
      });

      const normalized = normalizeDigestResponse(response.text ?? '{}', referenceDate);
      return res.json(normalized);
    } catch (error: unknown) {
      console.error('Error in /api/summarize:', error);
      const errObj = error as { status?: number; message?: string };
      const message =
        errObj?.message || 'Failed to summarize school emails. Please check your input and try again.';
      const statusCode =
        typeof errObj?.status === 'number' && errObj.status >= 400 && errObj.status < 600
          ? errObj.status
          : 500;
      return res.status(statusCode).json({ error: message });
    }
  });

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req: Request, res: Response) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`SchoolPulse HA server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
