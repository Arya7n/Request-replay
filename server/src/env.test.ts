import { describe, expect, it } from 'vitest';
import { EXTENSION_ORIGIN, readEnv } from './env';

describe('server environment', () => {
  it('keeps the extension origin when the configured origin is open', () => {
    expect(readEnv({ ALLOWED_ORIGIN: '*', PORT: '3000' }).allowedOrigin).toBe(EXTENSION_ORIGIN);
    expect(readEnv({ ALLOWED_ORIGIN: 'https://example.test' }).allowedOrigin).toBe(EXTENSION_ORIGIN);
    expect(readEnv({ ALLOWED_ORIGIN: EXTENSION_ORIGIN }).allowedOrigin).toBe(EXTENSION_ORIGIN);
  });

  it('listens on all interfaces so a host can reach the port', () => {
    expect(readEnv({}).host).toBe('0.0.0.0');
    expect(readEnv({ HOST: '127.0.0.1', PORT: '4000' })).toMatchObject({ host: '127.0.0.1', port: 4000 });
  });
});
