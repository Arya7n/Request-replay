import type { CapturedRequest } from '../shared/types';
import { isSensitiveName } from '../redact/names';
import { redactBody } from '../redact/body';
import type { CompareSnapshot } from './compareSnapshots';

const MAX_BODY = 100_000;
const MAX_HEADERS = 80;

export function snapshotFromRequest(request: CapturedRequest): CompareSnapshot {
  const headers = request.responseHeaders.slice(0, MAX_HEADERS).map((header) => ({
    name: header.name.slice(0, 200),
    value: isSensitiveName(header.name) ? '<redacted>' : header.value.slice(0, 4_000),
  }));
  let body: string | null = null;
  if (request.responseBody.availability === 'available' && request.responseBody.text !== null) {
    const redacted = redactBody(request.responseBody.text, request.responseBody.mimeType, false);
    body = redacted.text.slice(0, MAX_BODY);
  }
  return {
    label: `${request.method} ${request.status ?? 'no-status'}`.slice(0, 300),
    status: request.status,
    headers,
    body,
  };
}
