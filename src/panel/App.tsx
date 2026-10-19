import { useEffect, useMemo, useState } from 'react';
import type { MethodFilter, StatusFilter } from '../shared/types';
import { LIMITS } from '../shared/types';
import { createThemeAdapter } from '../capture/chromeNetwork';
import { filterRequests, visibleSlice } from '../filter/filterRequests';
import { displayUrl } from '../redact/url';
import { Detail } from './components/Detail';
import { RequestList } from './components/RequestList';
import { SettingsDialog } from './components/SettingsDialog';
import { useCapture } from './hooks/useCapture';
import { useSettings } from './hooks/useSettings';

export function App() {
  const { settings, ready, error: settingsError, storageAvailable, update } = useSettings();
  const capture = useCapture(ready, settings);
  const [search, setSearch] = useState('');
  const [method, setMethod] = useState<MethodFilter>(settings.methodFilter);
  const [status, setStatus] = useState<StatusFilter>(settings.statusFilter);
  const [filtersReady, setFiltersReady] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [revealSensitive, setRevealSensitive] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [view, setView] = useState<'live' | 'history'>('live');
  const [visibleLimit, setVisibleLimit] = useState<number>(LIMITS.visiblePageSize);

  useEffect(() => {
    if (!ready || filtersReady) return;
    setMethod(settings.methodFilter);
    setStatus(settings.statusFilter);
    setFiltersReady(true);
  }, [filtersReady, ready, settings.methodFilter, settings.statusFilter]);

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const themeApi = createThemeAdapter();
    const apply = () => {
      const fallback = media.matches ? 'dark' : 'light';
      const devtoolsTheme = themeApi?.current();
      const resolved = settings.theme === 'match-devtools' ? (devtoolsTheme ?? fallback) : settings.theme;
      document.documentElement.dataset.theme = resolved;
    };
    apply();
    const stop = themeApi?.listen(apply);
    media.addEventListener('change', apply);
    return () => {
      stop?.();
      media.removeEventListener('change', apply);
    };
  }, [settings.theme]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target instanceof HTMLElement ? event.target : null;
      const typing = target?.closest('input, textarea, select, [contenteditable="true"]');
      if (event.key === '/' && !typing) {
        event.preventDefault();
        document.getElementById('request-search')?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const source = view === 'history' ? capture.history : capture.requests;
  const filtered = useMemo(
    () => filterRequests(source, { search, method, status }),
    [method, search, source, status],
  );
  const windowed = visibleSlice(filtered, visibleLimit);
  const selected = source.find((request) => request.id === selectedId) ?? null;

  useEffect(() => {
    if (selectedId && source.some((request) => request.id === selectedId)) return;
    setSelectedId(source[0]?.id ?? null);
  }, [selectedId, source]);

  const inspected = capture.inspectedUrl ? displayUrl(capture.inspectedUrl, revealSensitive) : null;

  const changeMethod = (value: MethodFilter) => {
    setMethod(value);
    setVisibleLimit(LIMITS.visiblePageSize);
    void update({ methodFilter: value });
  };
  const changeStatus = (value: StatusFilter) => {
    setStatus(value);
    setVisibleLimit(LIMITS.visiblePageSize);
    void update({ statusFilter: value });
  };

  const requestClear = () => {
    if (view === 'history') {
      if (capture.history.length === 0) return;
      setConfirmClear(true);
      return;
    }
    if (capture.requests.length === 0) return;
    setConfirmClear(true);
  };

  const confirmClearAction = () => {
    setConfirmClear(false);
    if (view === 'history') void capture.removeHistory();
    else capture.clearLive();
  };

  return (
    <div className="rr-app">
      <header className="rr-toolbar">
        <div className="rr-brand">
          <span className="rr-mark" aria-hidden="true" />
          <div>
            <strong>RequestReplay</strong>
            <span>{capture.demoMode ? 'Demo data' : inspected ?? 'Inspected page'}</span>
          </div>
        </div>
        <input
          id="request-search"
          className="rr-search"
          type="search"
          placeholder="Search URL or host"
          aria-label="Search by URL or hostname"
          value={search}
          onChange={(event) => {
            setSearch(event.target.value);
            setVisibleLimit(LIMITS.visiblePageSize);
          }}
        />
        <select
          className="rr-select"
          aria-label="Filter by HTTP method"
          value={method}
          onChange={(event) => changeMethod(event.target.value as MethodFilter)}
        >
          {['ALL', 'GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS', 'OTHER'].map((item) => (
            <option key={item} value={item}>
              {item === 'ALL' ? 'All methods' : item}
            </option>
          ))}
        </select>
        <select
          className="rr-select"
          aria-label="Filter by status"
          value={status}
          onChange={(event) => changeStatus(event.target.value as StatusFilter)}
        >
          <option value="all">All statuses</option>
          <option value="2xx">2xx success</option>
          <option value="3xx">3xx redirect</option>
          <option value="4xx">4xx client</option>
          <option value="5xx">5xx server</option>
          <option value="network">Network error</option>
          <option value="failed">Failed</option>
        </select>
        <label className="rr-check">
          <input
            type="checkbox"
            checked={settings.preserveLog}
            onChange={(event) => void update({ preserveLog: event.target.checked })}
          />
          Preserve log
        </label>
        <div className="rr-toolbar-actions">
          <button type="button" className="rr-button" aria-pressed={view === 'history'} onClick={() => setView(view === 'live' ? 'history' : 'live')}>
            {view === 'live' ? 'Stored history' : 'Live capture'}
          </button>
          <button type="button" className="rr-button" onClick={() => setSettingsOpen(true)}>
            Settings
          </button>
          {confirmClear ? (
            <span className="rr-confirm">
              {view === 'history' ? 'Delete stored history?' : 'Clear captured requests?'}
              <button type="button" className="rr-button rr-button-danger" onClick={confirmClearAction}>
                Confirm
              </button>
              <button type="button" className="rr-button" onClick={() => setConfirmClear(false)}>
                Cancel
              </button>
            </span>
          ) : (
            <button type="button" className="rr-button rr-button-danger" onClick={requestClear}>
              Clear
            </button>
          )}
        </div>
      </header>

      <MessageStack
        capture={capture}
        settingsError={settingsError}
        storageAvailable={storageAvailable}
        view={view}
        onDemo={capture.loadDemo}
        onLive={capture.returnToLive}
        onRefreshHistory={() => void capture.refreshHistory()}
      />

      <div className="rr-main">
        <RequestList
          requests={windowed.visible}
          total={filtered.length}
          hiddenCount={windowed.hiddenCount}
          selectedId={selected?.id ?? null}
          revealSensitive={revealSensitive}
          loading={capture.loading && view === 'live' && !capture.demoMode}
          filteredOut={source.length > 0 && filtered.length === 0}
          onSelect={setSelectedId}
          onShowMore={() => setVisibleLimit((current) => current + LIMITS.visiblePageSize)}
        />
        <Detail
          request={selected}
          requests={source}
          apiBase={settings.apiBase}
          revealSensitive={revealSensitive}
          onToggleReveal={() => setRevealSensitive((current) => !current)}
        />
      </div>

      {settingsOpen ? (
        <SettingsDialog
          settings={settings}
          storageAvailable={storageAvailable}
          storageError={settingsError ?? capture.storageWarning}
          onClose={() => setSettingsOpen(false)}
          onChange={(patch) => void update(patch)}
          onDeleteHistory={() => void capture.removeHistory()}
        />
      ) : null}
    </div>
  );
}

function MessageStack({
  capture,
  settingsError,
  storageAvailable,
  view,
  onDemo,
  onLive,
  onRefreshHistory,
}: {
  capture: ReturnType<typeof useCapture>;
  settingsError: string | null;
  storageAvailable: boolean;
  view: 'live' | 'history';
  onDemo: () => void;
  onLive: () => void;
  onRefreshHistory: () => void;
}) {
  const messages: Array<{ tone: 'info' | 'warn'; text: string }> = [];
  if (!storageAvailable) {
    messages.push({
      tone: 'info',
      text: 'Settings and history stay in this panel session. chrome.storage is unavailable outside the extension.',
    });
  }
  if (settingsError) messages.push({ tone: 'warn', text: settingsError });
  if (capture.storageWarning) messages.push({ tone: 'warn', text: capture.storageWarning });
  if (capture.captureWarning) messages.push({ tone: 'warn', text: capture.captureWarning });
  if (capture.demoMode) {
    messages.push({
      tone: 'warn',
      text: 'Demo data is showing. These requests were not captured from the inspected page.',
    });
  }
  if (capture.droppedLive && view === 'live' && !capture.demoMode) {
    messages.push({
      tone: 'info',
      text: `Only the newest ${LIMITS.maxLiveRequests} requests are kept in this panel.`,
    });
  }
  if (capture.skipped > 0) {
    messages.push({
      tone: 'info',
      text: `${capture.skipped} DevTools entr${capture.skipped === 1 ? 'y was' : 'ies were'} skipped because the record shape was incomplete.`,
    });
  }
  if (view === 'history') {
    messages.push({
      tone: 'info',
      text: 'Stored history is local and opt-in. Secrets are redacted before they are written, but that detection is not a guarantee. It is not the live DevTools log.',
    });
  }

  return (
    <div className="rr-messages">
      {messages.map((message) => (
        <p key={message.text} className={message.tone === 'warn' ? 'rr-banner rr-banner-warn' : 'rr-banner'} role="status">
          {message.text}
        </p>
      ))}
      <div className="rr-message-actions">
        {capture.demoMode ? (
          <button type="button" className="rr-button" onClick={onLive}>
            Back to live capture
          </button>
        ) : null}
        {!capture.demoMode && view === 'live' && !capture.loading && capture.requests.length === 0 ? (
          <button type="button" className="rr-button" onClick={onDemo}>
            Load demo data
          </button>
        ) : null}
        {view === 'history' ? (
          <button type="button" className="rr-button" onClick={onRefreshHistory}>
            Reload stored history
          </button>
        ) : null}
      </div>
    </div>
  );
}
