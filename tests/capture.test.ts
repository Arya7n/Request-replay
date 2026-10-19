import { describe, expect, it } from 'vitest';
import { interpretContent, readResponseBody } from '../src/capture/content';
import { extractHarEntries, fingerprintEntry } from '../src/capture/har';
import { normalizeHarEntry } from '../src/capture/normalize';
import { mergeInitialEntries, prependLive, sortNewestFirst } from '../src/capture/session';
import { callWithCallbackOrPromise } from '../src/capture/callback';
import { LIMITS } from '../src/shared/types';
import { makeRequest } from './helpers';

describe('normalizeHarEntry', () => {
  it('reads the fields Chrome puts on a HAR entry and leaves the rest unavailable', () => {
    const result = normalizeHarEntry({
      startedDateTime: '2026-10-19T15:04:00.000Z',
      time: 41,
      serverIPAddress: '127.0.0.1',
      _resourceType: 'xhr',
      request: {
        method: 'post',
        url: 'http://127.0.0.1:4173/api/session?q=widget',
        headers: [{ name: 'Content-Type', value: 'application/json' }, { name: 'Accept' }],
        queryString: [{ name: 'q', value: 'widget' }],
        postData: { mimeType: 'application/json', text: '{"username":"demo-user"}' },
        bodySize: 28,
      },
      response: {
        status: 201,
        statusText: 'Created',
        httpVersion: 'HTTP/1.1',
        headers: [{ name: 'Content-Type', value: 'application/json' }],
        content: { mimeType: 'application/json', size: 11 },
        bodySize: 11,
      },
      timings: { blocked: -1, dns: 2, connect: 3, ssl: -1, send: 1, wait: 30, receive: 5 },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.method).toBe('POST');
    expect(result.request.status).toBe(201);
    expect(result.request.serverIp).toBe('127.0.0.1');
    expect(result.request.resourceType).toBe('xhr');
    expect(result.request.durationMs).toBe(41);
    expect(result.request.query).toEqual([{ name: 'q', value: 'widget' }]);
    expect(result.request.requestBody.text).toContain('demo-user');
    expect(result.request.responseBody.availability).toBe('unavailable');
    expect(result.request.timings?.dnsMs).toBe(2);
    expect(result.request.timings?.blockedMs).toBeNull();
    expect(result.request.errorText).toBeNull();
  });

  it('does not invent a network error when the status is simply missing', () => {
    const result = normalizeHarEntry({ request: { method: 'GET', url: 'http://127.0.0.1/only' } });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBeNull();
    expect(result.request.errorText).toBeNull();
    expect(result.request.serverIp).toBeNull();
    expect(result.request.durationMs).toBeNull();
  });

  it('records Chrome status 0 and _error as a failure without a fake HTTP code', () => {
    const result = normalizeHarEntry({
      request: { method: 'GET', url: 'http://127.0.0.1:9/nope' },
      response: { status: 0, statusText: '', _error: 'net::ERR_CONNECTION_REFUSED' },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.request.status).toBeNull();
    expect(result.request.errorText).toBe('net::ERR_CONNECTION_REFUSED');
  });

  it('rejects malformed entries', () => {
    expect(normalizeHarEntry(null).ok).toBe(false);
    expect(normalizeHarEntry({ request: { method: 'GET' } }).ok).toBe(false);
    expect(normalizeHarEntry([]).ok).toBe(false);
  });

  it('marks a POST without postData as unavailable and a GET as empty', () => {
    const post = normalizeHarEntry({ request: { method: 'POST', url: 'http://127.0.0.1/form', bodySize: -1 } });
    const get = normalizeHarEntry({ request: { method: 'GET', url: 'http://127.0.0.1/form' } });
    expect(post.ok && post.request.requestBody.availability).toBe('unavailable');
    expect(get.ok && get.request.requestBody.availability).toBe('empty');
  });
});

describe('response content', () => {
  it('accepts text, Chrome 151 objects, and empty bodies', () => {
    expect(interpretContent('{"ok":true}', '', 'application/json').text).toBe('{"ok":true}');
    expect(interpretContent({ content: 'hello', encoding: '' }, undefined, 'text/plain').text).toBe('hello');
    expect(interpretContent('', '', 'text/plain').availability).toBe('empty');
    expect(interpretContent({ nope: true }, undefined, 'text/plain').availability).toBe('error');
  });

  it('decodes textual base64 and hides binary content', () => {
    const encoded = Buffer.from('{"ok":true}', 'utf8').toString('base64');
    const decoded = interpretContent(encoded, 'base64', 'application/json');
    expect(decoded.availability).toBe('available');
    expect(decoded.text).toBe('{"ok":true}');
    const binary = interpretContent(Buffer.from([0, 1, 2, 3, 0]).toString('base64'), 'base64', 'image/png');
    expect(binary.availability).toBe('binary');
    expect(binary.text).toBeNull();
  });

  it('reads promise and callback content APIs and reports failures', async () => {
    const promised = await readResponseBody(
      { getContent: () => Promise.resolve({ content: 'from-promise', encoding: '' }) },
      'text/plain',
    );
    expect(promised.text).toBe('from-promise');

    const callback = await readResponseBody(
      {
        getContent(done?: (content: string, encoding: string) => void) {
          if (done) done('from-callback', '');
        },
      },
      'text/plain',
    );
    expect(callback.text).toBe('from-callback');

    const failed = await readResponseBody(
      { getContent: () => Promise.reject(new Error('nope')) },
      'text/plain',
    );
    expect(failed.availability).toBe('error');
    expect(failed.message).not.toContain('nope');

    const missing = await readResponseBody({}, 'text/plain');
    expect(missing.availability).toBe('unavailable');
  });
});

describe('initial HAR sync', () => {
  it('accepts both HAR log shapes and deduplicates the listener buffer', () => {
    const entry = { request: { method: 'GET', url: 'http://127.0.0.1/a' }, startedDateTime: '2026-10-19T15:00:00.000Z', time: 1, response: { status: 200 } };
    const extra = { request: { method: 'GET', url: 'http://127.0.0.1/b' }, startedDateTime: '2026-10-19T15:00:01.000Z', time: 2, response: { status: 204 } };
    expect(extractHarEntries({ entries: [entry] }).entries).toHaveLength(1);
    expect(extractHarEntries({ log: { entries: [entry, extra] } }).entries).toHaveLength(2);
    expect(extractHarEntries({ unexpected: true }).ok).toBe(false);

    const duplicate = { ...entry };
    const merged = mergeInitialEntries([entry, extra], [duplicate, { request: { method: 'PUT', url: 'http://127.0.0.1/c' }, response: { status: 200 } }]);
    expect(merged.skipped).toBe(0);
    expect(merged.items.map((item) => item.request.url)).toEqual([
      'http://127.0.0.1/a',
      'http://127.0.0.1/b',
      'http://127.0.0.1/c',
    ]);
    expect(fingerprintEntry(entry)).toBe(fingerprintEntry(duplicate));
  });

  it('sorts newest first and drops the oldest live request past the cap', () => {
    const older = makeRequest({ id: 'old', startedAt: '2026-10-19T15:00:00.000Z' });
    const newer = makeRequest({ id: 'new', startedAt: '2026-10-19T16:00:00.000Z' });
    expect(sortNewestFirst([older, newer]).map((request) => request.id)).toEqual(['new', 'old']);
    const many = Array.from({ length: LIMITS.maxLiveRequests }, (_, index) => makeRequest({ id: `id-${index}` }));
    const next = prependLive(many, makeRequest({ id: 'fresh' }));
    expect(next.dropped).toBe(true);
    expect(next.requests[0]?.id).toBe('fresh');
    expect(next.requests).toHaveLength(LIMITS.maxLiveRequests);
  });

  it('supports callback and promise DevTools calls', async () => {
    await expect(callWithCallbackOrPromise((callback) => callback('har'))).resolves.toBe('har');
    await expect(callWithCallbackOrPromise(() => Promise.resolve({ entries: [] }))).resolves.toEqual({ entries: [] });
    await expect(callWithCallbackOrPromise(() => Promise.reject(new Error('log failed')))).rejects.toThrow('log failed');
  });
});
