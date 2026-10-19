import { describe, expect, it } from 'vitest';
import { filterRequests, visibleSlice } from '../src/filter/filterRequests';
import { makeRequest } from './helpers';

const requests = [
  makeRequest({ id: 'a', method: 'GET', url: 'https://api.example.test/v1/items', status: 200 }),
  makeRequest({ id: 'b', method: 'POST', url: 'https://api.example.test/v1/session', status: 401 }),
  makeRequest({ id: 'c', method: 'GET', url: 'https://cdn.example.test/app.js', status: 500 }),
  makeRequest({
    id: 'd',
    method: 'TRACE',
    url: 'https://api.example.test/trace',
    status: null,
    statusText: null,
    errorText: 'net::ERR_FAILED',
  }),
  makeRequest({ id: 'e', method: 'GET', url: 'https://api.example.test/unknown', status: null, statusText: null }),
];

describe('filterRequests', () => {
  it('filters by URL and hostname', () => {
    const matched = filterRequests(requests, { search: 'cdn.example.test', method: 'ALL', status: 'all' });
    expect(matched.map((request) => request.id)).toEqual(['c']);
    const byPath = filterRequests(requests, { search: '/v1/session', method: 'ALL', status: 'all' });
    expect(byPath.map((request) => request.id)).toEqual(['b']);
  });

  it('filters by method, including uncommon methods', () => {
    expect(filterRequests(requests, { search: '', method: 'POST', status: 'all' }).map((request) => request.id)).toEqual(['b']);
    expect(filterRequests(requests, { search: '', method: 'OTHER', status: 'all' }).map((request) => request.id)).toEqual(['d']);
  });

  it('filters by status and failure category without treating missing status as an error', () => {
    expect(filterRequests(requests, { search: '', method: 'ALL', status: '4xx' }).map((request) => request.id)).toEqual(['b']);
    expect(filterRequests(requests, { search: '', method: 'ALL', status: '5xx' }).map((request) => request.id)).toEqual(['c']);
    expect(filterRequests(requests, { search: '', method: 'ALL', status: 'network' }).map((request) => request.id)).toEqual(['d']);
    const failed = filterRequests(requests, { search: '', method: 'ALL', status: 'failed' }).map((request) => request.id);
    expect(failed).toEqual(['b', 'c', 'd']);
    expect(failed).not.toContain('e');
  });

  it('limits how many rows are rendered', () => {
    const sliced = visibleSlice(requests, 2);
    expect(sliced.visible).toHaveLength(2);
    expect(sliced.hiddenCount).toBe(3);
  });
});
