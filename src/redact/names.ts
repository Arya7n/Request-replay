const EXACT_NAMES = new Set([
  'authorization',
  'proxyauthorization',
  'cookie',
  'setcookie',
  'apikey',
  'xapikey',
  'token',
  'accesstoken',
  'refreshtoken',
  'idtoken',
  'secret',
  'clientsecret',
  'password',
  'passwd',
  'pwd',
  'sessionid',
  'sessiontoken',
  'privatekey',
  'credential',
  'credentials',
  'authtoken',
  'bearertoken',
  'securitytoken',
  'csrftoken',
  'xsrftoken',
  'csrf',
  'xsrf',
  'ssn',
  'cvv',
  'creditcard',
  'cardnumber',
  'pin',
]);

export function isSensitiveName(name: string): boolean {
  const normalized = name.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!normalized || normalized === 'contenttype' || normalized === 'wwwauthenticate') return false;
  if (EXACT_NAMES.has(normalized)) return true;
  if (normalized.includes('password')) return true;
  if (normalized.includes('secret')) return true;
  if (normalized.includes('apikey')) return true;
  if (normalized.includes('accesstoken')) return true;
  if (normalized.includes('refreshtoken')) return true;
  if (normalized.includes('sessionid')) return true;
  if (normalized.includes('privatekey')) return true;
  if (normalized.endsWith('token')) return true;
  return false;
}

export function uniqueNames(names: Iterable<string>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const name of names) {
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(name);
  }
  return result;
}
