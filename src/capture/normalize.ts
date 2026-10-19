import type { BodySnapshot, CapturedRequest, HeaderPair, QueryParam, TimingInfo } from '../shared/types';
import { LIMITS } from '../shared/types';
import {
  asFiniteNumber,
  asString,
  createId,
  isHttpToken,
  isRecord,
  readByteSize,
  readTimingMs,
} from '../shared/validation';
import { emptyBody, pendingBody, textBody, unavailableBody } from './content';
import type { NormalizeResult } from '../shared/types';

export function normalizeHarEntry(entry: unknown): NormalizeResult {
  if (!isRecord(entry) || !isRecord(entry.request)) return { ok: false, reason: 'not-an-object' };
  const request = entry.request;
  const url = asString(request.url);
  if (!url) return { ok: false, reason: 'missing-url' };

  const response = isRecord(entry.response) ? entry.response : {};
  const notes: string[] = [];
  const limitedUrl = limitUrl(url, notes);
  const method = (asString(request.method) ?? '').toUpperCase();
  const content = isRecord(response.content) ? response.content : {};
  const responseMime = asString(content.mimeType);
  const status = readStatus(response);
  const requestHeaders = readHeaders(request.headers, notes);
  const responseHeaders = readHeaders(response.headers, notes);
  const query = readQuery(request.queryString, limitedUrl, notes);
  const requestBody = readRequestBody(request, method);
  const responseBody = readInitialResponseBody(entry, response, content, responseMime);

  const captured: CapturedRequest = {
    id: createId(),
    method: method || 'UNAVAILABLE',
    url: limitedUrl,
    startedAt: readStarted(entry.startedDateTime),
    durationMs: readTimingMs(entry.time),
    resourceType: asString(entry._resourceType),
    status: status.status,
    statusText: asString(response.statusText),
    httpVersion: asString(response.httpVersion) ?? asString(request.httpVersion),
    fromCache: readFromCache(entry._fromCache),
    errorText: status.errorText,
    requestHeaders,
    responseHeaders,
    query,
    requestBody,
    responseBody,
    requestMimeType: readRequestMime(request),
    responseMimeType: responseMime,
    timings: readTimings(entry.timings, readTimingMs(entry.time)),
    serverIp: asString(entry.serverIPAddress),
    source: 'live',
    captureNotes: notes,
    sensitiveScanLimited: requestBody.truncated || responseBody.truncated,
  };

  if (!method) captured.captureNotes.push('Chrome did not include an HTTP method.');
  return { ok: true, request: captured };
}

function limitUrl(url: string, notes: string[]): string {
  if (url.length <= LIMITS.maxUrlChars) return url;
  notes.push('The URL was truncated because it exceeded the panel limit.');
  return url.slice(0, LIMITS.maxUrlChars);
}

function readStatus(response: Record<string, unknown>): { status: number | null; errorText: string | null } {
  const reported = asString(response._error);
  const errorText = reported && reported.trim() ? reported : null;
  const status = asFiniteNumber(response.status);
  if (status === null) return { status: null, errorText };
  if (status === 0) {
    return {
      status: null,
      errorText: errorText ?? 'Chrome reported this request as failed (HTTP status 0).',
    };
  }
  return { status, errorText };
}

function readStarted(value: unknown): string | null {
  const text = asString(value);
  if (!text) return null;
  const time = Date.parse(text);
  return Number.isNaN(time) ? null : new Date(time).toISOString();
}

function readFromCache(value: unknown): boolean {
  if (value === true) return true;
  return typeof value === 'string' && value.length > 0;
}

function readHeaders(value: unknown, notes: string[]): HeaderPair[] {
  if (!Array.isArray(value)) return [];
  const headers: HeaderPair[] = [];
  let omitted = 0;
  for (const item of value) {
    if (!isRecord(item) || typeof item.name !== 'string') {
      omitted += 1;
      continue;
    }
    if (headers.length >= LIMITS.maxHeaderCount) {
      omitted += 1;
      continue;
    }
    const rawValue = typeof item.value === 'string' ? item.value : '';
    const truncated = rawValue.length > LIMITS.maxHeaderValueChars;
    headers.push({
      name: item.name,
      value: truncated ? rawValue.slice(0, LIMITS.maxHeaderValueChars) : rawValue,
    });
    if (truncated) notes.push(`Header ${safeHeaderNote(item.name)} was truncated.`);
  }
  if (omitted > 0) notes.push(`${omitted} header${omitted === 1 ? '' : 's'} could not be kept.`);
  return headers;
}

function safeHeaderNote(name: string): string {
  return isHttpToken(name) ? name : 'with an unusual name';
}

function readQuery(value: unknown, url: string, notes: string[]): QueryParam[] {
  const fromHar = Array.isArray(value) ? readQueryItems(value) : [];
  if (fromHar.length > 0) return capQuery(fromHar, notes);
  try {
    const parsed = new URL(url).searchParams;
    return capQuery([...parsed.entries()].map(([name, itemValue]) => ({ name, value: itemValue })), notes);
  } catch {
    return [];
  }
}

function readQueryItems(items: unknown[]): QueryParam[] {
  const query: QueryParam[] = [];
  for (const item of items) {
    if (!isRecord(item) || typeof item.name !== 'string') continue;
    query.push({ name: item.name, value: typeof item.value === 'string' ? item.value : '' });
  }
  return query;
}

function capQuery(query: QueryParam[], notes: string[]): QueryParam[] {
  if (query.length <= LIMITS.maxQueryParams) return query;
  notes.push('Some query parameters were omitted because the list was too long.');
  return query.slice(0, LIMITS.maxQueryParams);
}

function readRequestMime(request: Record<string, unknown>): string | null {
  const postData = isRecord(request.postData) ? request.postData : null;
  return asString(postData?.mimeType);
}

function readRequestBody(request: Record<string, unknown>, method: string): BodySnapshot {
  const postData = isRecord(request.postData) ? request.postData : null;
  const mime = asString(postData?.mimeType);
  const bodySize = readByteSize(request.bodySize);
  if (postData && typeof postData.text === 'string') {
    const body = textBody(postData.text, mime, bodySize ?? postData.text.length);
    if (postData.text.length === 0) return emptyBody('The request body was empty.');
    return body;
  }

  if (postData && Array.isArray(postData.params) && postData.params.length > 0) {
    const params = readQueryItems(postData.params);
    const encoded = new URLSearchParams(params.map((param) => [param.name, param.value])).toString();
    return textBody(encoded, mime ?? 'application/x-www-form-urlencoded', bodySize ?? encoded.length);
  }

  if (bodySize === 0 || method === 'GET' || method === 'HEAD') return emptyBody('No request body.');
  return unavailableBody('Chrome did not include the request body for this request.', mime, bodySize);
}

function readInitialResponseBody(
  entry: Record<string, unknown>,
  response: Record<string, unknown>,
  content: Record<string, unknown>,
  mimeType: string | null,
): BodySnapshot {
  if (typeof content.text === 'string') {
    if (content.text.length === 0) return emptyBody('The response body was empty.');
    return textBody(content.text, mimeType, readByteSize(content.size) ?? content.text.length);
  }
  if (typeof entry.getContent === 'function') return pendingBody(mimeType);
  const size = readByteSize(response.bodySize) ?? readByteSize(content.size);
  if (size === 0) return emptyBody('The response body was empty.');
  return unavailableBody('Chrome did not include the response body in the DevTools record.', mimeType, size);
}

function readTimings(value: unknown, totalMs: number | null): TimingInfo | null {
  if (!isRecord(value) && totalMs === null) return null;
  const timings = isRecord(value) ? value : {};
  return {
    blockedMs: readTimingMs(timings.blocked),
    dnsMs: readTimingMs(timings.dns),
    connectMs: readTimingMs(timings.connect),
    sslMs: readTimingMs(timings.ssl),
    sendMs: readTimingMs(timings.send),
    waitMs: readTimingMs(timings.wait),
    receiveMs: readTimingMs(timings.receive),
    totalMs,
  };
}
