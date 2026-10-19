export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function isPromise(value: unknown): value is Promise<unknown> {
  return isRecord(value) && typeof value.then === 'function';
}

export function asString(value: unknown): string | null {
  return typeof value === 'string' ? value : null;
}

export function asFiniteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function readByteSize(value: unknown): number | null {
  const size = asFiniteNumber(value);
  if (size === null || size < 0) return null;
  return size;
}

export function readTimingMs(value: unknown): number | null {
  const time = asFiniteNumber(value);
  if (time === null || time < 0) return null;
  return time;
}

export function createId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `req-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

export function clampInt(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, Math.floor(value)));
}

export function stripNul(value: string): string {
  return value.includes('\u0000') ? value.replaceAll('\u0000', '') : value;
}

export function commentSafe(value: string): string {
  return value
    .replace(/[\r\n\u0000]/g, ' ')
    .replace(/[^\w .\-:/(),]/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 180);
}

export function mimeBase(mime: string | null): string {
  if (!mime) return '';
  return mime.split(';')[0]?.trim().toLowerCase() ?? '';
}

export function isTextualMime(mime: string | null): boolean {
  const base = mimeBase(mime);
  if (!base) return false;
  if (base.startsWith('text/')) return true;
  if (base.endsWith('+json') || base.endsWith('+xml')) return true;
  return (
    base === 'application/json' ||
    base === 'application/xml' ||
    base === 'application/javascript' ||
    base === 'application/x-javascript' ||
    base === 'application/x-www-form-urlencoded' ||
    base === 'application/graphql' ||
    base === 'application/xhtml+xml' ||
    base === 'image/svg+xml'
  );
}

export function looksLikeJson(text: string): boolean {
  const trimmed = text.trim();
  return (
    (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
    (trimmed.startsWith('[') && trimmed.endsWith(']'))
  );
}

export function isHttpToken(value: string): boolean {
  return /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/.test(value);
}

export function isSafeHttpMethod(value: string): boolean {
  return /^[A-Za-z][A-Za-z0-9+.-]*$/.test(value);
}
