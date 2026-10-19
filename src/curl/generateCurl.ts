import type { CapturedRequest, HeaderPair } from '../shared/types';
import { commentSafe, isHttpToken, isSafeHttpMethod, stripNul } from '../shared/validation';
import { redactBody } from '../redact/body';
import { isSensitiveName, uniqueNames } from '../redact/names';
import { redactUrl } from '../redact/url';

export type CurlOptions = {
  includeSensitive: boolean;
};

export type CurlBuild = {
  command: string;
  redactedNames: string[];
  notes: string[];
  sensitiveDetected: boolean;
  scanLimited: boolean;
};

const HOP_BY_HOP = new Set([
  'host',
  'content-length',
  'connection',
  'keep-alive',
  'transfer-encoding',
  'upgrade',
  'proxy-connection',
  'te',
  'trailer',
]);

export function generateCurl(request: CapturedRequest, options: CurlOptions): CurlBuild {
  const notes: string[] = [];
  const redactedNames: string[] = [];
  const url = redactUrl(request.url, { includeSensitive: options.includeSensitive, stripFragment: true });
  notes.push(...url.notes);
  redactedNames.push(...url.redactedNames);

  if (!url.exportable || !url.url) {
    return {
      command: '',
      redactedNames: uniqueNames(redactedNames),
      notes,
      sensitiveDetected: redactedNames.length > 0,
      scanLimited: request.sensitiveScanLimited,
    };
  }

  const lines: string[] = [
    '# RequestReplay export. This command was not sent automatically.',
    `# Captured status: ${commentSafe(statusComment(request))}`,
  ];

  if (request.resourceType) lines.push(`# Resource type: ${commentSafe(request.resourceType)}`);
  for (const note of request.captureNotes) lines.push(`# ${commentSafe(note)}`);

  const omittedHeaders: string[] = [];
  const headerArgs: string[] = [];
  let sawEncoding = false;

  for (const header of request.requestHeaders) {
    const decision = headerArgument(header, options.includeSensitive);
    if (decision.kind === 'omit') {
      omittedHeaders.push(decision.label);
      continue;
    }
    if (decision.redactedName) redactedNames.push(decision.redactedName);
    if (decision.encoding) sawEncoding = true;
    headerArgs.push(decision.argument);
  }

  if (omittedHeaders.length > 0) {
    notes.push(`Omitted hop-by-hop or unsafe headers: ${uniqueNames(omittedHeaders).join(', ')}.`);
  }

  const body = buildBody(request, options.includeSensitive, notes, redactedNames);
  for (const header of request.responseHeaders) {
    if (isSensitiveName(header.name)) redactedNames.push(header.name);
  }
  if (request.responseBody.availability === 'available' && request.responseBody.text) {
    const responseScan = redactBody(
      request.responseBody.text,
      request.responseBody.mimeType ?? request.responseMimeType,
      false,
    );
    redactedNames.push(...responseScan.redactedNames);
  }
  const methodLine = methodArgument(request.method, notes);
  const distinctNames = uniqueNames(redactedNames);
  const sensitiveDetected = distinctNames.length > 0 || body.sensitiveDetected;

  if (options.includeSensitive && sensitiveDetected) {
    lines.push('# Sensitive values are included because you turned redaction off for this session.');
  } else if (distinctNames.length > 0 || body.redactedNames.length > 0) {
    const listed = distinctNames.map((name) => commentSafe(name)).filter(Boolean).join(', ');
    lines.push(`# Redacted fields: ${listed || 'sensitive fields'}.`);
    lines.push('# Automatic redaction is heuristic and may miss secrets.');
  } else if (body.scanLimited || request.sensitiveScanLimited) {
    lines.push('# Part of this request was not fully scanned for secrets. Redaction is heuristic and may miss secrets.');
  }

  for (const note of notes) {
    const safe = commentSafe(note);
    if (safe) lines.push(`# ${safe}`);
  }

  const command = [
    `curl --globoff ${shellSingleQuote(url.url)}`,
    methodLine,
    ...headerArgs,
    sawEncoding ? '--compressed' : '',
    body.argument,
  ]
    .filter(Boolean)
    .join(' \\\n  ');

  return {
    command: `${lines.join('\n')}\n${command}`,
    redactedNames: uniqueNames([...distinctNames, ...body.redactedNames]),
    notes,
    sensitiveDetected,
    scanLimited: body.scanLimited || request.sensitiveScanLimited,
  };
}

function statusComment(request: CapturedRequest): string {
  if (request.status === null) return request.errorText ? `unavailable (${request.errorText})` : 'unavailable';
  return request.statusText ? `${request.status} ${request.statusText}` : String(request.status);
}

function methodArgument(method: string, notes: string[]): string {
  if (!method || method === 'UNAVAILABLE' || !isSafeHttpMethod(method)) {
    notes.push('The HTTP method was omitted because it was missing or unsafe to export.');
    return '';
  }
  return `-X ${method.toUpperCase()}`;
}

type HeaderDecision =
  | { kind: 'omit'; label: string }
  | { kind: 'keep'; argument: string; redactedName?: string; encoding: boolean };

function headerArgument(header: HeaderPair, includeSensitive: boolean): HeaderDecision {
  if (header.name.startsWith(':') || !isHttpToken(header.name)) {
    return { kind: 'omit', label: 'unsafe-header-name' };
  }
  const lower = header.name.toLowerCase();
  if (HOP_BY_HOP.has(lower)) return { kind: 'omit', label: lower };
  const sensitive = isSensitiveName(header.name);
  const value = sensitive && !includeSensitive ? '<redacted>' : stripNul(header.value);
  return {
    kind: 'keep',
    argument: `-H ${shellSingleQuote(`${header.name}: ${value}`)}`,
    redactedName: sensitive ? header.name : undefined,
    encoding: lower === 'accept-encoding' && /gzip|br|deflate/i.test(header.value),
  };
}

function buildBody(
  request: CapturedRequest,
  includeSensitive: boolean,
  notes: string[],
  redactedNames: string[],
): { argument: string; redactedNames: string[]; sensitiveDetected: boolean; scanLimited: boolean } {
  const body = request.requestBody;
  if (body.availability === 'empty') {
    return { argument: '', redactedNames: [], sensitiveDetected: false, scanLimited: false };
  }
  if (body.availability === 'binary') {
    notes.push('The request body is binary and was omitted. This command is incomplete.');
    return { argument: '', redactedNames: [], sensitiveDetected: false, scanLimited: false };
  }
  if (body.availability !== 'available' || body.text === null) {
    notes.push(body.message ?? 'The request body was not available from DevTools.');
    notes.push('This command is incomplete.');
    return { argument: '', redactedNames: [], sensitiveDetected: false, scanLimited: false };
  }

  const redacted = redactBody(body.text, body.mimeType ?? request.requestMimeType, includeSensitive);
  redactedNames.push(...redacted.redactedNames);
  if (body.truncated) notes.push('The request body was truncated. This command is incomplete.');
  if (redacted.rewritten) notes.push('The request body was rewritten so sensitive fields could be redacted. Formatting may differ from the original.');
  if (redacted.scanLimited) notes.push('The request body was not fully understood. It may still contain secrets.');
  if (body.text.includes('\u0000') && includeSensitive) notes.push('Nul bytes were removed from the exported body.');

  return {
    argument: `--data-raw ${shellSingleQuote(redacted.text)}`,
    redactedNames: redacted.redactedNames,
    sensitiveDetected: redacted.redactedNames.length > 0,
    scanLimited: redacted.scanLimited,
  };
}

export function shellSingleQuote(value: string): string {
  return `'${stripNul(value).replaceAll("'", `'\\''`)}'`;
}
