import { callWithCallbackOrPromise } from './callback';
import { extractHarEntries } from './har';
import type { KeyValueStore } from '../storage/store';

export type NetworkSubscription = {
  getEntries(): Promise<unknown[]>;
  listenFinished(listener: (entry: unknown) => void): () => void;
  listenNavigated(listener: (url: string) => void): () => void;
};

export type ThemeAdapter = {
  current(): 'dark' | 'light';
  listen(listener: (theme: 'dark' | 'light') => void): () => void;
};

export function mapThemeName(themeName: string | undefined): 'dark' | 'light' {
  return themeName === 'dark' ? 'dark' : 'light';
}

type ChromeNetwork = typeof chrome.devtools.network;
type ChromePanels = typeof chrome.devtools.panels;

export function createNetworkSubscription(
  network: ChromeNetwork | undefined = globalThis.chrome?.devtools?.network,
): NetworkSubscription | null {
  if (!network?.getHAR || !network.onRequestFinished || !network.onNavigated) return null;
  return {
    async getEntries() {
      const payload = await callWithCallbackOrPromise((callback) => {
        const getHar = network.getHAR.bind(network) as (done: (value: unknown) => void) => unknown;
        return getHar(callback);
      });
      const extracted = extractHarEntries(payload);
      if (!extracted.ok) throw new Error('DevTools returned a network log in an unrecognized shape.');
      return extracted.entries;
    },
    listenFinished(listener) {
      const wrapped = (request: chrome.devtools.network.Request) => listener(request);
      network.onRequestFinished.addListener(wrapped);
      return () => network.onRequestFinished.removeListener(wrapped);
    },
    listenNavigated(listener) {
      const wrapped = (url: string) => listener(url);
      network.onNavigated.addListener(wrapped);
      return () => network.onNavigated.removeListener(wrapped);
    },
  };
}

export function createThemeAdapter(
  panels: ChromePanels | undefined = globalThis.chrome?.devtools?.panels,
): ThemeAdapter | null {
  if (!panels || typeof panels.setThemeChangeHandler !== 'function') return null;
  return {
    current: () => mapThemeName(panels.themeName),
    listen(listener) {
      panels.setThemeChangeHandler((themeName) => listener(mapThemeName(themeName)));
      return () => {
        panels.setThemeChangeHandler();
      };
    },
  };
}

export function createChromeStore(): KeyValueStore | null {
  const storage = globalThis.chrome?.storage?.local;
  if (!storage) return null;
  return {
    get(key) {
      return new Promise((resolve, reject) => {
        storage.get(key, (items) => {
          const message = chrome.runtime.lastError?.message;
          if (message) reject(new Error(message));
          else resolve(items[key]);
        });
      });
    },
    set(key, value) {
      return new Promise((resolve, reject) => {
        storage.set({ [key]: value }, () => {
          const message = chrome.runtime.lastError?.message;
          if (message) reject(new Error(message));
          else resolve();
        });
      });
    },
    remove(key) {
      return new Promise((resolve, reject) => {
        storage.remove(key, () => {
          const message = chrome.runtime.lastError?.message;
          if (message) reject(new Error(message));
          else resolve();
        });
      });
    },
  };
}
