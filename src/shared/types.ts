export const LIMITS = {
  maxLiveRequests: 400,
  maxHistoryEntries: 200,
  defaultHistoryEntries: 50,
  maxBodyChars: 64_000,
  maxUrlChars: 100_000,
  maxHeaderCount: 200,
  maxHeaderValueChars: 32_000,
  maxQueryParams: 200,
  visiblePageSize: 150,
  contentTimeoutMs: 15_000,
  harTimeoutMs: 10_000,
  bodyFetchConcurrency: 4,
} as const;

export type HeaderPair = {
  name: string;
  value: string;
};

export type QueryParam = {
  name: string;
  value: string;
};

export type BodyAvailability = 'empty' | 'available' | 'unavailable' | 'pending' | 'error' | 'binary';

export type BodySnapshot = {
  availability: BodyAvailability;
  text: string | null;
  mimeType: string | null;
  byteLength: number | null;
  truncated: boolean;
  message: string | null;
};

export type TimingInfo = {
  blockedMs: number | null;
  dnsMs: number | null;
  connectMs: number | null;
  sslMs: number | null;
  sendMs: number | null;
  waitMs: number | null;
  receiveMs: number | null;
  totalMs: number | null;
};

export type RequestSource = 'live' | 'history' | 'demo';

export type CapturedRequest = {
  id: string;
  method: string;
  url: string;
  startedAt: string | null;
  durationMs: number | null;
  resourceType: string | null;
  status: number | null;
  statusText: string | null;
  httpVersion: string | null;
  fromCache: boolean;
  errorText: string | null;
  requestHeaders: HeaderPair[];
  responseHeaders: HeaderPair[];
  query: QueryParam[];
  requestBody: BodySnapshot;
  responseBody: BodySnapshot;
  requestMimeType: string | null;
  responseMimeType: string | null;
  timings: TimingInfo | null;
  serverIp: string | null;
  source: RequestSource;
  captureNotes: string[];
  sensitiveScanLimited: boolean;
};

export type MethodFilter = 'ALL' | 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'OTHER';

export type StatusFilter = 'all' | '2xx' | '3xx' | '4xx' | '5xx' | 'network' | 'failed';

export type ThemePreference = 'match-devtools' | 'dark' | 'light';

export type Settings = {
  theme: ThemePreference;
  methodFilter: MethodFilter;
  statusFilter: StatusFilter;
  preserveLog: boolean;
  historyEnabled: boolean;
  historyLimit: number;
  apiBase: string;
};

export const DEFAULT_API_BASE = 'http://127.0.0.1:3000';

export const DEFAULT_SETTINGS: Settings = {
  theme: 'match-devtools',
  methodFilter: 'ALL',
  statusFilter: 'all',
  preserveLog: false,
  historyEnabled: false,
  historyLimit: LIMITS.defaultHistoryEntries,
  apiBase: DEFAULT_API_BASE,
};

export type NormalizeSuccess = {
  ok: true;
  request: CapturedRequest;
};

export type NormalizeFailure = {
  ok: false;
  reason: 'not-an-object' | 'missing-url';
};

export type NormalizeResult = NormalizeSuccess | NormalizeFailure;
