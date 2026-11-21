import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertCircle,
  ArrowRight,
  Calendar,
  Check,
  CheckSquare,
  ChevronDown,
  ChevronUp,
  Clock,
  Copy,
  FileText,
  Image as ImageIcon,
  Mail,
  Paperclip,
  Plus,
  RotateCcw,
  Search,
  Sparkles,
  Square,
  Terminal,
  Trash2,
  X,
  XCircle,
} from 'lucide-react';
import type {
  DeadlineUrgency,
  EmailAttachment,
  EmailInput,
  ExtractionLogEntry,
  SchoolDigestResult,
  StreamProgress,
} from '../types/school';

interface EmailWorkbenchProps {
  emails: EmailInput[];
  activeEmailId: string;
  onSelectEmail: (id: string) => void;
  onUpdateEmail: (id: string, patch: Partial<EmailInput>) => void;
  onAddEmail: () => void;
  onRemoveEmail: (id: string) => void;
  onLoadSamples: () => void;
  onClearEmails: () => void;
  childContext: string;
  onChangeChildContext: (val: string) => void;
  result: SchoolDigestResult | null;
  isSummarizing: boolean;
  error: string | null;
  logs: ExtractionLogEntry[];
  streamProgress: StreamProgress | null;
  elapsedMs: number;
  onSummarize: () => void;
  onCancelSummarize: () => void;
  onClearLogs: () => void;
  onToggleDeadline: (id: string) => void;
  onToggleAction: (id: string) => void;
  onOpenDashboardPreview: () => void;
}

type ResultTab = 'all' | 'deadlines' | 'actions' | 'events' | 'attachments' | 'emails';

const URGENCY_META: Record<DeadlineUrgency, { label: string; textClass: string }> = {
  overdue: { label: 'Overdue', textClass: 'text-red-700 font-semibold' },
  urgent: { label: 'Urgent', textClass: 'text-amber-700 font-semibold' },
  upcoming: { label: 'Upcoming', textClass: 'text-sky-700 font-medium' },
  normal: { label: 'Scheduled', textClass: 'text-slate-600 font-medium' },
};

export const EmailWorkbench: React.FC<EmailWorkbenchProps> = ({
  emails,
  activeEmailId,
  onSelectEmail,
  onUpdateEmail,
  onAddEmail,
  onRemoveEmail,
  onLoadSamples,
  onClearEmails,
  childContext,
  onChangeChildContext,
  result,
  isSummarizing,
  error,
  logs,
  streamProgress,
  elapsedMs,
  onSummarize,
  onCancelSummarize,
  onClearLogs,
  onToggleDeadline,
  onToggleAction,
  onOpenDashboardPreview,
}) => {
  const [resultTab, setResultTab] = useState<ResultTab>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [logsOpen, setLogsOpen] = useState(false);
  const [copiedLogs, setCopiedLogs] = useState(false);
  const logEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (isSummarizing || error) {
      setLogsOpen(true);
    }
  }, [isSummarizing, error]);

  useEffect(() => {
    if (logsOpen && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [logs.length, logsOpen]);

  const handleCopyLogs = async () => {
    const text = logs
      .map(
        (l) =>
          `[${(l.elapsedMs / 1000).toFixed(2)}s] [${l.level.toUpperCase()}] [${l.step}] ${l.message}`
      )
      .join('\n');
    await navigator.clipboard.writeText(text);
    setCopiedLogs(true);
    setTimeout(() => setCopiedLogs(false), 1800);
  };

  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [isDraggingFiles, setIsDraggingFiles] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const activeEmail = useMemo(
    () => emails.find((e) => e.id === activeEmailId) ?? emails[0],
    [emails, activeEmailId]
  );

  const nonEmptyEmailCount = useMemo(
    () => emails.filter((e) => e.body.trim().length > 0 || e.attachments.length > 0).length,
    [emails]
  );

  const totalAttachmentsCount = useMemo(
    () => emails.reduce((sum, e) => sum + e.attachments.length, 0),
    [emails]
  );

  const handleAttachFiles = async (fileList: FileList | null) => {
    if (!fileList || !activeEmail) return;
    setAttachmentError(null);

    const allowed = new Set([
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/gif',
    ]);
    const maxBytes = 8 * 1024 * 1024;
    const maxPerEmail = 6;

    const existing = activeEmail.attachments || [];
    const added: EmailAttachment[] = [];
    const warnings: string[] = [];

    for (const file of Array.from(fileList)) {
      if (existing.length + added.length >= maxPerEmail) {
        warnings.push(`Up to ${maxPerEmail} attachments per email.`);
        break;
      }
      if (!allowed.has(file.type)) {
        warnings.push(`${file.name}: unsupported format (use PDF, JPG, PNG, WebP, or GIF).`);
        continue;
      }
      if (file.size > maxBytes) {
        warnings.push(`${file.name}: exceeds 8 MB limit.`);
        continue;
      }

      const base64Data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const raw = String(reader.result || '');
          const idx = raw.indexOf(',');
          resolve(idx >= 0 ? raw.slice(idx + 1) : raw);
        };
        reader.onerror = () => reject(new Error(`Could not read ${file.name}`));
        reader.readAsDataURL(file);
      });

      added.push({
        id: `att-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        name: file.name,
        mimeType: file.type,
        sizeBytes: file.size,
        base64Data,
      });
    }

    if (added.length > 0) {
      onUpdateEmail(activeEmail.id, {
        attachments: [...existing, ...added],
      });
    }
    if (warnings.length > 0) {
      setAttachmentError(warnings.join(' '));
    }
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (attId: string) => {
    if (!activeEmail) return;
    onUpdateEmail(activeEmail.id, {
      attachments: activeEmail.attachments.filter((a) => a.id !== attId),
    });
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const normalizedQuery = searchQuery.trim().toLowerCase();

  const filteredDeadlines = useMemo(() => {
    if (!result) return [];
    if (!normalizedQuery) return result.deadlines;
    return result.deadlines.filter(
      (d) =>
        d.title.toLowerCase().includes(normalizedQuery) ||
        d.actionRequired.toLowerCase().includes(normalizedQuery) ||
        d.category.toLowerCase().includes(normalizedQuery) ||
        d.dueDate.toLowerCase().includes(normalizedQuery)
    );
  }, [result, normalizedQuery]);

  const filteredActions = useMemo(() => {
    if (!result) return [];
    if (!normalizedQuery) return result.actions;
    return result.actions.filter(
      (a) =>
        a.task.toLowerCase().includes(normalizedQuery) ||
        a.details.toLowerCase().includes(normalizedQuery) ||
        a.when.toLowerCase().includes(normalizedQuery) ||
        a.category.toLowerCase().includes(normalizedQuery)
    );
  }, [result, normalizedQuery]);

  const filteredEvents = useMemo(() => {
    if (!result) return [];
    if (!normalizedQuery) return result.events;
    return result.events.filter(
      (e) =>
        e.title.toLowerCase().includes(normalizedQuery) ||
        e.notes.toLowerCase().includes(normalizedQuery) ||
        e.location.toLowerCase().includes(normalizedQuery) ||
        e.date.toLowerCase().includes(normalizedQuery)
    );
  }, [result, normalizedQuery]);

  const uploadedAttachmentMap = useMemo(() => {
    const map = new Map<string, EmailAttachment>();
    for (const email of emails) {
      for (const att of email.attachments) {
        map.set(att.name.toLowerCase(), att);
      }
    }
    return map;
  }, [emails]);

  const metrics = useMemo(() => {
    if (!result) {
      return { urgent: 0, deadlines: 0, actions: 0, events: 0 };
    }
    const openDeadlines = result.deadlines.filter((d) => !d.completed);
    const urgent = openDeadlines.filter(
      (d) => d.urgency === 'overdue' || d.urgency === 'urgent'
    ).length;
    const openActions = result.actions.filter((a) => !a.completed).length;
    return {
      urgent,
      deadlines: openDeadlines.length,
      actions: openActions,
      events: result.events.length,
    };
  }, [result]);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left Column: Paste School Emails */}
      <section className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">School Emails Input</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Paste one or more emails from your child&apos;s school to test extraction.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={onLoadSamples}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Load Samples
            </button>
            <button
              type="button"
              onClick={onClearEmails}
              className="px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:text-slate-900 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Clear all emails and start fresh"
            >
              Clear
            </button>
          </div>
        </div>

        {/* Batch tabs */}
        <div className="px-5 pt-3.5 pb-3 border-b border-slate-100 bg-slate-50/70">
          <div className="flex items-center gap-2 flex-wrap">
            {emails.map((email, idx) => {
              const isSelected = activeEmail && email.id === activeEmail.id;
              const hasContent = email.body.trim().length > 0 || email.attachments.length > 0;
              return (
                <button
                  key={email.id}
                  type="button"
                  onClick={() => onSelectEmail(email.id)}
                  className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors whitespace-nowrap shrink-0 flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-slate-900 text-white'
                      : 'bg-white text-slate-700 border border-slate-200 hover:border-slate-300'
                  }`}
                >
                  <Mail className="w-3.5 h-3.5 opacity-75" />
                  <span>Email {idx + 1}</span>
                  {email.attachments.length > 0 && (
                    <span className={`font-mono text-[11px] ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}>
                      · {email.attachments.length} file{email.attachments.length === 1 ? '' : 's'}
                    </span>
                  )}
                  {hasContent && email.attachments.length === 0 && !isSelected && (
                    <span className="text-slate-400 font-normal">· Ready</span>
                  )}
                </button>
              );
            })}
            <button
              type="button"
              onClick={onAddEmail}
              className="px-2.5 py-1.5 text-xs font-medium text-sky-700 hover:bg-sky-50 rounded-lg transition-colors flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Email</span>
            </button>
          </div>
        </div>

        {/* Active Email Editor */}
        {activeEmail && (
          <div className="p-5 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label
                  htmlFor="email-sender"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  From (School Address)
                </label>
                <input
                  id="email-sender"
                  type="text"
                  value={activeEmail.sender}
                  onChange={(e) => onUpdateEmail(activeEmail.id, { sender: e.target.value })}
                  placeholder="office@yourschool.edu"
                  className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                />
              </div>
              <div>
                <label
                  htmlFor="email-date"
                  className="block text-xs font-medium text-slate-700 mb-1"
                >
                  Date Received
                </label>
                <input
                  id="email-date"
                  type="date"
                  value={activeEmail.date}
                  onChange={(e) => onUpdateEmail(activeEmail.id, { date: e.target.value })}
                  className="w-full px-3 py-2 text-sm font-mono tabular-nums bg-white border border-slate-200 rounded-lg text-slate-900 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                />
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-1">
                <label
                  htmlFor="email-subject"
                  className="block text-xs font-medium text-slate-700"
                >
                  Subject Line
                </label>
                {emails.length > 1 && (
                  <button
                    type="button"
                    onClick={() => onRemoveEmail(activeEmail.id)}
                    className="text-xs text-slate-400 hover:text-red-600 flex items-center gap-1 transition-colors cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Remove email</span>
                  </button>
                )}
              </div>
              <input
                id="email-subject"
                type="text"
                value={activeEmail.subject}
                onChange={(e) => onUpdateEmail(activeEmail.id, { subject: e.target.value })}
                placeholder="e.g. Weekly Newsletter — Field Trip & Book Fair"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
              />
            </div>

            <div>
              <label
                htmlFor="email-body"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Email Body
              </label>
              <textarea
                id="email-body"
                rows={8}
                value={activeEmail.body}
                onChange={(e) => onUpdateEmail(activeEmail.id, { body: e.target.value })}
                placeholder="Paste the full text of the email from your child's school here (or attach a PDF flyer / photo below)..."
                className="w-full px-3 py-2.5 text-sm leading-relaxed bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600 resize-y"
              />
            </div>

            {/* PDF & Photo Attachments */}
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-xs font-medium text-slate-700 flex items-center gap-1.5">
                  <Paperclip className="w-3.5 h-3.5 text-slate-500" />
                  <span>Attachments (PDFs, Flyers &amp; Photos)</span>
                </label>
                <span className="text-[11px] text-slate-400 tabular-nums">
                  {activeEmail.attachments.length} / 6 files
                </span>
              </div>

              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(true);
                }}
                onDragLeave={() => setIsDraggingFiles(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingFiles(false);
                  void handleAttachFiles(e.dataTransfer.files);
                }}
                className={`border border-dashed rounded-lg px-3.5 py-3 transition-colors ${
                  isDraggingFiles
                    ? 'border-sky-600 bg-sky-50/60'
                    : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="application/pdf,image/jpeg,image/png,image/webp,image/gif"
                  onChange={(e) => void handleAttachFiles(e.target.files)}
                  className="hidden"
                />
                <div className="flex items-center justify-between gap-3">
                  <div className="text-xs text-slate-600">
                    Drop school PDFs, permission slips, or photos here (max 8 MB each).
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-100 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    Attach Files
                  </button>
                </div>

                {attachmentError && (
                  <p className="text-xs text-red-700 mt-2">{attachmentError}</p>
                )}

                {activeEmail.attachments.length > 0 && (
                  <ul className="mt-3 pt-2.5 border-t border-slate-200 divide-y divide-slate-200/80">
                    {activeEmail.attachments.map((att) => {
                      const isImage = att.mimeType.startsWith('image/');
                      return (
                        <li
                          key={att.id}
                          className="py-2 flex items-center justify-between gap-3 text-xs"
                        >
                          <div className="flex items-center gap-2.5 min-w-0">
                            {isImage ? (
                              <img
                                src={`data:${att.mimeType};base64,${att.base64Data}`}
                                alt={att.name}
                                className="w-8 h-8 rounded object-cover border border-slate-200 shrink-0"
                              />
                            ) : (
                              <div className="w-8 h-8 rounded bg-white border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                                {att.mimeType === 'application/pdf' ? (
                                  <FileText className="w-4 h-4" />
                                ) : (
                                  <ImageIcon className="w-4 h-4" />
                                )}
                              </div>
                            )}
                            <div className="min-w-0">
                              <div className="font-medium text-slate-800 truncate">{att.name}</div>
                              <div className="text-[11px] text-slate-500 font-mono tabular-nums">
                                {att.mimeType === 'application/pdf' ? 'PDF' : att.mimeType.replace('image/', '').toUpperCase()} · {formatFileSize(att.sizeBytes)}
                              </div>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveAttachment(att.id)}
                            aria-label={`Remove ${att.name}`}
                            className="p-1 text-slate-400 hover:text-red-600 rounded transition-colors cursor-pointer shrink-0"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>

            <div className="pt-2 border-t border-slate-100">
              <label
                htmlFor="child-context"
                className="block text-xs font-medium text-slate-700 mb-1"
              >
                Child / Grade Filter Context (Optional)
              </label>
              <input
                id="child-context"
                type="text"
                value={childContext}
                onChange={(e) => onChangeChildContext(e.target.value)}
                placeholder="e.g. Year 4, Ms. Patel's class — highlight items relevant to Year 4"
                className="w-full px-3 py-2 text-sm bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
              />
            </div>

            <div className="pt-2 flex items-center justify-between gap-4">
              <span className="text-xs text-slate-500 tabular-nums">
                {nonEmptyEmailCount} {nonEmptyEmailCount === 1 ? 'email' : 'emails'}
                {totalAttachmentsCount > 0
                  ? ` · ${totalAttachmentsCount} ${
                      totalAttachmentsCount === 1 ? 'attachment' : 'attachments'
                    }`
                  : ''}{' '}
                ready
              </span>
              <div className="flex items-center gap-2 shrink-0">
                {isSummarizing && (
                  <button
                    type="button"
                    onClick={onCancelSummarize}
                    className="px-3 py-2.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <XCircle className="w-3.5 h-3.5" />
                    <span>Cancel</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={onSummarize}
                  disabled={isSummarizing || nonEmptyEmailCount === 0}
                  className="px-4 py-2.5 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 disabled:cursor-not-allowed rounded-lg transition-colors flex items-center gap-2 whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Sparkles className="w-4 h-4" />
                  <span>
                    {isSummarizing
                      ? `Extracting (${(elapsedMs / 1000).toFixed(1)}s)`
                      : 'Extract & Summarize'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Right Column: Structured Extraction Workbench */}
      <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Extracted School Digest</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Structured deadlines, checklist actions, and key dates formatted for Home Assistant.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => setLogsOpen((prev) => !prev)}
              className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <Terminal className="w-3.5 h-3.5" />
              <span className="tabular-nums">Live Logs ({logs.length})</span>
              {logsOpen ? (
                <ChevronUp className="w-3.5 h-3.5 text-slate-500" />
              ) : (
                <ChevronDown className="w-3.5 h-3.5 text-slate-500" />
              )}
            </button>
            {result && (
              <button
                type="button"
                onClick={onOpenDashboardPreview}
                className="px-3.5 py-2 text-xs font-medium text-sky-700 bg-sky-50 hover:bg-sky-100 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <span>Preview HA Dashboard</span>
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            )}
          </div>
        </div>

        {/* Collapsible Live Extraction Logs Panel */}
        {logsOpen && (
          <div className="border-b border-slate-200 bg-slate-950 text-slate-100">
            <div className="px-4 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex items-center gap-3 text-slate-300 font-mono tabular-nums">
                <span className="font-semibold text-white">Live Extraction Log</span>
                {isSummarizing && (
                  <span className="text-sky-400">
                    Running · {(elapsedMs / 1000).toFixed(1)}s
                    {streamProgress
                      ? ` · ${streamProgress.chunks} chunks · ${streamProgress.chars.toLocaleString()} chars`
                      : ''}
                  </span>
                )}
                {!isSummarizing && logs.length > 0 && (
                  <span className="text-slate-400">
                    {error ? 'Stopped with error' : 'Finished'}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                {logs.length > 0 && (
                  <>
                    <button
                      type="button"
                      onClick={handleCopyLogs}
                      className="px-2 py-1 text-[11px] font-medium text-slate-300 hover:text-white bg-slate-800 hover:bg-slate-700 rounded flex items-center gap-1 cursor-pointer"
                    >
                      {copiedLogs ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
                      <span>{copiedLogs ? 'Copied' : 'Copy'}</span>
                    </button>
                    <button
                      type="button"
                      onClick={onClearLogs}
                      disabled={isSummarizing}
                      className="px-2 py-1 text-[11px] font-medium text-slate-400 hover:text-white disabled:opacity-40 rounded cursor-pointer"
                    >
                      Clear
                    </button>
                  </>
                )}
              </div>
            </div>

            <div className="p-3.5 max-h-52 overflow-y-auto font-mono text-xs space-y-1.5">
              {logs.length === 0 ? (
                <div className="text-slate-400">
                  No log entries yet. Click &quot;Extract &amp; Summarize&quot; to watch live server events here.
                </div>
              ) : (
                logs.map((entry) => {
                  const levelClass =
                    entry.level === 'error'
                      ? 'text-red-400'
                      : entry.level === 'warn'
                      ? 'text-amber-400'
                      : entry.level === 'success'
                      ? 'text-emerald-400'
                      : 'text-sky-400';
                  return (
                    <div key={entry.id} className="flex items-start gap-2.5 leading-relaxed">
                      <span className="text-slate-500 tabular-nums shrink-0 w-14 text-right">
                        +{(entry.elapsedMs / 1000).toFixed(2)}s
                      </span>
                      <span className={`uppercase font-semibold shrink-0 w-16 ${levelClass}`}>
                        {entry.step}
                      </span>
                      <span className="text-slate-200 break-words min-w-0">{entry.message}</span>
                    </div>
                  );
                })
              )}
              <div ref={logEndRef} />
            </div>
          </div>
        )}

        {/* Error state */}
        {error && (
          <div className="m-5 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start justify-between gap-4">
            <div className="flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-red-600 mt-0.5 shrink-0" />
              <div className="text-sm text-red-800">
                <p className="font-medium">Summarization failed</p>
                <p className="text-xs text-red-700 mt-0.5">{error}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={onSummarize}
              className="px-3 py-1.5 text-xs font-medium text-red-700 bg-white border border-red-200 hover:bg-red-50 rounded-md flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>Retry</span>
            </button>
          </div>
        )}

        {/* Loading skeleton */}
        {isSummarizing && (
          <div className="p-5 space-y-5" aria-busy="true" aria-label="Analyzing school emails">
            <div className="space-y-2">
              <div className="h-4 w-3/4 bg-slate-100 rounded animate-pulse" />
              <div className="h-4 w-1/2 bg-slate-100 rounded animate-pulse" />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 py-4 border-y border-slate-100">
              {[0, 1, 2, 3].map((idx) => (
                <div key={idx} className="space-y-1.5">
                  <div className="h-3 w-20 bg-slate-100 rounded animate-pulse" />
                  <div className="h-7 w-10 bg-slate-100 rounded animate-pulse" />
                </div>
              ))}
            </div>
            <div className="space-y-3">
              {[0, 1, 2, 3].map((row) => (
                <div
                  key={row}
                  className="h-11 bg-slate-50 border border-slate-100 rounded-lg animate-pulse"
                />
              ))}
            </div>
          </div>
        )}

        {/* Empty state */}
        {!isSummarizing && !result && !error && (
          <div className="p-10 text-center max-w-md mx-auto">
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-4">
              <FileText className="w-5 h-5" />
            </div>
            <h3 className="text-base font-semibold text-slate-900">
              Ready to summarize school emails
            </h3>
            <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
              Paste a real newsletter or permission slip email on the left, or use the pre-loaded
              samples, then run extraction to inspect the deadlines and Home Assistant payload.
            </p>
            <div className="mt-5 flex items-center justify-center gap-3 flex-wrap">
              <button
                type="button"
                onClick={onSummarize}
                disabled={nonEmptyEmailCount === 0}
                className="px-4 py-2 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 disabled:opacity-50 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Extract &amp; Summarize Now
              </button>
              {nonEmptyEmailCount === 0 && (
                <button
                  type="button"
                  onClick={onLoadSamples}
                  className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  Load Sample Emails
                </button>
              )}
            </div>
          </div>
        )}

        {/* Populated result */}
        {!isSummarizing && result && (
          <div>
            {/* Parent Digest prose */}
            <div className="px-5 py-4 bg-slate-50/60 border-b border-slate-200">
              <div className="flex items-center justify-between gap-2 text-xs text-slate-500 mb-1.5">
                <span className="font-medium text-slate-700">Parent Briefing</span>
                <span className="font-mono tabular-nums">
                  Reference date {result.referenceDate}
                </span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed">{result.digest}</p>
            </div>

            {/* Flat 4-column metric strip (single-elevation hairline dividers) */}
            <div className="grid grid-cols-2 sm:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-slate-200 border-b border-slate-200">
              <div className="px-5 py-3.5">
                <div className="text-xs text-slate-500">Urgent Deadlines</div>
                <div
                  className={`text-2xl font-semibold font-mono tabular-nums mt-0.5 ${
                    metrics.urgent > 0 ? 'text-amber-700' : 'text-emerald-700'
                  }`}
                >
                  {metrics.urgent}
                </div>
              </div>
              <div className="px-5 py-3.5">
                <div className="text-xs text-slate-500">Open Deadlines</div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {metrics.deadlines}
                </div>
              </div>
              <div className="px-5 py-3.5">
                <div className="text-xs text-slate-500">Action Items</div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {metrics.actions}
                </div>
              </div>
              <div className="px-5 py-3.5">
                <div className="text-xs text-slate-500">Upcoming Events</div>
                <div className="text-2xl font-semibold font-mono tabular-nums text-slate-900 mt-0.5">
                  {metrics.events}
                </div>
              </div>
            </div>

            {/* Filter bar & Search */}
            <div className="px-5 py-3 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg overflow-x-auto">
                {(
                  [
                    { id: 'all', label: 'All' },
                    { id: 'deadlines', label: `Deadlines (${result.deadlines.length})` },
                    { id: 'actions', label: `Actions (${result.actions.length})` },
                    { id: 'events', label: `Events (${result.events.length})` },
                    ...(result.attachmentInsights && result.attachmentInsights.length > 0
                      ? [
                          {
                            id: 'attachments' as ResultTab,
                            label: `Attachments (${result.attachmentInsights.length})`,
                          },
                        ]
                      : []),
                    { id: 'emails', label: `Per-Email (${result.emailSummaries.length})` },
                  ] as Array<{ id: ResultTab; label: string }>
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setResultTab(tab.id)}
                    className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                      resultTab === tab.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="relative flex-1 min-w-[180px] max-w-xs">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Filter extracted items..."
                  aria-label="Filter extracted items"
                  className="w-full pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-sky-600/20 focus:border-sky-600"
                />
              </div>
            </div>

            {/* Extracted Sections */}
            <div className="divide-y divide-slate-200">
              {/* Deadlines Table */}
              {(resultTab === 'all' || resultTab === 'deadlines') && (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <Clock className="w-4 h-4 text-slate-500" />
                      <span>Deadlines</span>
                    </h3>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {filteredDeadlines.length} shown
                    </span>
                  </div>

                  {filteredDeadlines.length === 0 ? (
                    <p className="text-xs text-slate-500 py-3">No matching deadlines found.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-left border-collapse">
                        <thead>
                          <tr className="border-b border-slate-200 text-xs font-medium text-slate-500">
                            <th className="py-2 pr-3 w-8">Done</th>
                            <th className="py-2 pr-4">Deadline &amp; Action</th>
                            <th className="py-2 pr-4 whitespace-nowrap">Due Date</th>
                            <th className="py-2 pr-4 whitespace-nowrap">Category</th>
                            <th className="py-2 text-right whitespace-nowrap">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 text-sm">
                          {filteredDeadlines.map((item) => {
                            const meta = URGENCY_META[item.urgency] ?? URGENCY_META.upcoming;
                            return (
                              <tr
                                key={item.id}
                                className={`hover:bg-slate-50/80 transition-colors ${
                                  item.completed ? 'opacity-55' : ''
                                }`}
                              >
                                <td className="py-2.5 pr-3 align-top">
                                  <button
                                    type="button"
                                    onClick={() => onToggleDeadline(item.id)}
                                    aria-label={`Mark ${item.title} as ${
                                      item.completed ? 'incomplete' : 'complete'
                                    }`}
                                    className="text-slate-400 hover:text-sky-700 mt-0.5 cursor-pointer"
                                  >
                                    {item.completed ? (
                                      <CheckSquare className="w-4 h-4 text-emerald-600" />
                                    ) : (
                                      <Square className="w-4 h-4" />
                                    )}
                                  </button>
                                </td>
                                <td className="py-2.5 pr-4 align-top">
                                  <div
                                    className={`font-medium text-slate-900 ${
                                      item.completed ? 'line-through' : ''
                                    }`}
                                  >
                                    {item.title}
                                    {item.amount ? (
                                      <span className="ml-2 font-mono text-xs text-slate-600 tabular-nums">
                                        · {item.amount}
                                      </span>
                                    ) : null}
                                  </div>
                                  {item.actionRequired && (
                                    <div className="text-xs text-slate-500 mt-0.5">
                                      {item.actionRequired}
                                    </div>
                                  )}
                                </td>
                                <td className="py-2.5 pr-4 align-top whitespace-nowrap font-mono text-xs tabular-nums text-slate-700">
                                  <div>{item.dueDate}</div>
                                  {item.dueTime && (
                                    <div className="text-slate-400">{item.dueTime}</div>
                                  )}
                                </td>
                                <td className="py-2.5 pr-4 align-top whitespace-nowrap text-xs text-slate-600">
                                  {item.category}
                                </td>
                                <td className="py-2.5 align-top text-right whitespace-nowrap text-xs">
                                  {item.completed ? (
                                    <span className="text-emerald-700 font-medium">Completed</span>
                                  ) : (
                                    <span className={meta.textClass}>{meta.label}</span>
                                  )}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              )}

              {/* Actions Checklist */}
              {(resultTab === 'all' || resultTab === 'actions') && (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-slate-500" />
                      <span>Upcoming Actions</span>
                    </h3>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {filteredActions.length} shown
                    </span>
                  </div>

                  {filteredActions.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">No matching actions found.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {filteredActions.map((action) => (
                        <li
                          key={action.id}
                          className={`py-2.5 flex items-start gap-3 ${
                            action.completed ? 'opacity-55' : ''
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => onToggleAction(action.id)}
                            aria-label={`Toggle action ${action.task}`}
                            className="text-slate-400 hover:text-sky-700 mt-0.5 cursor-pointer shrink-0"
                          >
                            {action.completed ? (
                              <CheckSquare className="w-4 h-4 text-emerald-600" />
                            ) : (
                              <Square className="w-4 h-4" />
                            )}
                          </button>
                          <div className="flex-1 min-w-0">
                            <div
                              className={`text-sm font-medium text-slate-900 ${
                                action.completed ? 'line-through' : ''
                              }`}
                            >
                              {action.task}
                            </div>
                            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
                              <span className="font-mono tabular-nums text-slate-700">
                                {action.when}
                              </span>
                              <span aria-hidden="true">·</span>
                              <span>{action.category}</span>
                              {action.details && (
                                <>
                                  <span aria-hidden="true">·</span>
                                  <span>{action.details}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Events */}
              {(resultTab === 'all' || resultTab === 'events') && (
                <div className="p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-slate-500" />
                      <span>Key Dates &amp; School Events</span>
                    </h3>
                    <span className="text-xs text-slate-500 tabular-nums">
                      {filteredEvents.length} shown
                    </span>
                  </div>

                  {filteredEvents.length === 0 ? (
                    <p className="text-xs text-slate-500 py-2">No matching school events found.</p>
                  ) : (
                    <ul className="divide-y divide-slate-100">
                      {filteredEvents.map((evt) => (
                        <li
                          key={evt.id}
                          className="py-2.5 flex flex-col sm:flex-row sm:items-baseline justify-between gap-1 sm:gap-4"
                        >
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-slate-900">{evt.title}</div>
                            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2">
                              {evt.location && (
                                <>
                                  <span>{evt.location}</span>
                                  <span aria-hidden="true">·</span>
                                </>
                              )}
                              <span>{evt.notes}</span>
                            </div>
                          </div>
                          <div className="text-xs font-mono tabular-nums text-slate-700 whitespace-nowrap shrink-0 sm:text-right">
                            <span>{evt.date}</span>
                            {evt.time && (
                              <span className="text-slate-400 ml-1.5">{evt.time}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {/* Attachment Visual / Document Analysis */}
              {(resultTab === 'all' || resultTab === 'attachments') &&
                result.attachmentInsights &&
                result.attachmentInsights.length > 0 && (
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-1.5">
                        <Paperclip className="w-4 h-4 text-slate-500" />
                        <span>Attachment Analysis (Photos &amp; PDFs)</span>
                      </h3>
                      <span className="text-xs text-slate-500 tabular-nums">
                        {result.attachmentInsights.length}{' '}
                        {result.attachmentInsights.length === 1 ? 'file' : 'files'} analyzed
                      </span>
                    </div>

                    <ul className="divide-y divide-slate-100">
                      {result.attachmentInsights.map((insight, idx) => {
                        const matched = uploadedAttachmentMap.get(insight.fileName.toLowerCase());
                        const isImage = matched?.mimeType.startsWith('image/');
                        return (
                          <li key={`${insight.fileName}-${idx}`} className="py-3 flex items-start gap-3.5">
                            {isImage && matched ? (
                              <img
                                src={`data:${matched.mimeType};base64,${matched.base64Data}`}
                                alt={insight.fileName}
                                className="w-12 h-12 rounded-lg object-cover border border-slate-200 shrink-0 mt-0.5"
                              />
                            ) : (
                              <div className="w-12 h-12 rounded-lg bg-slate-50 border border-slate-200 text-slate-500 flex items-center justify-center shrink-0 mt-0.5">
                                {matched?.mimeType === 'application/pdf' ? (
                                  <FileText className="w-5 h-5" />
                                ) : (
                                  <ImageIcon className="w-5 h-5" />
                                )}
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-baseline justify-between gap-2">
                                <div className="text-sm font-medium text-slate-900 truncate">
                                  {insight.fileName}
                                  <span className="ml-2 text-xs font-normal text-slate-500">
                                    · {insight.contentType}
                                  </span>
                                </div>
                                <span
                                  className={`text-xs whitespace-nowrap shrink-0 ${
                                    insight.hasActionableInfo
                                      ? 'text-sky-700 font-medium'
                                      : 'text-slate-500'
                                  }`}
                                >
                                  {insight.extractedRelevance}
                                </span>
                              </div>
                              <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                                {insight.whatWasSeen}
                              </p>
                            </div>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}

              {/* Per-Email Breakdown */}
              {resultTab === 'emails' && (
                <div className="p-5">
                  <h3 className="text-sm font-semibold text-slate-900 mb-3">
                    Per-Email Breakdown
                  </h3>
                  <ul className="divide-y divide-slate-100">
                    {result.emailSummaries.map((item, idx) => (
                      <li key={idx} className="py-3">
                        <div className="flex items-baseline justify-between gap-3">
                          <div className="text-sm font-medium text-slate-900">{item.subject}</div>
                          <span
                            className={`text-xs whitespace-nowrap shrink-0 ${
                              item.hasActionRequired
                                ? 'text-amber-700 font-medium'
                                : 'text-slate-500'
                            }`}
                          >
                            {item.hasActionRequired ? 'Action Required' : 'Informational'}
                          </span>
                        </div>
                        <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                          {item.takeaway}
                        </p>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </div>
        )}
      </section>
    </div>
  );
};
