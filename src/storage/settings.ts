import type { MethodFilter, Settings, StatusFilter, ThemePreference } from '../shared/types';
import { DEFAULT_API_BASE, DEFAULT_SETTINGS, LIMITS } from '../shared/types';
import { clampInt, isRecord } from '../shared/validation';
import type { KeyValueStore } from './store';
import { storageErrorMessage } from './store';

export const SETTINGS_KEY = 'requestreplay.settings';

const METHODS: MethodFilter[] = ['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER'];
const STATUSES: StatusFilter[] = ['all', '2xx', '3xx', '4xx', '5xx', 'network', 'failed'];
const THEMES: ThemePreference[] = ['match-devtools', 'dark', 'light'];

export function sanitizeSettings(value: unknown): Settings {
  if (!isRecord(value)) return { ...DEFAULT_SETTINGS };
  return {
    theme: THEMES.includes(value.theme as ThemePreference) ? (value.theme as ThemePreference) : DEFAULT_SETTINGS.theme,
    methodFilter: METHODS.includes(value.methodFilter as MethodFilter)
      ? (value.methodFilter as MethodFilter)
      : DEFAULT_SETTINGS.methodFilter,
    statusFilter: STATUSES.includes(value.statusFilter as StatusFilter)
      ? (value.statusFilter as StatusFilter)
      : DEFAULT_SETTINGS.statusFilter,
    preserveLog: value.preserveLog === true,
    historyEnabled: value.historyEnabled === true,
    historyLimit: clampInt(
      typeof value.historyLimit === 'number' ? value.historyLimit : DEFAULT_SETTINGS.historyLimit,
      1,
      LIMITS.maxHistoryEntries,
    ),
    apiBase: sanitizeApiBase(value.apiBase),
  };
}

function sanitizeApiBase(value: unknown): string {
  if (typeof value !== 'string' || value.length > 300) return DEFAULT_API_BASE;
  try {
    const url = new URL(value);
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return DEFAULT_API_BASE;
    return url.origin;
  } catch {
    return DEFAULT_API_BASE;
  }
}

export async function loadSettings(store: KeyValueStore | null): Promise<{ settings: Settings; error: string | null }> {
  if (!store) return { settings: { ...DEFAULT_SETTINGS }, error: null };
  try {
    const stored = await store.get(SETTINGS_KEY);
    return { settings: sanitizeSettings(stored), error: null };
  } catch (error) {
    return { settings: { ...DEFAULT_SETTINGS }, error: storageErrorMessage(error) };
  }
}

export async function saveSettings(
  store: KeyValueStore | null,
  settings: Settings,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const clean = sanitizeSettings(settings);
  if (!store) return { ok: false, error: 'Local storage is unavailable in this context.' };
  try {
    await store.set(SETTINGS_KEY, clean);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: storageErrorMessage(error) };
  }
}
