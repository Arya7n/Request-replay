import { describe, expect, it } from 'vitest';
import { compareSnapshots } from '../src/compare/compareSnapshots';
import { requestComparison } from '../src/compare/requestComparison';
import { snapshotFromRequest } from '../src/compare/snapshot';
import { makeRequest } from './helpers';

describe('response comparison', () => {
  it('treats matching JSON responses as the same', () => {
    const result = compareSnapshots(snapshot({ status: 200, body: '{"ok":true}' }), snapshot({ status: 200, body: '{"ok":true}' }));
    expect(result.status.same).toBe(true);
    expect(result.body.kind).toBe('json');
    if (result.body.kind !== 'json') return;
    expect(result.body.same).toBe(true);
    expect(result.body.changes).toEqual([]);
  });

  it('reports a status change and JSON field changes', () => {
    const result = compareSnapshots(
      snapshot({ status: 200, body: '{"user":"ada","role":"admin"}' }),
      snapshot({ status: 201, body: '{"user":"ada","active":true}' }),
    );
    expect(result.status).toMatchObject({ left: 200, right: 201, same: false });
    expect(result.body.kind).toBe('json');
    if (result.body.kind !== 'json') return;
    expect(result.body.changes.map((change) => `${change.kind} ${change.path}`).sort()).toEqual([
      'added $.active',
      'removed $.role',
    ]);
  });

  it('falls back to text when the body is not JSON', () => {
    const result = compareSnapshots(snapshot({ status: 200, body: 'hello' }), snapshot({ status: 200, body: 'hello!' }));
    expect(result.body).toEqual({ kind: 'text', same: false });
  });

  it('redacts sensitive response headers before they leave the panel', async () => {
    const sent: string[] = [];
    const outcome = await requestComparison(
      snapshotFromRequest(
        makeRequest({
          responseHeaders: [{ name: 'Set-Cookie', value: 'session=dummy-session-value' }],
          responseBody: { availability: 'available', text: '{"token":"dummy-token-not-real"}', mimeType: 'application/json', byteLength: 20, truncated: false, message: null },
        }),
      ),
      snapshotFromRequest(makeRequest({ responseBody: { availability: 'available', text: '{"token":"other"}', mimeType: 'application/json', byteLength: 16, truncated: false, message: null } })),
      {
        apiBase: 'http://127.0.0.1:9',
        fetchImpl: async (_url, init) => {
          sent.push(String(init?.body));
          throw new Error('offline');
        },
      },
    );
    expect(sent[0]).not.toContain('dummy-session-value');
    expect(sent[0]).not.toContain('dummy-token-not-real');
    expect(outcome.source).toBe('local');
    expect(outcome.error).toContain('unreachable');
  });
});

function snapshot(input: { status: number; body: string }) {
  return {
    label: 'test',
    status: input.status,
    headers: [{ name: 'Content-Type', value: 'application/json' }],
    body: input.body,
  };
}
