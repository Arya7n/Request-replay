import { useEffect, useState } from 'react';
import type { Settings } from '../../shared/types';
import { LIMITS } from '../../shared/types';

export function SettingsDialog({
  settings,
  storageAvailable,
  storageError,
  onClose,
  onChange,
  onDeleteHistory,
}: {
  settings: Settings;
  storageAvailable: boolean;
  storageError: string | null;
  onClose: () => void;
  onChange: (patch: Partial<Settings>) => void;
  onDeleteHistory: () => void;
}) {
  const [apiBase, setApiBase] = useState(settings.apiBase);
  useEffect(() => setApiBase(settings.apiBase), [settings.apiBase]);
  return (
    <div className="rr-dialog-backdrop" onMouseDown={onClose}>
      <div
        className="rr-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="rr-dialog-head">
          <h2 id="settings-title">Settings</h2>
          <button type="button" className="rr-button" onClick={onClose}>
            Close
          </button>
        </header>
        <label className="rr-field">
          Theme
          <select
            value={settings.theme}
            onChange={(event) => onChange({ theme: event.target.value as Settings['theme'] })}
          >
            <option value="match-devtools">Match DevTools</option>
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </select>
        </label>
        <label className="rr-field">
          <span>
            <input
              type="checkbox"
              checked={settings.historyEnabled}
              onChange={(event) => onChange({ historyEnabled: event.target.checked })}
            />{' '}
            Store request history locally
          </span>
        </label>
        <p className="rr-muted">
          History is off by default. When it is on, passwords, tokens, and cookies are redacted before the request is
          written to chrome.storage.local. That detection is heuristic and can miss a secret. Showing sensitive values
          in this panel does not write them to storage.
        </p>
        <label className="rr-field">
          History limit
          <select
            value={settings.historyLimit}
            onChange={(event) => onChange({ historyLimit: Number(event.target.value) })}
          >
            {[25, 50, 100, LIMITS.maxHistoryEntries].map((limit) => (
              <option key={limit} value={limit}>
                {limit} requests
              </option>
            ))}
          </select>
        </label>
        <label className="rr-field">
          Comparison API
          <input
            className="rounded border border-[var(--line)] bg-[var(--bg)] px-1.5 py-1"
            type="url"
            value={apiBase}
            onChange={(event) => setApiBase(event.target.value)}
            onBlur={() => onChange({ apiBase })}
          />
        </label>
        <p className="rr-muted">
          Used only for response comparison. Inspection and curl keep working when this address is down.
        </p>
        <p className="rr-muted">
          {storageAvailable
            ? 'Storage is available in this extension panel.'
            : 'Storage is unavailable here, so this setting will not be kept after you close the panel.'}
        </p>
        {storageError ? <p className="rr-banner rr-banner-warn">{storageError}</p> : null}
        <div className="rr-dialog-actions">
          <button type="button" className="rr-button rr-button-danger" onClick={onDeleteHistory}>
            Delete stored history
          </button>
        </div>
      </div>
    </div>
  );
}
