import { useCallback, useEffect, useRef, useState } from 'react';
import type { Settings } from '../../shared/types';
import { DEFAULT_SETTINGS } from '../../shared/types';
import { createChromeStore } from '../../capture/chromeNetwork';
import { loadSettings, saveSettings, sanitizeSettings } from '../../storage/settings';

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [storageAvailable, setStorageAvailable] = useState(false);
  const storeRef = useRef(createChromeStore());
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  useEffect(() => {
    const store = createChromeStore();
    storeRef.current = store;
    setStorageAvailable(Boolean(store));
    void loadSettings(store).then((result) => {
      setSettings(result.settings);
      setError(result.error);
      setReady(true);
    });
  }, []);

  const update = useCallback(async (patch: Partial<Settings>) => {
    const next = sanitizeSettings({ ...settingsRef.current, ...patch });
    settingsRef.current = next;
    setSettings(next);
    const saved = await saveSettings(storeRef.current, next);
    setError(saved.ok ? null : saved.error);
    return saved;
  }, []);

  return { settings, ready, error, storageAvailable, update };
}
