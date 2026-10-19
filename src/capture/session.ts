import type { CapturedRequest } from '../shared/types';
import { LIMITS } from '../shared/types';
import { fingerprintEntry } from './har';
import { normalizeHarEntry } from './normalize';

export type MergedCapture = {
  request: CapturedRequest;
  entry: unknown;
};

export type MergeResult = {
  items: MergedCapture[];
  skipped: number;
};

export function mergeInitialEntries(harEntries: unknown[], buffered: unknown[]): MergeResult {
  const items: MergedCapture[] = [];
  const counts = new Map<string, number>();
  let skipped = 0;

  const add = (entry: unknown): boolean => {
    const normalized = normalizeHarEntry(entry);
    if (!normalized.ok) {
      skipped += 1;
      return false;
    }
    items.push({ request: normalized.request, entry });
    return true;
  };

  for (const entry of harEntries) {
    if (!add(entry)) continue;
    const fingerprint = fingerprintEntry(entry);
    counts.set(fingerprint, (counts.get(fingerprint) ?? 0) + 1);
  }

  for (const entry of buffered) {
    const fingerprint = fingerprintEntry(entry);
    const remaining = counts.get(fingerprint) ?? 0;
    if (remaining > 0) {
      counts.set(fingerprint, remaining - 1);
      continue;
    }
    add(entry);
  }

  return { items, skipped };
}

export function sortNewestFirst(requests: CapturedRequest[]): CapturedRequest[] {
  return requests
    .map((request, index) => ({ request, index }))
    .sort((left, right) => {
      const leftTime = left.request.startedAt ?? '';
      const rightTime = right.request.startedAt ?? '';
      if (leftTime !== rightTime) return leftTime < rightTime ? 1 : -1;
      return right.index - left.index;
    })
    .map((item) => item.request);
}

export function prependLive(
  current: CapturedRequest[],
  next: CapturedRequest,
): { requests: CapturedRequest[]; dropped: boolean } {
  const combined = [next, ...current];
  if (combined.length <= LIMITS.maxLiveRequests) return { requests: combined, dropped: false };
  return { requests: combined.slice(0, LIMITS.maxLiveRequests), dropped: true };
}
