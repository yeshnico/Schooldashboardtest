import { useEffect, useRef, useState } from 'react';
import {
  Code2,
  LayoutDashboard,
  Mail,
  Menu,
  Sparkles,
  X,
} from 'lucide-react';
import { EmailWorkbench } from './components/EmailWorkbench';
import { HomeAssistantPreview } from './components/HomeAssistantPreview';
import { AppsScriptStudio } from './components/AppsScriptStudio';
import { createBlankEmail, createSampleEmails } from './data/sampleEmails';
import type {
  AppsScriptConfig,
  EmailInput,
  ExtractionLogEntry,
  LogLevel,
  SchoolDigestResult,
  StreamProgress,
} from './types/school';
import { slugifySensor } from './utils/haGenerators';

type WorkspaceView = 'summarizer' | 'preview' | 'setup';

const INITIAL_EMAIL = createBlankEmail();

const DEFAULT_CONFIG: AppsScriptConfig = {
  schoolSenders: 'office@yourschool.edu',
  gmailLabel: 'School',
  useLabelFilter: true,
  webhookBaseUrl: 'https://your-instance.ui.nabu.casa',
  webhookId: 'school_email_digest',
  sensorName: 'School Digest',
  pollInterval: '30min',
  lookbackDays: 14,
  includeAttachments: true,
  maxAttachmentSizeMb: 5,
  enableTodoSync: true,
  todoEntityId: 'todo.school_actions',
  enableMobileNotify: true,
  notifyService: 'notify.mobile_app_phone',
  childContext: '',
};

const NAV_ITEMS: Array<{
  id: WorkspaceView;
  label: string;
  breadcrumb: string;
  icon: typeof Mail;
}> = [
  {
    id: 'summarizer',
    label: 'Email Summarizer',
    breadcrumb: 'Email Summarizer',
    icon: Mail,
  },
  {
    id: 'preview',
    label: 'Dashboard Preview',
    breadcrumb: 'Dashboard Preview',
    icon: LayoutDashboard,
  },
  {
    id: 'setup',
    label: 'Apps Script & YAML',
    breadcrumb: 'Apps Script & YAML',
    icon: Code2,
  },
];

export default function App() {
  const [view, setView] = useState<WorkspaceView>('summarizer');
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [emails, setEmails] = useState<EmailInput[]>([INITIAL_EMAIL]);
  const [activeEmailId, setActiveEmailId] = useState<string>(INITIAL_EMAIL.id);
  const [config, setConfig] = useState<AppsScriptConfig>(DEFAULT_CONFIG);
  const [sendersManuallyEdited, setSendersManuallyEdited] = useState(false);

  const [result, setResult] = useState<SchoolDigestResult | null>(null);
  const [isSummarizing, setIsSummarizing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [logs, setLogs] = useState<ExtractionLogEntry[]>([]);
  const [streamProgress, setStreamProgress] = useState<StreamProgress | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const abortControllerRef = useRef<AbortController | null>(null);
  const startTimeRef = useRef<number>(0);

  useEffect(() => {
    if (!isSummarizing) return;
    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startTimeRef.current);
    }, 100);
    return () => window.clearInterval(timer);
  }, [isSummarizing]);

  const appendClientLog = (level: LogLevel, step: string, message: string) => {
    const now = Date.now();
    setLogs((prev) => [
      ...prev,
      {
        id: `cli-${now}-${Math.random().toString(36).slice(2, 6)}`,
        timestamp: new Date().toISOString(),
        level,
        step,
        message,
        elapsedMs: startTimeRef.current ? now - startTimeRef.current : 0,
      },
    ]);
  };

  const syncSendersFromEmails = (updatedEmails: EmailInput[]) => {
    if (sendersManuallyEdited) return;
    const uniqueSenders = Array.from(
      new Set(
        updatedEmails
          .map((e) => e.sender.trim())
          .filter((s) => s.length > 0 && s.includes('@'))
      )
    );
    if (uniqueSenders.length > 0) {
      setConfig((prev) => ({ ...prev, schoolSenders: uniqueSenders.join(', ') }));
    }
  };

  const handleUpdateEmail = (id: string, patch: Partial<EmailInput>) => {
    setEmails((prev) => {
      const next = prev.map((e) => (e.id === id ? { ...e, ...patch } : e));
      if (patch.sender !== undefined) {
        syncSendersFromEmails(next);
      }
      return next;
    });
  };

  const handleAddEmail = () => {
    const fresh = createBlankEmail();
    setEmails((prev) => [...prev, fresh]);
    setActiveEmailId(fresh.id);
  };

  const handleRemoveEmail = (id: string) => {
    setEmails((prev) => {
      const remaining = prev.filter((e) => e.id !== id);
      if (remaining.length === 0) {
        const blank = createBlankEmail();
        setActiveEmailId(blank.id);
        return [blank];
      }
      if (activeEmailId === id) {
        setActiveEmailId(remaining[0].id);
      }
      return remaining;
    });
  };

  const handleLoadSamples = () => {
    const samples = createSampleEmails();
    setEmails(samples);
    setActiveEmailId(samples[0].id);
    setError(null);
    syncSendersFromEmails(samples);
  };

  const handleClearEmails = () => {
    const blank = createBlankEmail();
    setEmails([blank]);
    setActiveEmailId(blank.id);
    setResult(null);
    setError(null);
  };

  const handleChangeConfig = (patch: Partial<AppsScriptConfig>) => {
    if (patch.schoolSenders !== undefined) {
      setSendersManuallyEdited(true);
    }
    setConfig((prev) => ({ ...prev, ...patch }));
  };

  const handleCancelSummarize = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsSummarizing(false);
    appendClientLog('warn', 'Cancel', 'Extraction cancelled by user.');
  };

  const handleSummarize = async () => {
    const nonEmpty = emails.filter(
      (e) => e.body.trim().length > 0 || e.attachments.length > 0
    );
    if (nonEmpty.length === 0) {
      setError('Paste at least one school email or attach a PDF/photo before running extraction.');
      return;
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    startTimeRef.current = Date.now();

    setIsSummarizing(true);
    setError(null);
    setStreamProgress(null);
    setElapsedMs(0);
    const totalAtts = nonEmpty.reduce((sum, e) => sum + e.attachments.length, 0);
    setLogs([
      {
        id: `cli-start-${Date.now()}`,
        timestamp: new Date().toISOString(),
        level: 'info',
        step: 'Client',
        message: `POST /api/summarize-stream with ${nonEmpty.length} email(s)${
          totalAtts > 0 ? ` and ${totalAtts} attachment(s)` : ''
        }...`,
        elapsedMs: 0,
      },
    ]);

    try {
      const response = await fetch('/api/summarize-stream', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: controller.signal,
        body: JSON.stringify({
          emails: nonEmpty,
          referenceDate: new Date().toISOString().slice(0, 10),
          childName: config.childContext,
        }),
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`HTTP ${response.status}: ${text || response.statusText}`);
      }

      if (!response.body) {
        throw new Error('Server did not return a readable stream.');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let receivedResult = false;
      let receivedError = false;

      const processBlock = (rawBlock: string) => {
        const lines = rawBlock.split('\n');
        let eventName = 'message';
        const dataLines: string[] = [];

        for (const line of lines) {
          if (line.startsWith('event:')) {
            eventName = line.slice(6).trim();
          } else if (line.startsWith('data:')) {
            dataLines.push(line.slice(5).trim());
          }
        }

        if (dataLines.length === 0) return;
        const payloadStr = dataLines.join('\n');

        try {
          const parsed = JSON.parse(payloadStr);
          if (eventName === 'log') {
            setLogs((prev) => [...prev, parsed as ExtractionLogEntry]);
          } else if (eventName === 'progress') {
            setStreamProgress(parsed as StreamProgress);
          } else if (eventName === 'result') {
            receivedResult = true;
            setResult(parsed as SchoolDigestResult);
          } else if (eventName === 'error') {
            receivedError = true;
            setError(String(parsed?.message || 'Extraction failed on the server.'));
          }
        } catch {
          appendClientLog('warn', 'Stream', `Unparsed stream message: ${payloadStr.slice(0, 120)}`);
        }
      };

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const blocks = buffer.split('\n\n');
        buffer = blocks.pop() ?? '';
        for (const block of blocks) {
          if (block.trim()) {
            processBlock(block);
          }
        }
      }

      if (buffer.trim()) {
        processBlock(buffer);
      }

      if (!receivedResult && !receivedError) {
        const msg = 'Connection closed before the extraction result arrived.';
        appendClientLog('error', 'Stream', msg);
        setError(msg);
      }
    } catch (err: unknown) {
      if ((err as { name?: string })?.name === 'AbortError') {
        return;
      }
      const msg =
        err instanceof Error ? err.message : 'Unable to summarize emails. Please try again.';
      appendClientLog('error', 'Client', msg);
      setError(msg);
    } finally {
      if (abortControllerRef.current === controller) {
        abortControllerRef.current = null;
      }
      setElapsedMs(Date.now() - startTimeRef.current);
      setIsSummarizing(false);
    }
  };

  const handleToggleDeadline = (id: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        deadlines: prev.deadlines.map((d) =>
          d.id === id ? { ...d, completed: !d.completed } : d
        ),
      };
    });
  };

  const handleToggleAction = (id: string) => {
    setResult((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        actions: prev.actions.map((a) =>
          a.id === id ? { ...a, completed: !a.completed } : a
        ),
      };
    });
  };

  const activeNav = NAV_ITEMS.find((item) => item.id === view) ?? NAV_ITEMS[0];
  const nonEmptyCount = emails.filter(
    (e) => e.body.trim().length > 0 || e.attachments.length > 0
  ).length;
  const openDeadlinesCount = result
    ? result.deadlines.filter((d) => !d.completed).length
    : 0;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Brand Wordmark */}
      <div className="h-14 px-5 flex items-center justify-between border-b border-slate-200 shrink-0">
        <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          SchoolPulse HA
        </span>
        <button
          type="button"
          onClick={() => setMobileNavOpen(false)}
          aria-label="Close navigation menu"
          className="lg:hidden p-1.5 text-slate-500 hover:text-slate-900 rounded-md cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation Links */}
      <nav className="flex-1 p-3 space-y-1" aria-label="Workspace navigation">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = view === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setView(item.id);
                setMobileNavOpen(false);
              }}
              className={`w-full px-3 py-2.5 text-sm font-medium rounded-lg flex items-center justify-between gap-2 transition-colors whitespace-nowrap cursor-pointer ${
                isActive
                  ? 'bg-sky-50 text-sky-800'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80'
              }`}
            >
              <span className="flex items-center gap-2.5">
                <Icon className="w-4 h-4 shrink-0" />
                <span>{item.label}</span>
              </span>
              {item.id === 'preview' && result && (
                <span className="text-xs font-mono tabular-nums text-slate-500">
                  {openDeadlinesCount}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Quiet Workspace Context Footer */}
      <div className="p-4 border-t border-slate-200 text-xs text-slate-500 space-y-1.5">
        <div className="font-medium text-slate-700">Target Home Assistant Entity</div>
        <div className="font-mono text-[11px] text-slate-600 truncate">
          sensor.{slugifySensor(config.sensorName)}
        </div>
        <div className="text-[11px] text-slate-500 truncate">
          {config.useLabelFilter
            ? `Gmail label · ${config.gmailLabel || 'School'}`
            : `Sender · ${config.schoolSenders || 'Unset'}`}
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 flex">
      {/* Desktop Sidebar */}
      <aside className="hidden lg:block w-64 shrink-0 bg-white border-r border-slate-200 sticky top-0 h-screen">
        {sidebarContent}
      </aside>

      {/* Mobile Drawer */}
      {mobileNavOpen && (
        <div className="fixed inset-0 z-50 lg:hidden flex">
          <div
            className="fixed inset-0 bg-slate-900/40"
            onClick={() => setMobileNavOpen(false)}
            aria-hidden="true"
          />
          <aside className="relative w-64 max-w-[80vw] bg-white h-full border-r border-slate-200 z-10">
            {sidebarContent}
          </aside>
        </div>
      )}

      {/* Main Content Shell */}
      <div className="flex-1 min-w-0 flex flex-col">
        {/* Top Bar Contract: Breadcrumb on left, 1 primary action on right */}
        <header className="h-14 bg-white border-b border-slate-200 px-4 sm:px-6 flex items-center justify-between gap-6 sticky top-0 z-20">
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Open navigation menu"
              className="lg:hidden p-1.5 text-slate-600 hover:text-slate-900 rounded-md cursor-pointer"
            >
              <Menu className="w-5 h-5" />
            </button>
            <div className="flex items-center gap-2 text-sm truncate">
              <span className="text-slate-400 hidden sm:inline">SchoolPulse HA</span>
              <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
                /
              </span>
              <h1 className="font-semibold text-slate-900 truncate">{activeNav.breadcrumb}</h1>
            </div>
          </div>

          <div className="shrink-0">
            {view === 'summarizer' && (
              <button
                type="button"
                onClick={handleSummarize}
                disabled={isSummarizing || nonEmptyCount === 0}
                className="px-4 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span>
                  {isSummarizing
                    ? `Extracting (${(elapsedMs / 1000).toFixed(1)}s)`
                    : 'Extract & Summarize'}
                </span>
              </button>
            )}
            {view === 'preview' && (
              <button
                type="button"
                onClick={() => setView('setup')}
                className="px-4 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Configure Apps Script
              </button>
            )}
            {view === 'setup' && (
              <button
                type="button"
                onClick={() => setView('summarizer')}
                className="px-4 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Back to Email Summarizer
              </button>
            )}
          </div>
        </header>

        {/* Main Viewport */}
        <main className="flex-1 p-4 sm:p-6 max-w-[1440px] w-full mx-auto">
          {view === 'summarizer' && (
            <EmailWorkbench
              emails={emails}
              activeEmailId={activeEmailId}
              onSelectEmail={setActiveEmailId}
              onUpdateEmail={handleUpdateEmail}
              onAddEmail={handleAddEmail}
              onRemoveEmail={handleRemoveEmail}
              onLoadSamples={handleLoadSamples}
              onClearEmails={handleClearEmails}
              childContext={config.childContext}
              onChangeChildContext={(val) => handleChangeConfig({ childContext: val })}
              result={result}
              isSummarizing={isSummarizing}
              error={error}
              logs={logs}
              streamProgress={streamProgress}
              elapsedMs={elapsedMs}
              onSummarize={handleSummarize}
              onCancelSummarize={handleCancelSummarize}
              onClearLogs={() => setLogs([])}
              onToggleDeadline={handleToggleDeadline}
              onToggleAction={handleToggleAction}
              onOpenDashboardPreview={() => setView('preview')}
            />
          )}

          {view === 'preview' && (
            <HomeAssistantPreview
              result={result}
              config={config}
              onToggleAction={handleToggleAction}
              onGoToSummarizer={() => setView('summarizer')}
              onGoToSetup={() => setView('setup')}
            />
          )}

          {view === 'setup' && (
            <AppsScriptStudio
              config={config}
              onChangeConfig={handleChangeConfig}
            />
          )}
        </main>
      </div>
    </div>
  );
}
