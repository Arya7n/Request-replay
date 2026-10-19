import { describe, expect, it } from 'vitest';
import { redactBody } from '../src/redact/body';
import { isSensitiveName } from '../src/redact/names';
import { displayUrl } from '../src/redact/url';
import { tokenizeJson } from '../src/shared/json';
import { DEMO_SECRETS } from '../src/panel/demoData';

describe('sensitive names and body redaction', () => {
  it('matches credential headers and ignores ordinary ones', () => {
    expect(isSensitiveName('Authorization')).toBe(true);
    expect(isSensitiveName('Proxy-Authorization')).toBe(true);
    expect(isSensitiveName('Cookie')).toBe(true);
    expect(isSensitiveName('Set-Cookie')).toBe(true);
    expect(isSensitiveName('X-Api-Key')).toBe(true);
    expect(isSensitiveName('access_token')).toBe(true);
    expect(isSensitiveName('Content-Type')).toBe(false);
    expect(isSensitiveName('Accept')).toBe(false);
    expect(isSensitiveName('WWW-Authenticate')).toBe(false);
  });

  it('redacts JSON, form fields, and bearer tokens without returning the secret', () => {
    const json = redactBody(
      JSON.stringify({ username: 'demo-user', password: DEMO_SECRETS.password, nested: { apiKey: DEMO_SECRETS.apiKey } }),
      'application/json',
      false,
    );
    expect(json.text).not.toContain(DEMO_SECRETS.password);
    expect(json.text).not.toContain(DEMO_SECRETS.apiKey);
    expect(json.text).toContain('demo-user');
    expect(json.redactedNames).toEqual(expect.arrayContaining(['password', 'apiKey']));
    expect(json.redactedNames.join(' ')).not.toContain(DEMO_SECRETS.password);

    const unchanged = redactBody('{"username":"demo-user"}', 'application/json', false);
    expect(unchanged.text).toBe('{"username":"demo-user"}');
    expect(unchanged.rewritten).toBe(false);

    const form = redactBody(`user=demo-user&password=${DEMO_SECRETS.password}`, 'application/x-www-form-urlencoded', false);
    expect(form.text).not.toContain(DEMO_SECRETS.password);

    const loose = redactBody(`token in text Bearer ${DEMO_SECRETS.token}`, 'text/plain', false);
    expect(loose.text).not.toContain(DEMO_SECRETS.token);
    expect(loose.scanLimited).toBe(true);

    const revealed = redactBody(JSON.stringify({ password: DEMO_SECRETS.password }), 'application/json', true);
    expect(revealed.text).toContain(DEMO_SECRETS.password);
    expect(revealed.redactedNames).toContain('password');
  });

  it('hides sensitive query values in displayed URLs', () => {
    const url = `http://127.0.0.1:4173/api?access_token=${DEMO_SECRETS.queryToken}&q=widget`;
    expect(displayUrl(url, false)).not.toContain(DEMO_SECRETS.queryToken);
    expect(displayUrl(url, true)).toContain(DEMO_SECRETS.queryToken);
    expect(displayUrl('javascript:alert(1)', false)).toBe('javascript: URL');
  });
});

describe('JSON tokens', () => {
  it('classifies keys, strings, numbers, and literals as text tokens', () => {
    const tokens = tokenizeJson('{\n  "ok": true,\n  "n": 2\n}');
    expect(tokens.map((token) => token.type)).toContain('key');
    expect(tokens.map((token) => token.type)).toContain('literal');
    expect(tokens.map((token) => token.type)).toContain('number');
    expect(tokens.map((token) => token.text).join('')).toBe('{\n  "ok": true,\n  "n": 2\n}');
  });
});
