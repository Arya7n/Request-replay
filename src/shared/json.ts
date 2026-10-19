export type JsonTokenType = 'key' | 'string' | 'number' | 'literal' | 'plain';

export type JsonToken = {
  type: JsonTokenType;
  text: string;
};

export function tryParseJson(text: string): unknown | null {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

export function tokenizeJson(input: string): JsonToken[] {
  const tokens: JsonToken[] = [];
  let index = 0;

  while (index < input.length) {
    const char = input[index];
    if (char === '"') {
      const start = index;
      index += 1;
      while (index < input.length) {
        if (input[index] === '\\') {
          index += 2;
          continue;
        }
        if (input[index] === '"') {
          index += 1;
          break;
        }
        index += 1;
      }
      let lookahead = index;
      while (lookahead < input.length && /\s/.test(input[lookahead] ?? '')) lookahead += 1;
      const isKey = input[lookahead] === ':';
      tokens.push({ type: isKey ? 'key' : 'string', text: input.slice(start, index) });
      continue;
    }

    if (char === '-' || (char !== undefined && char >= '0' && char <= '9')) {
      const start = index;
      index += 1;
      while (index < input.length && /[0-9eE+.\-]/.test(input[index] ?? '')) index += 1;
      tokens.push({ type: 'number', text: input.slice(start, index) });
      continue;
    }

    const word = matchLiteral(input, index);
    if (word) {
      tokens.push({ type: 'literal', text: word });
      index += word.length;
      continue;
    }

    const start = index;
    index += 1;
    while (index < input.length) {
      const current = input[index];
      if (
        current === '"' ||
        current === '-' ||
        (current !== undefined && current >= '0' && current <= '9') ||
        matchLiteral(input, index)
      ) {
        break;
      }
      index += 1;
    }
    tokens.push({ type: 'plain', text: input.slice(start, index) });
  }

  return tokens;
}

function matchLiteral(input: string, index: number): 'true' | 'false' | 'null' | null {
  if (input.startsWith('true', index)) return 'true';
  if (input.startsWith('false', index)) return 'false';
  if (input.startsWith('null', index)) return 'null';
  return null;
}

export function prettyJson(text: string): string | null {
  const parsed = tryParseJson(text);
  if (parsed === null) return null;
  return JSON.stringify(parsed, null, 2);
}
