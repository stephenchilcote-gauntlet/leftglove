// EDN micro-parser — handles the subset used by SL glossary files:
// maps, keywords, strings, vectors, booleans, nil, integers, line comments.

export function parseEdn(input: string): unknown {
  const stripped = input.replace(/;;[^\n]*/g, "");
  const [value] = parseValue(stripped, 0);
  return value;
}

function skipWhitespace(s: string, pos: number): number {
  while (pos < s.length && /[\s,]/.test(s[pos]!)) pos++;
  return pos;
}

function parseValue(s: string, pos: number): [unknown, number] {
  pos = skipWhitespace(s, pos);
  if (pos >= s.length) throw new Error("Unexpected end of input");

  const ch = s[pos]!;
  if (ch === "{") return parseMap(s, pos);
  if (ch === "[") return parseVector(s, pos);
  if (ch === '"') return parseString(s, pos);
  if (ch === ":") return parseKeyword(s, pos);
  if (ch === "-" || (ch >= "0" && ch <= "9")) return parseNumber(s, pos);

  // tokens: true, false, nil
  if (s.startsWith("true", pos) && isDelimiter(s, pos + 4))
    return [true, pos + 4];
  if (s.startsWith("false", pos) && isDelimiter(s, pos + 5))
    return [false, pos + 5];
  if (s.startsWith("nil", pos) && isDelimiter(s, pos + 3))
    return [null, pos + 3];

  throw new Error(
    `Unexpected character '${ch}' at position ${pos}: ...${s.slice(pos, pos + 20)}`,
  );
}

function isDelimiter(s: string, pos: number): boolean {
  return pos >= s.length || /[\s,{}\[\]()"]/.test(s[pos]!);
}

function parseMap(s: string, pos: number): [Record<string, unknown>, number] {
  pos++; // skip '{'
  const result: Record<string, unknown> = {};
  pos = skipWhitespace(s, pos);
  while (pos < s.length && s[pos] !== "}") {
    const [key, p1] = parseValue(s, pos);
    const [val, p2] = parseValue(s, p1);
    result[String(key)] = val;
    pos = skipWhitespace(s, p2);
  }
  if (pos >= s.length) throw new Error("Unterminated map");
  return [result, pos + 1];
}

function parseVector(s: string, pos: number): [unknown[], number] {
  pos++; // skip '['
  const result: unknown[] = [];
  pos = skipWhitespace(s, pos);
  while (pos < s.length && s[pos] !== "]") {
    const [val, p1] = parseValue(s, pos);
    result.push(val);
    pos = skipWhitespace(s, p1);
  }
  if (pos >= s.length) throw new Error("Unterminated vector");
  return [result, pos + 1];
}

function parseString(s: string, pos: number): [string, number] {
  pos++; // skip opening '"'
  let result = "";
  while (pos < s.length && s[pos] !== '"') {
    if (s[pos] === "\\") {
      pos++;
      const esc = s[pos]!;
      if (esc === '"') result += '"';
      else if (esc === "\\") result += "\\";
      else if (esc === "n") result += "\n";
      else if (esc === "t") result += "\t";
      else if (esc === "r") result += "\r";
      else result += esc;
    } else {
      result += s[pos];
    }
    pos++;
  }
  if (pos >= s.length) throw new Error("Unterminated string");
  return [result, pos + 1];
}

function parseKeyword(s: string, pos: number): [string, number] {
  pos++; // skip ':'
  const start = pos;
  while (pos < s.length && /[a-zA-Z0-9_.?!+*&=<>/'#-]/.test(s[pos]!)) pos++;
  return [s.slice(start, pos), pos];
}

function parseNumber(s: string, pos: number): [number, number] {
  const start = pos;
  if (s[pos] === "-") pos++;
  while (pos < s.length && s[pos]! >= "0" && s[pos]! <= "9") pos++;
  return [parseInt(s.slice(start, pos), 10), pos];
}
