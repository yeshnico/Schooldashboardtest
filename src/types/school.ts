export interface EmailAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  base64Data: string;
}

export interface EmailInput {
  id: string;
  sender: string;
  subject: string;
  date: string;
  body: string;
  attachments: EmailAttachment[];
}

export type DeadlineUrgency = 'overdue' | 'urgent' | 'upcoming' | 'normal';

export interface DeadlineItem {
  id: string;
  title: string;
  dueDate: string;
  dueTime: string;
  urgency: DeadlineUrgency;
  category: string;
  actionRequired: string;
  amount: string;
  sourceSubject: string;
  completed: boolean;
}

export interface ActionItem {
  id: string;
  task: string;
  when: string;
  category: string;
  details: string;
  completed: boolean;
}

export interface SchoolEvent {
  id: string;
  title: string;
  date: string;
  time: string;
  location: string;
  notes: string;
}

export interface EmailSummaryItem {
  subject: string;
  takeaway: string;
  hasActionRequired: boolean;
}

export interface AttachmentInsight {
  fileName: string;
  contentType: string;
  whatWasSeen: string;
  extractedRelevance: string;
  hasActionableInfo: boolean;
}

export interface SchoolDigestResult {
  generatedAt: string;
  referenceDate: string;
  digest: string;
  deadlines: DeadlineItem[];
  actions: ActionItem[];
  events: SchoolEvent[];
  emailSummaries: EmailSummaryItem[];
  attachmentInsights: AttachmentInsight[];
}

export type LogLevel = 'info' | 'warn' | 'error' | 'success';

export interface ExtractionLogEntry {
  id: string;
  timestamp: string;
  level: LogLevel;
  step: string;
  message: string;
  elapsedMs: number;
}

export interface StreamProgress {
  chunks: number;
  chars: number;
  elapsedMs: number;
}

export type PollInterval = '15min' | '30min' | 'hourly' | 'daily_7am';

export interface AppsScriptConfig {
  schoolSenders: string;
  gmailLabel: string;
  useLabelFilter: boolean;
  webhookBaseUrl: string;
  webhookId: string;
  sensorName: string;
  pollInterval: PollInterval;
  lookbackDays: number;
  includeAttachments: boolean;
  maxAttachmentSizeMb: number;
  enableTodoSync: boolean;
  todoEntityId: string;
  enableMobileNotify: boolean;
  notifyService: string;
  childContext: string;
}

export interface HAWebhookPayload {
  digest: string;
  urgent_count: number;
  total_deadlines: number;
  open_actions: number;
  last_updated: string;
  deadlines: Array<{
    title: string;
    due_date: string;
    due_time: string;
    urgency: DeadlineUrgency;
    category: string;
    action: string;
    amount: string;
  }>;
  actions: Array<{
    task: string;
    when: string;
    category: string;
    details: string;
  }>;
  events: Array<{
    title: string;
    date: string;
    time: string;
    location: string;
    notes: string;
  }>;
}
