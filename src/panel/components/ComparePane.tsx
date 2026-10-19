import { useState } from 'react';
import { requestComparison, type ComparisonOutcome } from '../../compare/requestComparison';
import { snapshotFromRequest } from '../../compare/snapshot';
import type { FieldChange } from '../../compare/compareSnapshots';
import type { CapturedRequest } from '../../shared/types';
import { statusLabel } from '../../shared/format';

export function ComparePane({
  requests,
  selectedId,
  apiBase,
}: {
  requests: CapturedRequest[];
  selectedId: string;
  apiBase: string;
}) {
  const fallback = requests.find((request) => request.id !== selectedId)?.id ?? selectedId;
  const [leftId, setLeftId] = useState(selectedId);
  const [rightId, setRightId] = useState(fallback);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<ComparisonOutcome | null>(null);

  const run = async () => {
    const left = requests.find((request) => request.id === leftId);
    const right = requests.find((request) => request.id === rightId);
    if (!left || !right) return;
    setBusy(true);
    const next = await requestComparison(snapshotFromRequest(left), snapshotFromRequest(right), { apiBase });
    setOutcome(next);
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-3">
      <p className="rr-muted">
        Comparison uses redacted response status, headers, and body. Passwords, tokens, and cookies are replaced before
        anything is sent. If the API is down, the same comparison runs in this panel.
      </p>
      {requests.length < 2 ? (
        <p className="rr-muted">Capture or select at least two responses before comparing.</p>
      ) : (
        <div className="flex flex-wrap items-end gap-2">
          <RequestSelect label="Left response" requests={requests} value={leftId} onChange={setLeftId} />
          <RequestSelect label="Right response" requests={requests} value={rightId} onChange={setRightId} />
          <button type="button" className="rr-button rr-button-primary" onClick={() => void run()} disabled={busy}>
            {busy ? 'Comparing…' : 'Compare'}
          </button>
        </div>
      )}
      {outcome ? <CompareResultView outcome={outcome} /> : null}
    </div>
  );
}

function RequestSelect({
  label,
  requests,
  value,
  onChange,
}: {
  label: string;
  requests: CapturedRequest[];
  value: string;
  onChange: (id: string) => void;
}) {
  return (
    <label className="rr-field min-w-48 flex-1">
      {label}
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {requests.map((request) => (
          <option key={request.id} value={request.id}>
            {request.method} {statusLabel(request.status, request.errorText)} {shortUrl(request.url)}
          </option>
        ))}
      </select>
    </label>
  );
}

function CompareResultView({ outcome }: { outcome: ComparisonOutcome }) {
  const { result } = outcome;
  return (
    <div className="rr-stack">
      {outcome.error ? (
        <p className="rr-banner rr-banner-warn" role="status">
          {outcome.error}
        </p>
      ) : (
        <p className="rr-banner" role="status">
          Compared by the local API.
        </p>
      )}
      <p>
        Status {formatStatus(result.status.left)} → {formatStatus(result.status.right)}
        {result.status.same ? ' (same)' : ' (different)'}
      </p>
      <ChangeList title="Response headers" changes={result.headers} truncated={result.headerChangesTruncated} />
      <BodyDiff body={result.body} />
    </div>
  );
}

function ChangeList({ title, changes, truncated }: { title: string; changes: FieldChange[]; truncated: boolean }) {
  return (
    <section>
      <h3>{title}</h3>
      {changes.length === 0 ? (
        <p className="rr-muted">No differences.</p>
      ) : (
        <ul className="rr-notes">
          {changes.map((change) => (
            <li key={`${change.kind}-${change.path}`}>
              {change.kind} {change.path}
              {change.kind === 'changed' ? `: ${change.left ?? 'empty'} → ${change.right ?? 'empty'}` : ''}
            </li>
          ))}
        </ul>
      )}
      {truncated ? <p className="rr-muted">Further differences were omitted.</p> : null}
    </section>
  );
}

function BodyDiff({ body }: { body: ComparisonOutcome['result']['body'] }) {
  if (body.kind === 'unavailable') return <p className="rr-muted">{body.message}</p>;
  if (body.kind === 'text') {
    return <p>{body.same ? 'The response text matches.' : 'The response text is different. It was not compared as JSON.'}</p>;
  }
  return <ChangeList title="JSON fields" changes={body.changes} truncated={body.truncated} />;
}

function formatStatus(status: number | null): string {
  return status === null ? 'unavailable' : String(status);
}

function shortUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.pathname}${parsed.search}`.slice(0, 80);
  } catch {
    return url.slice(0, 80);
  }
}
