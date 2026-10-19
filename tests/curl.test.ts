import { describe, expect, it } from 'vitest';
import { generateCurl, shellSingleQuote } from '../src/curl/generateCurl';
import { DEMO_SECRETS, createDemoRequests } from '../src/panel/demoData';
import { executableLines, makeRequest } from './helpers';

describe('shell quoting', () => {
  it('keeps spaces, quotes, dollars, backticks, and newlines inside single quotes', () => {
    expect(shellSingleQuote("a b")).toBe("'a b'");
    expect(shellSingleQuote("a'b")).toBe(`'a'\\''b'`);
    expect(shellSingleQuote('$(reboot)')).toBe("'$(reboot)'");
    expect(shellSingleQuote('`reboot`')).toBe("'`reboot`'");
    expect(shellSingleQuote('line1\nline2')).toBe("'line1\nline2'");
  });
});

describe('generateCurl', () => {
  it('builds a GET command with the method, query, and safe headers', () => {
    const command = generateCurl(
      makeRequest({
        url: 'http://127.0.0.1:4173/api/items?q=widget',
        query: [{ name: 'q', value: 'widget' }],
        requestHeaders: [
          { name: 'Accept', value: 'application/json' },
          { name: 'Content-Length', value: '0' },
          { name: ':authority', value: '127.0.0.1:4173' },
          { name: 'Host', value: '127.0.0.1:4173' },
        ],
      }),
      { includeSensitive: false },
    );
    const executable = executableLines(command.command);
    expect(executable).toContain("curl --globoff 'http://127.0.0.1:4173/api/items?q=widget'");
    expect(executable).toContain('-X GET');
    expect(executable).toContain("-H 'Accept: application/json'");
    expect(executable).not.toContain('Content-Length');
    expect(executable).not.toContain(':authority');
    expect(executable).not.toContain("-H 'Host:");
    expect(executable).not.toContain('--data-raw');
  });

  it('builds a POST command with a JSON body and escapes special characters', () => {
    const body = '{\n  "note": "it\'s a $(test) `cmd`"\n}';
    const result = generateCurl(
      makeRequest({
        method: 'POST',
        url: 'http://127.0.0.1:4173/api/notes',
        requestMimeType: 'application/json',
        requestHeaders: [
          { name: 'Content-Type', value: 'application/json' },
          { name: 'Accept-Encoding', value: 'gzip, deflate, br' },
        ],
        requestBody: {
          availability: 'available',
          text: body,
          mimeType: 'application/json',
          byteLength: body.length,
          truncated: false,
          message: null,
        },
      }),
      { includeSensitive: false },
    );
    const executable = executableLines(result.command);
    expect(executable).toContain('-X POST');
    expect(executable).toContain('--compressed');
    expect(executable).toContain(`--data-raw ${shellSingleQuote(body)}`);
    expect(executable).not.toContain('rm ');
  });

  it('redacts authorization, cookies, query secrets, and JSON passwords by default', () => {
    const session = createDemoRequests()[0];
    if (!session) throw new Error('Demo requests were empty.');
    const result = generateCurl(session, { includeSensitive: false });
    const executable = executableLines(result.command);
    expect(executable).not.toContain(DEMO_SECRETS.token);
    expect(executable).not.toContain(DEMO_SECRETS.apiKey);
    expect(executable).not.toContain(DEMO_SECRETS.password);
    expect(executable).not.toContain(DEMO_SECRETS.queryToken);
    expect(executable).toContain('-H \'Authorization: <redacted>\'');
    expect(executable).toContain('-H \'X-Api-Key: <redacted>\'');
    expect(result.command).toContain('Redacted fields:');
    expect(result.command).toContain('heuristic');
    expect(result.sensitiveDetected).toBe(true);
    expect(result.redactedNames.map((name) => name.toLowerCase())).toEqual(
      expect.arrayContaining(['authorization', 'x-api-key', 'access_token', 'password', 'set-cookie']),
    );
  });

  it('includes sensitive values only when the caller explicitly asks', () => {
    const session = createDemoRequests()[0];
    if (!session) throw new Error('Demo requests were empty.');
    const result = generateCurl(session, { includeSensitive: true });
    const executable = executableLines(result.command);
    expect(executable).toContain(DEMO_SECRETS.token);
    expect(executable).toContain(DEMO_SECRETS.apiKey);
    expect(executable).toContain(DEMO_SECRETS.password);
    expect(executable).toContain(DEMO_SECRETS.queryToken);
    expect(result.command).toContain('you turned redaction off');
    expect(executable).not.toContain(DEMO_SECRETS.cookie);
  });

  it('does not invent a body when DevTools omitted it', () => {
    const result = generateCurl(
      makeRequest({
        method: 'POST',
        requestBody: {
          availability: 'unavailable',
          text: null,
          mimeType: null,
          byteLength: 42,
          truncated: false,
          message: 'Chrome did not include the request body for this request.',
        },
      }),
      { includeSensitive: false },
    );
    expect(executableLines(result.command)).not.toContain('--data-raw');
    expect(result.notes.join(' ')).toContain('did not include the request body');
    expect(result.command).toContain('incomplete');
  });

  it('refuses unsafe URLs and neutralizes comment injection', () => {
    const script = generateCurl(makeRequest({ url: 'javascript:alert(1)' }), { includeSensitive: false });
    expect(script.command).toBe('');
    expect(script.notes.join(' ')).toContain('http and https');

    const hostile = generateCurl(
      makeRequest({
        statusText: 'OK\ncurl http://127.0.0.1:9/pwned',
        requestHeaders: [{ name: 'X-Name\nEvil', value: '1' }],
      }),
      { includeSensitive: false },
    );
    expect(executableLines(hostile.command)).not.toContain('pwned');
    expect(executableLines(hostile.command)).not.toContain('X-Name');
  });

  it('redacts credentials embedded in the URL', () => {
    const result = generateCurl(
      makeRequest({ url: `http://demo-user:${DEMO_SECRETS.password}@127.0.0.1:4173/secret` }),
      { includeSensitive: false },
    );
    expect(executableLines(result.command)).not.toContain(DEMO_SECRETS.password);
    expect(result.command).toContain('redacted');
  });

  it('omits an unsafe HTTP method instead of placing it in the command', () => {
    const result = generateCurl(makeRequest({ method: 'GET; rm -rf /' }), { includeSensitive: false });
    expect(executableLines(result.command)).not.toContain('rm');
    expect(result.notes.join(' ')).toContain('method');
  });
});
