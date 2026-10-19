import type { BodySnapshot, CapturedRequest, HeaderPair, QueryParam, TimingInfo } from '../shared/types';
import { LIMITS } from '../shared/types';
import { clampInt, isRecord } from '../shared/validation';
import { redactForStorage } from './redactStored';
import type { KeyValueStore } from './store';
import { storageErrorMessage } from './store';

export const HISTORY_KEY = 'requestreplay.history';

type HistoryFile = {
  version: 1;
  requests: CapturedRequest[];
};

export function applyHistoryLimit(requests: CapturedRequest[], limit: number): CapturedRequest[] {
  const safe = clampInt(limit, 1, LIMITS.maxHistoryEntries);
  if (requests.length <= safe) return requests;
  return requests.slice(requests.length - safe);
}

export function upsertHistory(requests: CapturedRequest[], next: CapturedRequest, limit: number): CapturedRequest[] {
  const stored = prepareForStorage(next);
  const without = requests.filter((request) => request.id !== stored.id);
  return applyHistoryLimit([...without, stored], limit);
}

export function prepareForStorage(request: CapturedRequest): CapturedRequest {
  const redacted = redactForStorage(request);
  return {
    ...redacted,
    source: 'history',
    requestBody: trimBody(redacted.requestBody),
    responseBody: redacted.responseBody.availability === 'pending'
      ? {
          ...redacted.responseBody,
          availability: 'unavailable',
          message: 'The response body was not stored because it was still loading.',
        }
      : trimBody(redacted.responseBody),
  };
}

export function clearHistoryList(): CapturedRequest[] {
  return [];
}

export function parseHistory(value: unknown): { requests: CapturedRequest[]; discarded: number } {
  if (!isRecord(value) || value.version !== 1 || !Array.isArray(value.requests)) {
    return { requests: [], discarded: value === undefined ? 0 : 1 };
  }
  const requests: CapturedRequest[] = [];
  let discarded = 0;
  for (const item of value.requests) {
    const parsed = parseRequest(item);
    if (parsed) requests.push(parsed);
    else discarded += 1;
  }
  return { requests, discarded };
}

export async function readHistory(
  store: KeyValueStore,
): Promise<{ ok: true; requests: CapturedRequest[]; discarded: number } | { ok: false; error: string; requests: [] }> {
  try {
    const parsed = parseHistory(await store.get(HISTORY_KEY));
    return { ok: true, requests: parsed.requests, discarded: parsed.discarded };
  } catch (error) {
    return { ok: false, error: storageErrorMessage(error), requests: [] };
  }
}

export async function writeHistory(
  store: KeyValueStore,
  requests: CapturedRequest[],
  limit: number,
): Promise<{ ok: true; requests: CapturedRequest[] } | { ok: false; error: string }> {
  const bounded = applyHistoryLimit(requests.map(prepareForStorage), limit);
  const file: HistoryFile = { version: 1, requests: bounded };
  try {
    await store.set(HISTORY_KEY, file);
    return { ok: true, requests: bounded };
  } catch (error) {
    return { ok: false, error: storageErrorMessage(error) };
  }
}

export async function upsertStoredRequest(
  store: KeyValueStore,
  request: CapturedRequest,
  limit: number,
): Promise<{ ok: true; requests: CapturedRequest[] } | { ok: false; error: string }> {
  const current = await readHistory(store);
  if (!current.ok) return current;
  return writeHistory(store, upsertHistory(current.requests, request, limit), limit);
}

export async function deleteHistory(
  store: KeyValueStore,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    await store.remove(HISTORY_KEY);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: storageErrorMessage(error) };
  }
}

function trimBody(body: BodySnapshot): BodySnapshot {
  if (body.text === null || body.text.length <= LIMITS.maxBodyChars) return body;
  return {
    ...body,
    text: body.text.slice(0, LIMITS.maxBodyChars),
    truncated: true,
    message: `Truncated to ${LIMITS.maxBodyChars} characters before it was stored.`,
  };
}

function parseRequest(value: unknown): CapturedRequest | null {
  if (!isRecord(value)) return null;
  if (typeof value.id !== 'string' || typeof value.method !== 'string' || typeof value.url !== 'string') return null;
  const requestBody = parseBody(value.requestBody);
  const responseBody = parseBody(value.responseBody);
  if (!requestBody || !responseBody) return null;
  return {
    id: value.id,
    method: value.method,
    url: value.url,
    startedAt: typeof value.startedAt === 'string' ? value.startedAt : null,
    durationMs: typeof value.durationMs === 'number' ? value.durationMs : null,
    resourceType: typeof value.resourceType === 'string' ? value.resourceType : null,
    status: typeof value.status === 'number' ? value.status : null,
    statusText: typeof value.statusText === 'string' ? value.statusText : null,
    httpVersion: typeof value.httpVersion === 'string' ? value.httpVersion : null,
    fromCache: value.fromCache === true,
    errorText: typeof value.errorText === 'string' ? value.errorText : null,
    requestHeaders: parseHeaders(value.requestHeaders),
    responseHeaders: parseHeaders(value.responseHeaders),
    query: parseQuery(value.query),
    requestBody,
    responseBody,
    requestMimeType: typeof value.requestMimeType === 'string' ? value.requestMimeType : null,
    responseMimeType: typeof value.responseMimeType === 'string' ? value.responseMimeType : null,
    timings: parseTimings(value.timings),
    serverIp: typeof value.serverIp === 'string' ? value.serverIp : null,
    source: 'history',
    captureNotes: Array.isArray(value.captureNotes)
      ? value.captureNotes.filter((note): note is string => typeof note === 'string').slice(0, 20)
      : [],
    sensitiveScanLimited: value.sensitiveScanLimited === true,
  };
}

function parseHeaders(value: unknown): HeaderPair[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.value !== 'string') return [];
    return [{ name: item.name, value: item.value }];
  });
}

function parseQuery(value: unknown): QueryParam[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.name !== 'string' || typeof item.value !== 'string') return [];
    return [{ name: item.name, value: item.value }];
  });
}

function parseBody(value: unknown): BodySnapshot | null {
  if (!isRecord(value) || typeof value.availability !== 'string') return null;
  const availability = value.availability;
  if (!['empty', 'available', 'unavailable', 'pending', 'error', 'binary'].includes(availability)) return null;
  return {
    availability: availability as BodySnapshot['availability'],
    text: typeof value.text === 'string' ? value.text : null,
    mimeType: typeof value.mimeType === 'string' ? value.mimeType : null,
    byteLength: typeof value.byteLength === 'number' ? value.byteLength : null,
    truncated: value.truncated === true,
    message: typeof value.message === 'string' ? value.message : null,
  };
}

function parseTimings(value: unknown): TimingInfo | null {
  if (!isRecord(value)) return null;
  const read = (key: string) => (typeof value[key] === 'number' ? value[key] : null);
  return {
    blockedMs: read('blockedMs'),
    dnsMs: read('dnsMs'),
    connectMs: read('connectMs'),
    sslMs: read('sslMs'),
    sendMs: read('sendMs'),
    waitMs: read('waitMs'),
    receiveMs: read('receiveMs'),
    totalMs: read('totalMs'),
  };
}
