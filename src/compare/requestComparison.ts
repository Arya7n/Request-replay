import { compareSnapshots, type CompareResult, type CompareSnapshot } from './compareSnapshots';

export type ComparisonOutcome = {
  result: CompareResult;
  source: 'api' | 'local';
  error: string | null;
};

type FetchLike = (input: string, init?: { method?: string; headers?: Record<string, string>; body?: string }) => Promise<{
  ok: boolean;
  status: number;
  json: () => Promise<unknown>;
}>;

export async function requestComparison(
  left: CompareSnapshot,
  right: CompareSnapshot,
  options: { apiBase: string; fetchImpl?: FetchLike },
): Promise<ComparisonOutcome> {
  const local = compareSnapshots(left, right);
  const base = options.apiBase.replace(/\/$/, '');
  if (!base) return { result: local, source: 'local', error: 'No comparison API is configured. This result was computed in the panel.' };

  const fetchImpl = options.fetchImpl ?? fetch;
  try {
    const response = await fetchImpl(`${base}/api/compare`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ left, right }),
    });
    if (!response.ok) {
      return {
        result: local,
        source: 'local',
        error: `The comparison API returned ${response.status}. This result was computed in the panel.`,
      };
    }
    const payload = (await response.json()) as CompareResult;
    if (!payload || typeof payload !== 'object' || !payload.status || !payload.body) {
      return { result: local, source: 'local', error: 'The comparison API returned an unexpected result. Showing the panel comparison.' };
    }
    return { result: payload, source: 'api', error: null };
  } catch {
    return {
      result: local,
      source: 'local',
      error: 'The comparison API is unreachable. This result was computed in the panel.',
    };
  }
}
