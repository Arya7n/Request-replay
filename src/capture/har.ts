import { isRecord } from '../shared/validation';

export function extractHarEntries(payload: unknown): { ok: true; entries: unknown[] } | { ok: false; entries: [] } {
  if (Array.isArray(payload)) return { ok: true, entries: payload };
  if (!isRecord(payload)) return { ok: false, entries: [] };
  if (Array.isArray(payload.entries)) return { ok: true, entries: payload.entries };
  if (isRecord(payload.log) && Array.isArray(payload.log.entries)) {
    return { ok: true, entries: payload.log.entries };
  }
  return { ok: false, entries: [] };
}

export function fingerprintEntry(entry: unknown): string {
  if (!isRecord(entry)) return 'invalid';
  const request = isRecord(entry.request) ? entry.request : {};
  const response = isRecord(entry.response) ? entry.response : {};
  return [
    typeof entry.startedDateTime === 'string' ? entry.startedDateTime : '',
    typeof request.method === 'string' ? request.method : '',
    typeof request.url === 'string' ? request.url : '',
    typeof entry.time === 'number' ? String(entry.time) : '',
    typeof response.status === 'number' ? String(response.status) : '',
    typeof response.bodySize === 'number' ? String(response.bodySize) : '',
    typeof entry.connection === 'string' ? entry.connection : '',
  ].join('\u001f');
}
