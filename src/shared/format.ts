export function formatDuration(durationMs: number | null): string {
  if (durationMs === null || !Number.isFinite(durationMs) || durationMs < 0) return 'Unavailable';
  if (durationMs < 1000) return `${Math.round(durationMs)} ms`;
  if (durationMs < 10_000) return `${(durationMs / 1000).toFixed(2)} s`;
  return `${Math.round(durationMs / 1000)} s`;
}

export function formatBytes(byteLength: number | null): string {
  if (byteLength === null || !Number.isFinite(byteLength) || byteLength < 0) return 'Unavailable';
  if (byteLength < 1024) return `${Math.round(byteLength)} B`;
  if (byteLength < 1024 * 1024) return `${(byteLength / 1024).toFixed(1)} KB`;
  return `${(byteLength / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatTime(iso: string | null): string {
  if (!iso) return 'Unavailable';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unavailable';
  return date.toLocaleString();
}

export function statusLabel(status: number | null, errorText: string | null): string {
  if (status === null) return errorText ? 'Failed' : 'Unavailable';
  return String(status);
}

export function hostnameOf(url: string): string | null {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
}

export function pathOf(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}` || '/';
  } catch {
    return url;
  }
}
