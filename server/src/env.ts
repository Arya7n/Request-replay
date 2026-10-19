export const EXTENSION_ORIGIN = 'chrome-extension://jalnnfhdjdmoibmlogjpcgaaoclolihe';

export type ServerEnv = {
  port: number;
  allowedOrigin: string;
};

export function readEnv(source: NodeJS.ProcessEnv = process.env): ServerEnv {
  const port = Number(source.PORT ?? 3000);
  const allowedOrigin = source.ALLOWED_ORIGIN?.trim() || EXTENSION_ORIGIN;
  return {
    port: Number.isInteger(port) && port > 0 && port < 65536 ? port : 3000,
    allowedOrigin,
  };
}
