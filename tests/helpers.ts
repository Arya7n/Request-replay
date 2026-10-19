import type { BodySnapshot, CapturedRequest, HeaderPair } from '../src/shared/types';

const emptyBody = (message: string): BodySnapshot => ({
  availability: 'empty',
  text: null,
  mimeType: null,
  byteLength: 0,
  truncated: false,
  message,
});

export function makeRequest(overrides: Partial<CapturedRequest> = {}): CapturedRequest {
  const headers: HeaderPair[] = overrides.requestHeaders ?? [{ name: 'Accept', value: 'application/json' }];
  return {
    id: overrides.id ?? 'req-1',
    method: overrides.method ?? 'GET',
    url: overrides.url ?? 'http://127.0.0.1:4173/api/items',
    startedAt: overrides.startedAt ?? '2026-10-19T15:00:00.000Z',
    durationMs: overrides.durationMs === undefined ? 20 : overrides.durationMs,
    resourceType: overrides.resourceType === undefined ? 'fetch' : overrides.resourceType,
    status: overrides.status === undefined ? 200 : overrides.status,
    statusText: overrides.statusText === undefined ? 'OK' : overrides.statusText,
    httpVersion: overrides.httpVersion === undefined ? 'HTTP/1.1' : overrides.httpVersion,
    fromCache: overrides.fromCache ?? false,
    errorText: overrides.errorText ?? null,
    requestHeaders: headers,
    responseHeaders: overrides.responseHeaders ?? [{ name: 'Content-Type', value: 'application/json' }],
    query: overrides.query ?? [],
    requestBody: overrides.requestBody ?? emptyBody('No request body.'),
    responseBody: overrides.responseBody ?? emptyBody('The response body was empty.'),
    requestMimeType: overrides.requestMimeType === undefined ? null : overrides.requestMimeType,
    responseMimeType: overrides.responseMimeType === undefined ? 'application/json' : overrides.responseMimeType,
    timings: overrides.timings === undefined ? null : overrides.timings,
    serverIp: overrides.serverIp === undefined ? null : overrides.serverIp,
    source: overrides.source ?? 'live',
    captureNotes: overrides.captureNotes ?? [],
    sensitiveScanLimited: overrides.sensitiveScanLimited ?? false,
  };
}

export function executableLines(command: string): string {
  return command
    .split('\n')
    .filter((line) => !line.trim().startsWith('#'))
    .join('\n');
}
