import type { CapturedRequest, MethodFilter, StatusFilter } from '../shared/types';
import { hostnameOf } from '../shared/format';

export type FilterQuery = {
  search: string;
  method: MethodFilter;
  status: StatusFilter;
};

const KNOWN_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS']);

export function filterRequests(requests: CapturedRequest[], query: FilterQuery): CapturedRequest[] {
  const search = query.search.trim().toLowerCase();
  return requests.filter((request) => {
    if (!matchesMethod(request.method, query.method)) return false;
    if (!matchesStatus(request, query.status)) return false;
    if (!search) return true;
    const host = hostnameOf(request.url)?.toLowerCase() ?? '';
    return request.url.toLowerCase().includes(search) || host.includes(search);
  });
}

export function matchesMethod(method: string, filter: MethodFilter): boolean {
  if (filter === 'ALL') return true;
  const normalized = method.toUpperCase();
  if (filter === 'OTHER') return !KNOWN_METHODS.has(normalized);
  return normalized === filter;
}

export function matchesStatus(request: Pick<CapturedRequest, 'status' | 'errorText'>, filter: StatusFilter): boolean {
  if (filter === 'all') return true;
  const status = request.status;
  const network = status === null && Boolean(request.errorText);
  if (filter === 'network') return network;
  if (filter === 'failed') return network || (status !== null && status >= 400);
  if (status === null) return false;
  if (filter === '2xx') return status >= 200 && status < 300;
  if (filter === '3xx') return status >= 300 && status < 400;
  if (filter === '4xx') return status >= 400 && status < 500;
  if (filter === '5xx') return status >= 500 && status < 600;
  return false;
}

export function visibleSlice<T>(items: T[], limit: number): { visible: T[]; hiddenCount: number } {
  const safe = Number.isFinite(limit) && limit > 0 ? Math.floor(limit) : 150;
  return {
    visible: items.slice(0, safe),
    hiddenCount: Math.max(0, items.length - safe),
  };
}
