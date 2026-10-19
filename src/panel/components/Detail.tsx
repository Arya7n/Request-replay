import { useMemo, useState } from 'react';
import type { BodySnapshot, CapturedRequest, HeaderPair, TimingInfo } from '../../shared/types';
import { formatBytes, formatDuration, formatTime, statusLabel } from '../../shared/format';
import { prettyJson, tokenizeJson } from '../../shared/json';
import { generateCurl } from '../../curl/generateCurl';
import { redactBody } from '../../redact/body';
import { isSensitiveName } from '../../redact/names';
import { displayUrl } from '../../redact/url';
import { copyText } from '../copyText';
import { ComparePane } from './ComparePane';

type DetailTab = 'overview' | 'request' | 'response' | 'timing' | 'curl' | 'compare';

export function Detail({
  request,
  requests,
  apiBase,
  revealSensitive,
  onToggleReveal,
}: {
  request: CapturedRequest | null;
  requests: CapturedRequest[];
  apiBase: string;
  revealSensitive: boolean;
  onToggleReveal: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'failed'>('idle');

  const curl = useMemo(
    () => (request ? generateCurl(request, { includeSensitive: revealSensitive }) : null),
    [request, revealSensitive],
  );

  if (!request || !curl) {
    return (
      <section className="rr-detail">
        <div className="rr-empty">
          <h2>Request details</h2>
          <p>Select a request to inspect its headers, payload, timing, and curl export.</p>
          <p>Values Chrome does not provide are marked unavailable. Nothing here is filled in with sample traffic.</p>
        </div>
      </section>
    );
  }

  const copy = async () => {
    if (!curl.command) {
      setCopyState('failed');
      return;
    }
    const ok = await copyText(curl.command);
    setCopyState(ok ? 'copied' : 'failed');
    window.setTimeout(() => setCopyState('idle'), 2000);
  };

  return (
    <section className="rr-detail" aria-live="polite">
      <header className="rr-detail-head">
        <div>
          <p className="rr-detail-kicker">
            <span className="rr-method" data-method={request.method.toLowerCase()}>
              {request.method}
            </span>
            <span className={request.status !== null && request.status >= 400 ? 'rr-status-failed' : ''}>
              {statusLabel(request.status, request.errorText)}
              {request.statusText ? ` ${request.statusText}` : ''}
            </span>
            <span>{request.durationMs === null ? 'Duration unavailable' : formatDuration(request.durationMs)}</span>
          </p>
          <h2 className="rr-detail-url">{displayUrl(request.url, revealSensitive)}</h2>
        </div>
        <div className="rr-detail-actions">
          <button type="button" className="rr-button rr-button-primary" onClick={() => void copy()} disabled={!curl.command}>
            {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy curl'}
          </button>
          <button type="button" className="rr-button" aria-pressed={revealSensitive} onClick={onToggleReveal}>
            {revealSensitive ? 'Hide sensitive values' : 'Show sensitive values'}
          </button>
        </div>
      </header>

      {curl.sensitiveDetected ? (
        <p className="rr-banner rr-banner-warn" role="status">
          This request may contain sensitive data
          {curl.redactedNames.length > 0 ? `: ${curl.redactedNames.join(', ')}` : ''}. Curl output redacts those
          values until you explicitly show them. Detection is heuristic and can miss secrets.
        </p>
      ) : null}
      {revealSensitive ? (
        <p className="rr-banner rr-banner-warn" role="status">
          Sensitive values are visible and will be copied into the curl command. This choice lasts only for the current
          panel session.
        </p>
      ) : null}
      {curl.scanLimited ? (
        <p className="rr-banner" role="status">
          Part of this request was not fully scanned. Unstructured or truncated content can still hide a secret.
        </p>
      ) : null}

      <div className="rr-tabs" role="tablist" aria-label="Request sections">
        {(['overview', 'request', 'response', 'timing', 'curl', 'compare'] as DetailTab[]).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={tab === item}
            className={tab === item ? 'rr-tab rr-tab-active' : 'rr-tab'}
            onClick={() => setTab(item)}
          >
            {item}
          </button>
        ))}
      </div>

      <div className="rr-detail-body" role="tabpanel">
        {tab === 'overview' ? <Overview request={request} /> : null}
        {tab === 'request' ? <RequestPane request={request} reveal={revealSensitive} /> : null}
        {tab === 'response' ? <ResponsePane request={request} reveal={revealSensitive} /> : null}
        {tab === 'timing' ? <TimingPane timings={request.timings} /> : null}
        {tab === 'curl' ? <CurlPane command={curl.command} notes={curl.notes} copyState={copyState} onCopy={() => void copy()} /> : null}
        {tab === 'compare' ? <ComparePane requests={requests} selectedId={request.id} apiBase={apiBase} /> : null}
      </div>
    </section>
  );
}

function Overview({ request }: { request: CapturedRequest }) {
  const rows: Array<[string, string]> = [
    ['Status', request.status === null ? 'Unavailable' : `${request.status}${request.statusText ? ` ${request.statusText}` : ''}`],
    ['Network error', request.errorText ?? 'None reported'],
    ['Resource type', request.resourceType ?? 'Unavailable'],
    ['Started', formatTime(request.startedAt)],
    ['Duration', request.durationMs === null ? 'Unavailable' : formatDuration(request.durationMs)],
    ['HTTP version', request.httpVersion ?? 'Unavailable'],
    ['Server IP', request.serverIp ?? 'Unavailable'],
    ['From cache', request.fromCache ? 'Yes' : 'No'],
    ['Request type', request.requestMimeType ?? 'Unavailable'],
    ['Response type', request.responseMimeType ?? 'Unavailable'],
    ['Response size', formatBytes(request.responseBody.byteLength)],
  ];
  return (
    <div>
      <dl className="rr-kv">
        {rows.map(([label, value]) => (
          <div key={label}>
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {request.captureNotes.length > 0 ? (
        <ul className="rr-notes">
          {request.captureNotes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function RequestPane({ request, reveal }: { request: CapturedRequest; reveal: boolean }) {
  return (
    <div className="rr-stack">
      <HeaderTable title="Request headers" headers={request.requestHeaders} reveal={reveal} />
      <QueryTable request={request} reveal={reveal} />
      <BodyBlock title="Request payload" body={request.requestBody} reveal={reveal} />
    </div>
  );
}

function ResponsePane({ request, reveal }: { request: CapturedRequest; reveal: boolean }) {
  return (
    <div className="rr-stack">
      <HeaderTable title="Response headers" headers={request.responseHeaders} reveal={reveal} />
      <BodyBlock title="Response body" body={request.responseBody} reveal={reveal} />
    </div>
  );
}

function QueryTable({ request, reveal }: { request: CapturedRequest; reveal: boolean }) {
  return (
    <section>
      <h3>Query parameters</h3>
      {request.query.length === 0 ? (
        <p className="rr-muted">No query parameters were included.</p>
      ) : (
        <table className="rr-table">
          <tbody>
            {request.query.map((param, index) => (
              <tr key={`${param.name}-${index}`}>
                <th>{param.name}</th>
                <td className="rr-mono">{!reveal && isSensitiveName(param.name) ? '<redacted>' : param.value}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </section>
  );
}

function HeaderTable({ title, headers, reveal }: { title: string; headers: HeaderPair[]; reveal: boolean }) {
  return (
    <section>
      <h3>{title}</h3>
      {headers.length === 0 ? (
        <p className="rr-muted">No headers were included in the DevTools record.</p>
      ) : (
        <table className="rr-table">
          <tbody>
            {headers.map((header, index) => {
              const sensitive = isSensitiveName(header.name);
              return (
                <tr key={`${header.name}-${index}`}>
                  <th>
                    {header.name}
                    {sensitive ? <span className="rr-tag">sensitive</span> : null}
                  </th>
                  <td className="rr-mono">{sensitive && !reveal ? '<redacted>' : header.value}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </section>
  );
}

function BodyBlock({ title, body, reveal }: { title: string; body: BodySnapshot; reveal: boolean }) {
  const shown = body.text === null ? null : redactBody(body.text, body.mimeType, reveal).text;
  const pretty = shown ? prettyJson(shown) : null;
  return (
    <section>
      <h3>{title}</h3>
      {body.availability === 'pending' ? <p className="rr-muted">Loading response body…</p> : null}
      {body.availability !== 'available' && body.availability !== 'pending' ? (
        <p className="rr-muted">{body.message ?? 'Unavailable.'}</p>
      ) : null}
      {body.truncated ? <p className="rr-muted">{body.message}</p> : null}
      {shown ? (
        <>
          {pretty && pretty !== shown ? (
            <p className="rr-muted">Formatted for reading. The curl export uses the captured body, with redaction applied when it is on.</p>
          ) : null}
          {pretty ? <JsonView text={pretty} /> : <pre className="rr-pre">{shown}</pre>}
        </>
      ) : null}
    </section>
  );
}

function JsonView({ text }: { text: string }) {
  const tokens = tokenizeJson(text);
  return (
    <pre className="rr-pre">
      {tokens.map((token, index) => (
        <span key={`${token.type}-${index}`} className={`rr-token rr-token-${token.type}`}>
          {token.text}
        </span>
      ))}
    </pre>
  );
}

function TimingPane({ timings }: { timings: TimingInfo | null }) {
  if (!timings) return <p className="rr-muted">Timing information is unavailable for this request.</p>;
  const rows: Array<[string, number | null]> = [
    ['Blocked', timings.blockedMs],
    ['DNS', timings.dnsMs],
    ['Connect', timings.connectMs],
    ['SSL', timings.sslMs],
    ['Send', timings.sendMs],
    ['Wait', timings.waitMs],
    ['Receive', timings.receiveMs],
    ['Total', timings.totalMs],
  ];
  return (
    <table className="rr-table">
      <tbody>
        {rows.map(([label, value]) => (
          <tr key={label}>
            <th>{label}</th>
            <td>{value === null ? 'Unavailable' : formatDuration(value)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function CurlPane({
  command,
  notes,
  copyState,
  onCopy,
}: {
  command: string;
  notes: string[];
  copyState: 'idle' | 'copied' | 'failed';
  onCopy: () => void;
}) {
  return (
    <div className="rr-stack">
      <p className="rr-muted">
        This export is not sent automatically. It can differ from the browser request when DevTools omitted data, values
        were redacted, or the request depends on browser state such as a client certificate or service worker.
      </p>
      {command ? <pre className="rr-pre rr-curl">{command}</pre> : <p className="rr-muted">A curl command could not be built from the available URL.</p>}
      {notes.length > 0 ? (
        <ul className="rr-notes">
          {notes.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
      <button type="button" className="rr-button rr-button-primary" onClick={onCopy} disabled={!command}>
        {copyState === 'copied' ? 'Copied' : copyState === 'failed' ? 'Copy failed' : 'Copy curl'}
      </button>
      {copyState === 'failed' ? <p className="rr-muted">Copy failed. Select the command and copy it manually.</p> : null}
    </div>
  );
}
