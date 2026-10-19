import { useCallback, useEffect, useRef, useState } from 'react';
import type { CapturedRequest, Settings } from '../../shared/types';
import { LIMITS } from '../../shared/types';
import { createChromeStore, createNetworkSubscription } from '../../capture/chromeNetwork';
import { readResponseBody } from '../../capture/content';
import { normalizeHarEntry } from '../../capture/normalize';
import { mergeInitialEntries, prependLive, sortNewestFirst } from '../../capture/session';
import { deleteHistory, readHistory, upsertStoredRequest } from '../../storage/history';
import { createDemoRequests } from '../demoData';

export function useCapture(ready: boolean, settings: Settings) {
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const demoRef = useRef(false);
  const epochRef = useRef(0);
  const saveQueue = useRef(Promise.resolve());
  const reloadRef = useRef<() => Promise<void>>(async () => {});

  const [requests, setRequests] = useState<CapturedRequest[]>([]);
  const [history, setHistory] = useState<CapturedRequest[]>([]);
  const [devtoolsAvailable, setDevtoolsAvailable] = useState(true);
  const [loading, setLoading] = useState(true);
  const [demoMode, setDemoMode] = useState(false);
  const [skipped, setSkipped] = useState(0);
  const [captureWarning, setCaptureWarning] = useState<string | null>(null);
  const [storageWarning, setStorageWarning] = useState<string | null>(null);
  const [droppedLive, setDroppedLive] = useState(false);
  const [inspectedUrl, setInspectedUrl] = useState<string | null>(null);

  const persist = useCallback((request: CapturedRequest) => {
    if (demoRef.current || request.source === 'demo') return;
    if (request.responseBody.availability === 'pending') return;
    if (!settingsRef.current.historyEnabled) return;
    const store = createChromeStore();
    if (!store) {
      setStorageWarning('Local storage is unavailable. History was not saved.');
      return;
    }
    const limit = settingsRef.current.historyLimit;
    saveQueue.current = saveQueue.current.then(async () => {
      const result = await upsertStoredRequest(store, request, limit);
      if (!result.ok) setStorageWarning(result.error);
      else {
        setStorageWarning(null);
        setHistory(result.requests);
      }
    });
  }, []);

  const refreshHistory = useCallback(async () => {
    const store = createChromeStore();
    if (!store) {
      setStorageWarning('Local storage is unavailable.');
      return;
    }
    const result = await readHistory(store);
    if (!result.ok) {
      setStorageWarning(result.error);
      return;
    }
    setHistory(result.requests);
    setStorageWarning(
      result.discarded > 0 ? 'Some stored history entries were discarded because they were invalid.' : null,
    );
  }, []);

  const removeHistory = useCallback(async () => {
    const store = createChromeStore();
    if (!store) {
      setHistory([]);
      setStorageWarning('Local storage is unavailable.');
      return;
    }
    const result = await deleteHistory(store);
    if (!result.ok) setStorageWarning(result.error);
    else {
      setHistory([]);
      setStorageWarning(null);
    }
  }, []);

  useEffect(() => {
    if (!ready || !settings.historyEnabled) return;
    void refreshHistory();
  }, [ready, settings.historyEnabled, refreshHistory]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;
    let listening = false;
    const buffer: unknown[] = [];
    const isCancelled = () => cancelled;

    const hydrate = async (request: CapturedRequest, entry: unknown) => {
      if (request.responseBody.availability !== 'pending') {
        persist(request);
        return;
      }
      const epoch = epochRef.current;
      const body = await readResponseBody(entry, request.responseMimeType);
      if (isCancelled() || demoRef.current || epochRef.current !== epoch) return;
      const updated: CapturedRequest = {
        ...request,
        responseBody: body,
        sensitiveScanLimited: request.sensitiveScanLimited || body.truncated,
      };
      setRequests((current) => current.map((item) => (item.id === request.id ? updated : item)));
      persist(updated);
    };

    const pump = async (pairs: Array<{ request: CapturedRequest; entry: unknown }>) => {
      let index = 0;
      const workers = Array.from({ length: Math.min(LIMITS.bodyFetchConcurrency, pairs.length) }, async () => {
        while (!isCancelled() && index < pairs.length) {
          const current = index;
          index += 1;
          const pair = pairs[current];
          if (pair) await hydrate(pair.request, pair.entry);
        }
      });
      await Promise.all(workers);
    };

    const acceptLive = (entry: unknown) => {
      if (demoRef.current || isCancelled()) return;
      const normalized = normalizeHarEntry(entry);
      if (!normalized.ok) {
        setSkipped((count) => count + 1);
        return;
      }
      setRequests((current) => {
        const next = prependLive(current, normalized.request);
        if (next.dropped) setDroppedLive(true);
        return next.requests;
      });
      void hydrate(normalized.request, entry);
    };

    const applySnapshot = async (entries: unknown[], bufferedEntries: unknown[]) => {
      const merged = mergeInitialEntries(entries, bufferedEntries);
      const sorted = sortNewestFirst(merged.items.map((item) => item.request));
      const capped = sorted.slice(0, LIMITS.maxLiveRequests);
      const kept = new Set(capped.map((request) => request.id));
      setRequests(capped);
      setSkipped(merged.skipped);
      setDroppedLive(sorted.length > capped.length);
      setLoading(false);
      await pump(merged.items.filter((item) => kept.has(item.request.id)));
    };

    const network = createNetworkSubscription();
    if (!network) {
      setDevtoolsAvailable(false);
      setLoading(false);
      return;
    }
    setDevtoolsAvailable(true);

    const stopFinished = network.listenFinished((entry) => {
      if (!listening) buffer.push(entry);
      else acceptLive(entry);
    });
    const stopNavigated = network.listenNavigated((url) => {
      setInspectedUrl(url);
      if (!settingsRef.current.preserveLog && !demoRef.current) {
        epochRef.current += 1;
        setRequests([]);
        setSkipped(0);
        setDroppedLive(false);
      }
    });

    const load = async () => {
      listening = false;
      try {
        const entries = await network.getEntries();
        if (isCancelled()) return;
        listening = true;
        const bufferedEntries = buffer.splice(0, buffer.length);
        await applySnapshot(entries, bufferedEntries);
      } catch (error) {
        listening = true;
        if (isCancelled()) return;
        setLoading(false);
        setCaptureWarning(
          error instanceof Error
            ? error.message
            : 'Could not read the existing DevTools network log. Later requests can still appear.',
        );
      }
    };

    reloadRef.current = load;
    void load();

    return () => {
      cancelled = true;
      stopFinished();
      stopNavigated();
    };
  }, [ready, persist]);

  const loadDemo = useCallback(() => {
    epochRef.current += 1;
    demoRef.current = true;
    setDemoMode(true);
    setLoading(false);
    setCaptureWarning(null);
    setRequests(createDemoRequests());
  }, []);

  const returnToLive = useCallback(() => {
    epochRef.current += 1;
    demoRef.current = false;
    setDemoMode(false);
    setRequests([]);
    setSkipped(0);
    setDroppedLive(false);
    setLoading(devtoolsAvailable);
    void reloadRef.current();
  }, [devtoolsAvailable]);

  const clearLive = useCallback(() => {
    epochRef.current += 1;
    demoRef.current = false;
    setDemoMode(false);
    setRequests([]);
    setSkipped(0);
    setDroppedLive(false);
    setCaptureWarning(null);
  }, []);

  return {
    requests,
    history,
    devtoolsAvailable,
    loading,
    demoMode,
    skipped,
    captureWarning,
    storageWarning,
    droppedLive,
    inspectedUrl,
    loadDemo,
    returnToLive,
    clearLive,
    refreshHistory,
    removeHistory,
  };
}
