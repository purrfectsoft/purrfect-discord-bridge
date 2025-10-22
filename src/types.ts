export interface LoggedMessage {
  id: string;
  author: string;
  authorId: string;
  timestamp: string;
  text: string;
}

export interface NoteRecord {
  id: string;
  timestamp: string;
  author: string;
  authorId: string;
  channelId: string | null;
  section: string;
  text: string;
}

export interface NoteInput {
  timestampISO?: string;
  author?: string;
  authorId?: string;
  channelId?: string | null;
  section?: string;
  text: string;
}

export interface HappeningRecord {
  id: string;
  at: string;
  text: string;
  author: string;
  source: string;
  channelId: string | null;
  section: string;
}

export interface HappeningInput {
  text: string;
  author?: string;
  source?: string;
  channelId?: string | null;
  section?: string;
  timestampISO?: string;
}

export interface AutosummaryState {
  enabled: boolean;
  cron: string;
  min: number;
  lookback: number;
}

export interface ChannelMetrics {
  id: string;
  name: string;
  count24h: number;
  count7d: number;
}

export interface DashboardState {
  tz: string;
  ready: boolean;
  botTag: string | null;
  uptimeMs: number;
  model: string;
  dailyCron: string;
  lastDigestAt: number | null;
  autosummary: AutosummaryState;
  channels: ChannelMetrics[];
  errors: string[];
}

export interface MetricsOptions {
  canonicalBaseUrl?: string;
}

export interface DashboardOptions extends MetricsOptions {
  defaultChannelId?: string | null;
}

export interface NoteHandlerInput extends NoteInput {
  channelId: string | null;
}

export interface ServerHooks {
  port?: number;
  host?: string;
  canonicalBaseUrl?: string;
  secret?: string;
  onNote: (input: NoteHandlerInput) => Promise<void> | void;
  onHappening?: (input: HappeningInput) => Promise<void> | void;
  onDigest: () => Promise<void> | void;
  isAllowedChannel: (channelId: string) => boolean;
  defaultChannelId?: string | null;
  getState: () => Promise<DashboardState>;
}

export interface SummarizeMessagesInput {
  messages: LoggedMessage[];
  model?: string | null;
  hours: number;
  tz?: string;
}

export interface SummaryResult {
  title: string;
  content: string;
}
