import type { AddressInfo } from 'node:net';
import { describe, expect, it } from 'vitest';
import { createApp } from './app';
import { EXTENSION_ORIGIN } from './env';

describe('compare API', () => {
  it('reports health and a matching comparison', async () => {
    const server = await listen();
    try {
      const health = await fetch(`${server.url}/health`);
      expect(await health.json()).toEqual({ ok: true });

      const compared = await fetch(`${server.url}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: EXTENSION_ORIGIN },
        body: JSON.stringify({
          left: body('{"ok":true}', 200),
          right: body('{"ok":true}', 200),
        }),
      });
      expect(compared.status).toBe(200);
      expect(compared.headers.get('access-control-allow-origin')).toBe(EXTENSION_ORIGIN);
      const payload = (await compared.json()) as { status: { same: boolean }; body: { kind: string; same: boolean } };
      expect(payload.status.same).toBe(true);
      expect(payload.body).toMatchObject({ kind: 'json', same: true });
    } finally {
      await server.close();
    }
  });

  it('reports a status change and a changed JSON field', async () => {
    const server = await listen();
    try {
      const compared = await fetch(`${server.url}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: EXTENSION_ORIGIN },
        body: JSON.stringify({
          left: body('{"user":"ada"}', 200),
          right: body('{"user":"grace"}', 500),
        }),
      });
      expect(compared.status).toBe(200);
      const payload = (await compared.json()) as {
        status: { same: boolean; left: number; right: number };
        body: { kind: string; changes: Array<{ path: string; kind: string }> };
      };
      expect(payload.status).toMatchObject({ same: false, left: 200, right: 500 });
      expect(payload.body.kind).toBe('json');
      expect(payload.body.changes).toEqual([
        expect.objectContaining({ path: '$.user', kind: 'changed' }),
      ]);
    } finally {
      await server.close();
    }
  });

  it('refuses an origin other than the extension', async () => {
    const server = await listen();
    try {
      const refused = await fetch(`${server.url}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Origin: 'https://example.test' },
        body: JSON.stringify({ left: body('{}', 200), right: body('{}', 200) }),
      });
      expect(refused.status).toBe(403);
      expect(refused.headers.get('access-control-allow-origin')).not.toBe('*');
    } finally {
      await server.close();
    }
  });

  it('rejects a malformed payload and an oversized payload', async () => {
    const server = await listen();
    try {
      const malformed = await fetch(`${server.url}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ left: { label: 'x' } }),
      });
      expect(malformed.status).toBe(400);

      const oversized = await fetch(`${server.url}/api/compare`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ padding: 'x'.repeat(300_000) }),
      });
      expect(oversized.status).toBe(413);
    } finally {
      await server.close();
    }
  });
});

function body(text: string, status: number) {
  return {
    label: 'fixture',
    status,
    headers: [{ name: 'Content-Type', value: 'application/json' }],
    body: text,
  };
}

function listen(): Promise<{ url: string; close: () => Promise<void> }> {
  const app = createApp(EXTENSION_ORIGIN);
  return new Promise((resolve) => {
    const server = app.listen(0, '127.0.0.1', () => {
      const address = server.address() as AddressInfo;
      resolve({
        url: `http://127.0.0.1:${address.port}`,
        close: () =>
          new Promise((done, reject) => {
            server.close((error) => (error ? reject(error) : done()));
          }),
      });
    });
  });
}
