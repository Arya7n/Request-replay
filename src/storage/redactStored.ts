import type { BodySnapshot, CapturedRequest, HeaderPair, QueryParam } from '../shared/types';
import { redactBody } from '../redact/body';
import { isSensitiveName } from '../redact/names';
import { redactUrl } from '../redact/url';

export function redactForStorage(request: CapturedRequest): CapturedRequest {
  const url = redactUrl(request.url, { includeSensitive: false, stripFragment: false });
  return {
    ...request,
    url: url.exportable ? url.url : '[url hidden]',
    query: request.query.map(redactQuery),
    requestHeaders: request.requestHeaders.map(redactHeader),
    responseHeaders: request.responseHeaders.map(redactHeader),
    requestBody: redactBodySnapshot(request.requestBody),
    responseBody: redactBodySnapshot(request.responseBody),
  };
}

function redactHeader(header: HeaderPair): HeaderPair {
  if (!isSensitiveName(header.name)) return header;
  return { name: header.name, value: '<redacted>' };
}

function redactQuery(param: QueryParam): QueryParam {
  if (!isSensitiveName(param.name)) return param;
  return { name: param.name, value: '<redacted>' };
}

function redactBodySnapshot(body: BodySnapshot): BodySnapshot {
  if (body.availability !== 'available' || body.text === null) return body;
  const redacted = redactBody(body.text, body.mimeType, false);
  return { ...body, text: redacted.text, message: redacted.rewritten ? 'Sensitive fields were redacted before this body was stored.' : body.message };
}
