import { LIMITS } from '../shared/types';
import { isTextualMime, looksLikeJson, mimeBase, stripNul } from '../shared/validation';
import { tryParseJson } from '../shared/json';
import { isSensitiveName, uniqueNames } from './names';

export type BodyRedaction = {
  text: string;
  redactedNames: string[];
  scanLimited: boolean;
  rewritten: boolean;
};

const REDACTED = '<redacted>';

export function redactBody(
  text: string,
  mime: string | null,
  includeSensitive: boolean,
): BodyRedaction {
  const cleaned = stripNul(text);
  const scan = redactBodyText(cleaned, mime);
  return {
    text: includeSensitive ? cleaned : scan.text,
    redactedNames: scan.redactedNames,
    scanLimited: scan.scanLimited || cleaned.length !== text.length,
    rewritten: !includeSensitive && scan.rewritten,
  };
}

function redactBodyText(text: string, mime: string | null): BodyRedaction {
  const base = mimeBase(mime);
  if (base.includes('json') || looksLikeJson(text)) {
    const parsed = tryParseJson(text);
    if (parsed !== null) {
      const names = new Set<string>();
      const redacted = redactJsonValue(parsed, names, 0);
      const redactedNames = uniqueNames(names);
      if (redactedNames.length === 0) {
        return { text, redactedNames, scanLimited: false, rewritten: false };
      }
      return {
        text: JSON.stringify(redacted),
        redactedNames,
        scanLimited: false,
        rewritten: true,
      };
    }
  }

  if (base === 'application/x-www-form-urlencoded' || looksLikeForm(text)) {
    const form = redactForm(text);
    if (form) return form;
  }

  if (base.startsWith('multipart/form-data')) {
    const multipart = redactMultipart(text);
    if (multipart.rewritten || multipart.redactedNames.length > 0) return multipart;
    return { ...multipart, scanLimited: true };
  }

  const loose = redactLoose(text);
  return {
    text: loose.text,
    redactedNames: loose.redactedNames,
    scanLimited: true,
    rewritten: loose.rewritten,
  };
}

function redactJsonValue(value: unknown, names: Set<string>, depth: number): unknown {
  if (depth > 40) return value;
  if (Array.isArray(value)) return value.map((item) => redactJsonValue(item, names, depth + 1));
  if (!value || typeof value !== 'object') return value;
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveName(key)) {
      names.add(key);
      output[key] = REDACTED;
    } else {
      output[key] = redactJsonValue(child, names, depth + 1);
    }
  }
  return output;
}

function looksLikeForm(text: string): boolean {
  if (!text || text.length > LIMITS.maxBodyChars || /[\r\n]/.test(text)) return false;
  return /^[^=&]+=[^&]*(&[^=&]+=[^&]*)*$/.test(text);
}

function redactForm(text: string): BodyRedaction | null {
  try {
    const params = [...new URLSearchParams(text).entries()];
    const names: string[] = [];
    let changed = false;
    const next = new URLSearchParams();
    for (const [key, value] of params) {
      if (isSensitiveName(key)) {
        names.push(key);
        next.append(key, REDACTED);
        if (value !== REDACTED) changed = true;
      } else {
        next.append(key, value);
      }
    }
    return {
      text: changed ? next.toString() : text,
      redactedNames: uniqueNames(names),
      scanLimited: false,
      rewritten: changed,
    };
  } catch {
    return null;
  }
}

function redactMultipart(text: string): BodyRedaction {
  const names: string[] = [];
  let rewritten = false;
  const next = text.replace(
    /(name="([^"]+)"[\s\S]*?\r?\n\r?\n)([\s\S]*?)(?=\r?\n--)/g,
    (full, prefix: string, name: string) => {
      if (!isSensitiveName(name)) return full;
      names.push(name);
      rewritten = true;
      return `${prefix}${REDACTED}`;
    },
  );
  return {
    text: rewritten ? next : text,
    redactedNames: uniqueNames(names),
    scanLimited: false,
    rewritten,
  };
}

function redactLoose(text: string): { text: string; redactedNames: string[]; rewritten: boolean } {
  const names: string[] = [];
  let rewritten = false;
  const replaced = text.replace(
    /(["']?)([A-Za-z0-9_.-]{1,80})\1(\s*[:=]\s*)(["'])[\s\S]*?\4/g,
    (full, _quote: string, key: string, separator: string, valueQuote: string) => {
      if (!isSensitiveName(key)) return full;
      names.push(key);
      rewritten = true;
      return `${valueQuote === '"' ? `"${key}"` : key}${separator}${valueQuote}${REDACTED}${valueQuote}`;
    },
  );
  const bearer = replaced.replace(/Bearer\s+[A-Za-z0-9._~+/-]+=*/gi, () => {
    names.push('bearer');
    rewritten = true;
    return 'Bearer <redacted>';
  });
  return { text: bearer, redactedNames: uniqueNames(names), rewritten };
}

export function bodyScanIsLimited(mime: string | null, availability: string): boolean {
  if (availability !== 'available') return false;
  return !isTextualMime(mime);
}
