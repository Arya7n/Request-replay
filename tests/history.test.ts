import { describe, expect, it } from 'vitest';
import { applyHistoryLimit, clearHistoryList, deleteHistory, parseHistory, prepareForStorage, readHistory, upsertHistory, upsertStoredRequest, writeHistory } from '../src/storage/history';
import { loadSettings, saveSettings } from '../src/storage/settings';
import { FailingStore, MemoryStore } from '../src/storage/store';
import { makeRequest } from './helpers';

describe('history limits and storage errors', () => {
  it('keeps the newest requests and replaces an existing id', () => {
    const first = makeRequest({ id: '1', url: 'http://127.0.0.1/one' });
    const second = makeRequest({ id: '2', url: 'http://127.0.0.1/two' });
    const third = makeRequest({ id: '3', url: 'http://127.0.0.1/three' });
    const limited = applyHistoryLimit([first, second, third], 2);
    expect(limited.map((request) => request.id)).toEqual(['2', '3']);

    const replaced = upsertHistory([first, second], makeRequest({ id: '1', url: 'http://127.0.0.1/updated' }), 10);
    expect(replaced.map((request) => request.url)).toEqual(['http://127.0.0.1/two', 'http://127.0.0.1/updated']);
    expect(clearHistoryList()).toEqual([]);
  });

  it('does not keep a pending body in stored history', () => {
    const stored = prepareForStorage(
      makeRequest({
        responseBody: {
          availability: 'pending',
          text: null,
          mimeType: null,
          byteLength: null,
          truncated: false,
          message: 'Loading response body…',
        },
      }),
    );
    expect(stored.source).toBe('history');
    expect(stored.responseBody.availability).toBe('unavailable');
    expect(stored.responseBody.text).toBeNull();
  });

  it('redacts secrets before a request is stored', () => {
    const stored = prepareForStorage(
      makeRequest({
        url: 'https://example.test/session?access_token=dummy-query-token-not-real',
        requestHeaders: [{ name: 'Authorization', value: 'Bearer dummy-token-not-real' }],
        requestBody: {
          availability: 'available',
          text: '{"password":"dummy-password-not-real"}',
          mimeType: 'application/json',
          byteLength: 40,
          truncated: false,
          message: null,
        },
      }),
    );
    expect(JSON.stringify(stored)).not.toContain('dummy-query-token-not-real');
    expect(JSON.stringify(stored)).not.toContain('dummy-token-not-real');
    expect(JSON.stringify(stored)).not.toContain('dummy-password-not-real');
    expect(stored.requestHeaders[0]?.value).toBe('<redacted>');
  });

  it('redacts secrets that were already sitting in stored history', () => {
    const parsed = parseHistory({
      version: 1,
      requests: [
        makeRequest({
          requestHeaders: [{ name: 'Cookie', value: 'session=dummy-session-value' }],
        }),
      ],
    });
    expect(JSON.stringify(parsed.requests)).not.toContain('dummy-session-value');
    expect(parsed.requests[0]?.requestHeaders[0]?.value).toBe('<redacted>');
  });

  it('round-trips valid history and discards malformed entries', () => {
    const store = new MemoryStore();
    const request = makeRequest({ id: 'kept', requestHeaders: [{ name: 'Accept', value: 'text/plain' }] });
    return writeHistory(store, [request], 10).then(async (written) => {
      expect(written.ok).toBe(true);
      const loaded = await readHistory(store);
      expect(loaded.ok).toBe(true);
      if (!loaded.ok) return;
      expect(loaded.requests.map((item) => item.id)).toEqual(['kept']);
      expect(loaded.requests[0]?.requestHeaders[0]?.value).toBe('text/plain');

      const parsed = parseHistory({ version: 1, requests: [request, { id: 'bad' }, 'nope'] });
      expect(parsed.requests).toHaveLength(1);
      expect(parsed.discarded).toBe(2);
      expect(parseHistory(undefined).discarded).toBe(0);
      expect(parseHistory({ version: 2, requests: [] }).requests).toEqual([]);
    });
  });

  it('reports storage failures without throwing', async () => {
    const store = new FailingStore('Storage quota exceeded');
    const written = await writeHistory(store, [makeRequest()], 10);
    expect(written.ok).toBe(false);
    if (written.ok) return;
    expect(written.error).toContain('quota');
    const removed = await deleteHistory(store);
    expect(removed.ok).toBe(false);
    const upserted = await upsertStoredRequest(store, makeRequest(), 10);
    expect(upserted.ok).toBe(false);
  });

  it('falls back when stored settings are incomplete and surfaces save errors', async () => {
    const memory = new MemoryStore();
    await memory.set('requestreplay.settings', { theme: 'nope', historyEnabled: 'yes', historyLimit: 9999 });
    const loaded = await loadSettings(memory);
    expect(loaded.settings.theme).toBe('match-devtools');
    expect(loaded.settings.historyEnabled).toBe(false);
    expect(loaded.settings.historyLimit).toBe(200);

    const saved = await saveSettings(memory, loaded.settings);
    expect(saved.ok).toBe(true);
    const failed = await saveSettings(new FailingStore('disk full'), loaded.settings);
    expect(failed.ok).toBe(false);
    const missing = await loadSettings(null);
    expect(missing.settings.historyEnabled).toBe(false);
  });
});
