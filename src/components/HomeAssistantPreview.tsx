import React, { useMemo, useState } from 'react';
import {
  ArrowRight,
  Calendar,
  Check,
  CheckSquare,
  Clock,
  Copy,
  Download,
  Home,
  Monitor,
  Moon,
  Smartphone,
  Square,
  Sun,
} from 'lucide-react';
import type { AppsScriptConfig, SchoolDigestResult } from '../types/school';
import { buildWebhookPayload, getFullWebhookUrl, slugifySensor } from '../utils/haGenerators';

interface HomeAssistantPreviewProps {
  result: SchoolDigestResult | null;
  config: AppsScriptConfig;
  onToggleAction: (id: string) => void;
  onGoToSummarizer: () => void;
  onGoToSetup: () => void;
}

export const HomeAssistantPreview: React.FC<HomeAssistantPreviewProps> = ({
  result,
  config,
  onToggleAction,
  onGoToSummarizer,
  onGoToSetup,
}) => {
  const [haDark, setHaDark] = useState(true);
  const [viewportMode, setViewportMode] = useState<'tablet' | 'mobile'>('tablet');
  const [copiedPayload, setCopiedPayload] = useState(false);

  const sensorEntity = `sensor.${slugifySensor(config.sensorName)}`;
  const fullWebhookUrl = getFullWebhookUrl(config);

  const payload = useMemo(() => (result ? buildWebhookPayload(result) : null), [result]);
  const payloadJson = useMemo(() => (payload ? JSON.stringify(payload, null, 2) : ''), [payload]);

  const handleCopyPayload = async () => {
    if (!payloadJson) return;
    await navigator.clipboard.writeText(payloadJson);
    setCopiedPayload(true);
    setTimeout(() => setCopiedPayload(false), 1800);
  };

  const handleDownloadJson = () => {
    if (!payloadJson) return;
    const blob = new Blob([payloadJson], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${slugifySensor(config.sensorName)}-payload.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!result || !payload) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-12 text-center max-w-xl mx-auto">
        <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-600 flex items-center justify-center mx-auto mb-4">
          <Home className="w-5 h-5" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">
          No extracted school digest to preview yet
        </h2>
        <p className="text-sm text-slate-500 mt-1.5 leading-relaxed">
          Paste a school email in the Email Summarizer first to see how your deadlines, actions, and
          key dates will render on a Home Assistant dashboard card.
        </p>
        <div className="mt-6 flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={onGoToSummarizer}
            className="px-4 py-2 text-sm font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Go to Email Summarizer
          </button>
          <button
            type="button"
            onClick={onGoToSetup}
            className="px-4 py-2 text-sm font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Jump to Apps Script &amp; YAML
          </button>
        </div>
      </div>
    );
  }

  const stateString = String(payload.urgent_count);
  const payloadBytes = new Blob([payloadJson]).size;

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
      {/* Left: Live Home Assistant Dashboard Preview */}
      <section className="xl:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">
              Home Assistant Lovelace Preview
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 font-mono">{sensorEntity}</p>
          </div>

          <div className="flex items-center gap-2">
            {/* Viewport toggle */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setViewportMode('tablet')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewportMode === 'tablet'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Monitor className="w-3.5 h-3.5" />
                <span>Wall Tablet</span>
              </button>
              <button
                type="button"
                onClick={() => setViewportMode('mobile')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md flex items-center gap-1.5 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  viewportMode === 'mobile'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <Smartphone className="w-3.5 h-3.5" />
                <span>Phone</span>
              </button>
            </div>

            {/* HA Theme toggle */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
              <button
                type="button"
                onClick={() => setHaDark(false)}
                aria-label="Preview Home Assistant light theme"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  !haDark ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Sun className="w-3.5 h-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setHaDark(true)}
                aria-label="Preview Home Assistant dark theme"
                className={`p-1.5 rounded-md transition-colors cursor-pointer ${
                  haDark ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-500 hover:text-slate-900'
                }`}
              >
                <Moon className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>

        {/* Simulated Home Assistant Canvas */}
        <div
          className={`p-5 transition-colors ${
            haDark ? 'bg-[#111111] text-[#E1E1E1]' : 'bg-[#F0F2F5] text-[#212121]'
          }`}
        >
          <div className={viewportMode === 'mobile' ? 'max-w-[380px] mx-auto' : 'w-full'}>
            {/* HA App Bar */}
            <div
              className={`flex items-center justify-between px-4 py-3 rounded-t-xl border-b ${
                haDark
                  ? 'bg-[#1C1C1C] border-[#2C2C2C] text-white'
                  : 'bg-[#03A9F4] border-[#0288D1] text-white'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Home className="w-4 h-4" />
                <span className="text-sm font-medium">Home Assistant · Family Dashboard</span>
              </div>
              <span className="text-xs opacity-80 font-mono tabular-nums">
                {new Date(result.generatedAt).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>

            {/* HA Cards Stack */}
            <div
              className={`p-4 space-y-4 rounded-b-xl ${
                haDark ? 'bg-[#111111]' : 'bg-[#F0F2F5]'
              }`}
            >
              {/* Tile Entity Summary Row */}
              <div
                className={`grid gap-3 ${
                  viewportMode === 'mobile' ? 'grid-cols-1' : 'grid-cols-3'
                }`}
              >
                <div
                  className={`p-3.5 rounded-xl border ${
                    haDark
                      ? 'bg-[#1C1C1C] border-[#2C2C2C]'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div
                    className={`text-xs ${haDark ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Urgent Deadlines
                  </div>
                  <div
                    className={`text-xl font-semibold font-mono tabular-nums mt-1 ${
                      payload.urgent_count > 0
                        ? haDark
                          ? 'text-amber-400'
                          : 'text-amber-600'
                        : haDark
                        ? 'text-emerald-400'
                        : 'text-emerald-600'
                    }`}
                  >
                    {payload.urgent_count} urgent
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border ${
                    haDark
                      ? 'bg-[#1C1C1C] border-[#2C2C2C]'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div
                    className={`text-xs ${haDark ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Open Actions
                  </div>
                  <div className="text-xl font-semibold font-mono tabular-nums mt-1">
                    {payload.open_actions} tasks
                  </div>
                </div>

                <div
                  className={`p-3.5 rounded-xl border ${
                    haDark
                      ? 'bg-[#1C1C1C] border-[#2C2C2C]'
                      : 'bg-white border-slate-200'
                  }`}
                >
                  <div
                    className={`text-xs ${haDark ? 'text-slate-400' : 'text-slate-500'}`}
                  >
                    Upcoming Events
                  </div>
                  <div className="text-xl font-semibold font-mono tabular-nums mt-1">
                    {payload.events.length} dates
                  </div>
                </div>
              </div>

              {/* Lovelace Markdown Card */}
              <div
                className={`p-5 rounded-xl border space-y-4 ${
                  haDark
                    ? 'bg-[#1C1C1C] border-[#2C2C2C]'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-base font-semibold">
                    {config.sensorName.trim() || 'School Digest'}
                  </h3>
                  <span
                    className={`text-xs font-mono tabular-nums ${
                      haDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    Markdown Card
                  </span>
                </div>

                <p
                  className={`text-sm leading-relaxed ${
                    haDark ? 'text-slate-300' : 'text-slate-700'
                  }`}
                >
                  {payload.digest}
                </p>

                <hr className={haDark ? 'border-[#2C2C2C]' : 'border-slate-200'} />

                {/* Deadlines Section */}
                <div>
                  <h4 className="text-xs font-semibold tracking-wide flex items-center gap-1.5 mb-2.5">
                    <Clock className="w-3.5 h-3.5 text-sky-400" />
                    <span>Upcoming Deadlines ({payload.deadlines.length})</span>
                  </h4>
                  {payload.deadlines.length === 0 ? (
                    <p className={`text-xs ${haDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      All caught up — no pending school deadlines.
                    </p>
                  ) : (
                    <ul className="space-y-2.5">
                      {payload.deadlines.map((d, i) => (
                        <li key={i} className="text-sm">
                          <div className="flex flex-wrap items-baseline justify-between gap-2">
                            <span className="font-medium">{d.title}</span>
                            <span className="text-xs font-mono tabular-nums">
                              <span>Due {d.due_date}</span>
                              {d.due_time ? ` · ${d.due_time}` : ''}
                              <span
                                className={`ml-2 font-semibold ${
                                  d.urgency === 'overdue'
                                    ? haDark
                                      ? 'text-red-400'
                                      : 'text-red-600'
                                    : d.urgency === 'urgent'
                                    ? haDark
                                      ? 'text-amber-400'
                                      : 'text-amber-600'
                                    : haDark
                                    ? 'text-sky-400'
                                    : 'text-sky-700'
                                }`}
                              >
                                ({d.urgency.toUpperCase()})
                              </span>
                            </span>
                          </div>
                          <div
                            className={`text-xs mt-0.5 ${
                              haDark ? 'text-slate-400' : 'text-slate-600'
                            }`}
                          >
                            {d.action}
                            {d.amount ? ` · ${d.amount}` : ''}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                {/* Events Section */}
                <div>
                  <h4 className="text-xs font-semibold tracking-wide flex items-center gap-1.5 mb-2.5">
                    <Calendar className="w-3.5 h-3.5 text-sky-400" />
                    <span>Key Dates &amp; Events ({payload.events.length})</span>
                  </h4>
                  {payload.events.length === 0 ? (
                    <p className={`text-xs ${haDark ? 'text-slate-400' : 'text-slate-500'}`}>
                      No upcoming events listed.
                    </p>
                  ) : (
                    <ul className="space-y-2">
                      {payload.events.map((e, i) => (
                        <li
                          key={i}
                          className="text-xs flex flex-wrap items-baseline justify-between gap-2"
                        >
                          <div>
                            <span className="font-medium text-sm">{e.title}</span>
                            {e.location ? (
                              <span className={haDark ? 'text-slate-400' : 'text-slate-500'}>
                                {' '}
                                · {e.location}
                              </span>
                            ) : null}
                          </div>
                          <span
                            className={`font-mono tabular-nums ${
                              haDark ? 'text-slate-300' : 'text-slate-700'
                            }`}
                          >
                            {e.date}
                            {e.time ? ` (${e.time})` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>

              {/* Home Assistant To-Do Card Preview */}
              <div
                className={`p-5 rounded-xl border ${
                  haDark
                    ? 'bg-[#1C1C1C] border-[#2C2C2C]'
                    : 'bg-white border-slate-200'
                }`}
              >
                <div className="flex items-baseline justify-between gap-3 mb-3">
                  <h3 className="text-base font-semibold">School Action Checklist</h3>
                  <span
                    className={`text-xs font-mono ${
                      haDark ? 'text-slate-400' : 'text-slate-500'
                    }`}
                  >
                    {config.todoEntityId || 'todo.school_actions'}
                  </span>
                </div>
                <ul
                  className={`divide-y ${
                    haDark ? 'divide-[#2C2C2C]' : 'divide-slate-100'
                  }`}
                >
                  {result.actions.map((action) => (
                    <li key={action.id} className="py-2.5 flex items-start gap-3">
                      <button
                        type="button"
                        onClick={() => onToggleAction(action.id)}
                        aria-label={`Toggle checklist item ${action.task}`}
                        className="mt-0.5 cursor-pointer shrink-0"
                      >
                        {action.completed ? (
                          <CheckSquare className="w-4 h-4 text-sky-500" />
                        ) : (
                          <Square
                            className={`w-4 h-4 ${
                              haDark ? 'text-slate-500' : 'text-slate-400'
                            }`}
                          />
                        )}
                      </button>
                      <div className={`min-w-0 ${action.completed ? 'opacity-50 line-through' : ''}`}>
                        <div className="text-sm">{action.task}</div>
                        <div
                          className={`text-xs mt-0.5 ${
                            haDark ? 'text-slate-400' : 'text-slate-500'
                          }`}
                        >
                          <span className="font-mono tabular-nums">{action.when}</span> ·{' '}
                          {action.details}
                        </div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Right: Webhook Payload Inspector */}
      <section className="xl:col-span-5 bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900">Webhook JSON Payload</h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Exact HTTP POST payload sent by Google Apps Script to Home Assistant.
            </p>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={handleCopyPayload}
              className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
            >
              {copiedPayload ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy JSON</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleDownloadJson}
              aria-label="Download webhook JSON payload"
              className="p-1.5 text-slate-600 hover:text-slate-900 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>

        {/* Technical validation facts */}
        <div className="px-5 py-3 bg-slate-50 border-b border-slate-200 space-y-1.5 text-xs">
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-slate-500">Target Endpoint</span>
            <span className="font-mono text-slate-800 truncate max-w-[260px]" title={fullWebhookUrl}>
              POST {fullWebhookUrl}
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-slate-500">Sensor State Length</span>
            <span className="font-mono tabular-nums text-emerald-700 font-medium">
              &quot;{stateString}&quot; ({stateString.length} / 255 chars safe)
            </span>
          </div>
          <div className="flex items-baseline justify-between gap-3">
            <span className="text-slate-500">Attributes Payload Size</span>
            <span className="font-mono tabular-nums text-slate-700">
              {(payloadBytes / 1024).toFixed(2)} KB
            </span>
          </div>
        </div>

        {/* JSON viewer */}
        <div className="bg-slate-950 text-slate-100 p-4 overflow-x-auto max-h-[520px] overflow-y-auto">
          <pre className="text-xs font-mono leading-relaxed">{payloadJson}</pre>
        </div>

        <div className="px-5 py-3.5 border-t border-slate-200 flex items-center justify-between gap-3">
          <span className="text-xs text-slate-500">
            Ready to automate this from Gmail?
          </span>
          <button
            type="button"
            onClick={onGoToSetup}
            className="px-3.5 py-2 text-xs font-medium text-white bg-sky-700 hover:bg-sky-800 rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <span>Get Apps Script &amp; YAML</span>
            <ArrowRight className="w-3.5 h-3.5" />
          </button>
        </div>
      </section>
    </div>
  );
};
