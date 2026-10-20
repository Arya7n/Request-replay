export const EXTENSION_ORIGIN = 'chrome-extension://jalnnfhdjdmoibmlogjpcgaaoclolihe';

export type ServerEnv = {
  port: number;
  host: string;
  allowedOrigin: string;
};

export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const port = Number(source.PORT ?? 3000);
  const host = source.HOST?.trim() || '0.0.0.0';
  return {
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000,
    host: host === 'localhost' ? '127.0.0.1' : host,
    allowedOrigin: sanitizeOrigin(source.ALLOWED_ORIGIN),
  };
}

function sanitizeOrigin(value: string | undefined): string {
  const candidate = value?.trim();
  if (!candidate || candidate === '*' || candidate.includes('*')) return EXTENSION_ORIGIN;
  try {
    const url = new URL(candidate);
    if (url.protocol !== 'chrome-extension:' || url.origin !== candidate) return EXTENSION_ORIGIN;
    return url.origin;
  } catch {
    return EXTENSION_ORIGIN;
  }
}
