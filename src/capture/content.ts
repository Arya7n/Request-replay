import type { BodySnapshot } from '../shared/types';
import { LIMITS } from '../shared/types';
import { isPromise, isRecord, isTextualMime, mimeBase } from '../shared/validation';

export function emptyBody(message = 'No request body.'): BodySnapshot {
  return {
    availability: 'empty',
    text: null,
    mimeType: null,
    byteLength: 0,
    truncated: false,
    message,
  };
}

export function unavailableBody(message: string, mimeType: string | null = null, byteLength: number | null = null): BodySnapshot {
  return {
    availability: 'unavailable',
    text: null,
    mimeType,
    byteLength,
    truncated: false,
    message,
  };
}

export function pendingBody(mimeType: string | null = null): BodySnapshot {
  return {
    availability: 'pending',
    text: null,
    mimeType,
    byteLength: null,
    truncated: false,
    message: 'Loading response body…',
  };
}

export function errorBody(message: string, mimeType: string | null = null): BodySnapshot {
  return {
    availability: 'error',
    text: null,
    mimeType,
    byteLength: null,
    truncated: false,
    message,
  };
}

export function binaryBody(mimeType: string | null, byteLength: number | null): BodySnapshot {
  return {
    availability: 'binary',
    text: null,
    mimeType,
    byteLength,
    truncated: false,
    message: mimeType
      ? `Response body is binary (${mimeType}). It is not shown as text.`
      : 'Response body is binary. It is not shown as text.',
  };
}

export function textBody(text: string, mimeType: string | null, byteLength: number | null): BodySnapshot {
  const limited = limitText(text);
  return {
    availability: limited.text.length === 0 ? 'empty' : 'available',
    text: limited.text.length === 0 ? null : limited.text,
    mimeType,
    byteLength,
    truncated: limited.truncated,
    message: limited.truncated
      ? `Truncated to ${LIMITS.maxBodyChars} characters. The remainder was not kept.`
      : limited.text.length === 0
        ? 'The body was empty.'
        : null,
  };
}

export function limitText(text: string): { text: string; truncated: boolean } {
  if (text.length <= LIMITS.maxBodyChars) return { text, truncated: false };
  return { text: text.slice(0, LIMITS.maxBodyChars), truncated: true };
}

export function interpretContent(first: unknown, second: unknown, mimeType: string | null): BodySnapshot {
  const payload = normalizeContentPayload(first, second);
  if (!payload) return errorBody('Response body retrieval returned an unexpected result.', mimeType);
  const encoding = payload.encoding.toLowerCase();
  if (!payload.content) return emptyBody('The response body was empty.');

  if (encoding === 'base64') {
    if (isTextualMime(mimeType) || mimeBase(mimeType) === '') {
      const decoded = decodeBase64(payload.content);
      if (decoded !== null && !decoded.includes('\u0000')) {
        const body = textBody(decoded, mimeType, decoded.length);
        if (!mimeType && body.message === null) {
          body.message = 'Decoded from base64. Chrome did not provide a content type.';
        }
        return body;
      }
    }
    return binaryBody(mimeType, Math.floor((payload.content.length * 3) / 4));
  }

  if (encoding && encoding !== 'base64') {
    return unavailableBody(
      `Response body uses the encoding "${encoding}", which RequestReplay does not decode.`,
      mimeType,
    );
  }

  return textBody(payload.content, mimeType, payload.content.length);
}

export function normalizeContentPayload(
  first: unknown,
  second?: unknown,
): { content: string; encoding: string } | null {
  if (typeof first === 'string') {
    return { content: first, encoding: typeof second === 'string' ? second : '' };
  }
  if (isRecord(first) && typeof first.content === 'string') {
    return { content: first.content, encoding: typeof first.encoding === 'string' ? first.encoding : '' };
  }
  if (first === undefined || first === null) return { content: '', encoding: '' };
  return null;
}

export function decodeBase64(value: string): string | null {
  try {
    const binary = atob(value);
    const bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  } catch {
    return null;
  }
}

export async function readResponseBody(entry: unknown, mimeType: string | null): Promise<BodySnapshot> {
  if (!isRecord(entry) || typeof entry.getContent !== 'function') {
    return unavailableBody('Chrome did not provide a way to read this response body.', mimeType);
  }

  const getContent = entry.getContent as (this: unknown, callback?: (a: unknown, b: unknown) => void) => unknown;

  return new Promise((resolve) => {
    let settled = false;
    const finish = (snapshot: BodySnapshot) => {
      if (settled) return;
      settled = true;
      resolve(snapshot);
    };

    const timeout = setTimeout(() => {
      finish(errorBody('Timed out waiting for the response body.', mimeType));
    }, LIMITS.contentTimeoutMs);

    const succeed = (first: unknown, second?: unknown) => {
      clearTimeout(timeout);
      finish(interpretContent(first, second, mimeType));
    };

    const fail = () => {
      clearTimeout(timeout);
      finish(errorBody('Response body retrieval failed.', mimeType));
    };

    try {
      const returned = getContent.call(entry);
      if (isPromise(returned)) {
        void returned.then((value) => succeed(value), fail);
        return;
      }
    } catch {
      // Some Chrome versions require the callback form.
    }

    try {
      getContent.call(entry, (first: unknown, second: unknown) => succeed(first, second));
    } catch {
      fail();
    }
  });
}
