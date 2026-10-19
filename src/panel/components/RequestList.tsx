import { useEffect, useRef } from 'react';
import type { CapturedRequest } from '../../shared/types';
import { formatDuration, hostnameOf, statusLabel } from '../../shared/format';
import { matchesStatus } from '../../filter/filterRequests';
import { displayUrl } from '../../redact/url';

export function RequestList({
  requests,
  total,
  hiddenCount,
  selectedId,
  revealSensitive,
  loading,
  filteredOut,
  onSelect,
  onShowMore,
}: {
  requests: CapturedRequest[];
  total: number;
  hiddenCount: number;
  selectedId: string | null;
  revealSensitive: boolean;
  loading: boolean;
  filteredOut: boolean;
  onSelect: (id: string) => void;
  onShowMore: () => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const selected = listRef.current?.querySelector<HTMLElement>('[aria-selected="true"]');
    selected?.scrollIntoView({ block: 'nearest' });
  }, [selectedId]);

  const move = (direction: 1 | -1) => {
    if (requests.length === 0) return;
    const index = requests.findIndex((request) => request.id === selectedId);
    const next = requests[Math.min(requests.length - 1, Math.max(0, index + direction))];
    if (next) onSelect(next.id);
  };

  return (
    <section className="rr-list-pane" aria-label="Captured requests">
      <div
        ref={listRef}
        className="rr-list"
        role="listbox"
        aria-label="Requests"
        tabIndex={0}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown') {
            event.preventDefault();
            move(1);
          } else if (event.key === 'ArrowUp') {
            event.preventDefault();
            move(-1);
          }
        }}
      >
        {requests.length === 0 ? (
          <div className="rr-empty">
            <h2>
              {loading ? 'Reading the DevTools network log…' : filteredOut ? 'No requests match' : 'No requests yet'}
            </h2>
            {loading ? (
              <p>Requests that are already in this DevTools session will appear here. This is not sample traffic.</p>
            ) : filteredOut ? (
              <p>Nothing in the current list matches this search or filter. Clear the search or choose All methods and All statuses.</p>
            ) : (
              <>
                <p>
                  RequestReplay reads the network log for the page inspected by this DevTools window. It does not see
                  other tabs, and it cannot recover requests that finished before DevTools opened.
                </p>
                <p>Reload the inspected page, or trigger a request. The list matches what Chrome still has in this session.</p>
              </>
            )}
          </div>
        ) : (
          requests.map((request) => {
            const failed = matchesStatus(request, 'failed');
            const shown = displayUrl(request.url, revealSensitive);
            const host = hostnameOf(shown);
            let path = shown;
            try {
              const url = new URL(shown);
              path = `${url.pathname}${url.search}`;
            } catch {
              path = shown;
            }
            return (
              <button
                key={request.id}
                type="button"
                role="option"
                aria-selected={request.id === selectedId}
                tabIndex={-1}
                className={failed ? 'rr-row rr-row-failed' : 'rr-row'}
                data-method={request.method.toLowerCase()}
                onClick={() => onSelect(request.id)}
              >
                <span className="rr-method">{request.method}</span>
                <span className={failed ? 'rr-status rr-status-failed' : 'rr-status'}>
                  {statusLabel(request.status, request.errorText)}
                </span>
                <span className="rr-duration" title={request.durationMs === null ? 'Duration unavailable' : undefined}>
                  {request.durationMs === null ? 'n/a' : formatDuration(request.durationMs)}
                </span>
                <span className="rr-type">{request.resourceType ?? 'n/a'}</span>
                <span className="rr-url">
                  <span className="rr-path">{path}</span>
                  {host ? <span className="rr-host">{host}</span> : null}
                </span>
              </button>
            );
          })
        )}
      </div>
      <footer className="rr-list-footer">
        <span>
          {total === 0 ? '0 requests' : `Showing ${requests.length} of ${total}`}
          <span className="rr-kbd-hint"> · ↑↓ select · / search</span>
        </span>
        {hiddenCount > 0 ? (
          <button type="button" className="rr-button" onClick={onShowMore}>
            Show {Math.min(hiddenCount, 150)} more
          </button>
        ) : null}
      </footer>
    </section>
  );
}
