export type CompareHeader = {
  name: string;
  value: string;
};

export type CompareSnapshot = {
  label: string;
  status: number | null;
  headers: CompareHeader[];
  body: string | null;
};

export type FieldChange = {
  path: string;
  kind: 'added' | 'removed' | 'changed';
  left: string | null;
  right: string | null;
};

export type CompareResult = {
  status: {
    left: number | null;
    right: number | null;
    same: boolean;
  };
  headers: FieldChange[];
  body:
    | { kind: 'json'; same: boolean; changes: FieldChange[]; truncated: boolean }
    | { kind: 'text'; same: boolean }
    | { kind: 'unavailable'; message: string };
  headerChangesTruncated: boolean;
};

const MAX_CHANGES = 80;

export function compareSnapshots(left: CompareSnapshot, right: CompareSnapshot): CompareResult {
  const statusSame = left.status === right.status;
  const headers = compareMaps(groupHeaders(left.headers), groupHeaders(right.headers));
  return {
    status: { left: left.status, right: right.status, same: statusSame },
    headers: headers.changes,
    headerChangesTruncated: headers.truncated,
    body: compareBodies(left.body, right.body),
  };
}

function groupHeaders(headers: CompareHeader[]): Map<string, string> {
  const grouped = new Map<string, string[]>();
  for (const header of headers) {
    const name = header.name.toLowerCase();
    const values = grouped.get(name) ?? [];
    values.push(header.value);
    grouped.set(name, values);
  }
  return new Map([...grouped.entries()].map(([name, values]) => [name, values.join('\n')]));
}

function compareMaps(left: Map<string, string>, right: Map<string, string>): { changes: FieldChange[]; truncated: boolean } {
  const changes: FieldChange[] = [];
  const names = new Set([...left.keys(), ...right.keys()]);
  for (const name of [...names].sort()) {
    const leftValue = left.get(name) ?? null;
    const rightValue = right.get(name) ?? null;
    if (leftValue === rightValue) continue;
    changes.push({
      path: name,
      kind: leftValue === null ? 'added' : rightValue === null ? 'removed' : 'changed',
      left: leftValue,
      right: rightValue,
    });
  }
  return capChanges(changes);
}

function compareBodies(left: string | null, right: string | null): CompareResult['body'] {
  if (left === null && right === null) {
    return { kind: 'unavailable', message: 'Neither response included a body.' };
  }
  if (left === null || right === null) {
    return { kind: 'unavailable', message: 'One of the responses did not include a body.' };
  }
  const leftJson = parseJson(left);
  const rightJson = parseJson(right);
  if (leftJson.ok && rightJson.ok) {
    const diff = compareMaps(flattenJson(leftJson.value), flattenJson(rightJson.value));
    return { kind: 'json', same: diff.changes.length === 0, changes: diff.changes, truncated: diff.truncated };
  }
  return { kind: 'text', same: left === right };
}

function parseJson(text: string): { ok: true; value: unknown } | { ok: false } {
  try {
    return { ok: true, value: JSON.parse(text) as unknown };
  } catch {
    return { ok: false };
  }
}

function flattenJson(value: unknown, path = '$', depth = 0): Map<string, string> {
  const output = new Map<string, string>();
  if (depth > 30) {
    output.set(path, '[max depth]');
    return output;
  }
  if (Array.isArray(value)) {
    if (value.length === 0) output.set(path, '[]');
    value.forEach((item, index) => {
      for (const [key, child] of flattenJson(item, `${path}[${index}]`, depth + 1)) output.set(key, child);
    });
    return output;
  }
  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) output.set(path, '{}');
    for (const [key, child] of entries) {
      for (const [childKey, childValue] of flattenJson(child, `${path}.${key}`, depth + 1)) {
        output.set(childKey, childValue);
      }
    }
    return output;
  }
  output.set(path, JSON.stringify(value) ?? 'null');
  return output;
}

function capChanges(changes: FieldChange[]): { changes: FieldChange[]; truncated: boolean } {
  if (changes.length <= MAX_CHANGES) return { changes, truncated: false };
  return { changes: changes.slice(0, MAX_CHANGES), truncated: true };
}
