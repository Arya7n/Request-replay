import { isSensitiveName, uniqueNames } from './names';

export type UrlRedaction = {
  url: string;
  redactedNames: string[];
  notes: string[];
  exportable: boolean;
};

export function redactUrl(
  rawUrl: string,
  options: { includeSensitive: boolean; stripFragment: boolean },
): UrlRedaction {
  const notes: string[] = [];
  if (/[\u0000\r\n]/.test(rawUrl)) {
    return {
      url: '',
      redactedNames: [],
      notes: ['The URL contains control characters and was not exported.'],
      exportable: false,
    };
  }

  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return {
      url: '',
      redactedNames: [],
      notes: ['The URL could not be parsed and was not exported.'],
      exportable: false,
    };
  }

  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    return {
      url: '',
      redactedNames: [],
      notes: ['Only http and https URLs can be exported as curl.'],
      exportable: false,
    };
  }

  const redactedNames: string[] = [];
  if (parsed.username || parsed.password) {
    redactedNames.push('url-userinfo');
    if (!options.includeSensitive) {
      parsed.username = '';
      parsed.password = '';
      notes.push('Credentials embedded in the URL were redacted.');
    }
  }

  const params = new URLSearchParams(parsed.search);
  let queryChanged = false;
  for (const [name, value] of [...params.entries()]) {
    if (!isSensitiveName(name)) continue;
    redactedNames.push(name);
    if (!options.includeSensitive && value !== '<redacted>') {
      params.set(name, '<redacted>');
      queryChanged = true;
    }
  }
  if (queryChanged) {
    const next = params.toString();
    parsed.search = next ? `?${next}` : '';
    notes.push('Sensitive query parameters were redacted in the URL.');
  }

  if (options.stripFragment && parsed.hash) {
    parsed.hash = '';
    notes.push('The URL fragment was omitted because HTTP clients do not send it to the server.');
  }

  return {
    url: parsed.toString(),
    redactedNames: uniqueNames(redactedNames),
    notes,
    exportable: true,
  };
}

export function displayUrl(rawUrl: string, includeSensitive: boolean): string {
  if (/[\u0000\r\n]/.test(rawUrl)) return '[url hidden]';
  try {
    const parsed = new URL(rawUrl);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return `${parsed.protocol} URL`;
  } catch {
    return includeSensitive ? rawUrl : '[url hidden]';
  }
  const redacted = redactUrl(rawUrl, { includeSensitive, stripFragment: false });
  return redacted.exportable ? redacted.url : '[url hidden]';
}
