/**
 * Convert an Iconify icon name into a Dart-safe identifier.
 *
 * Algorithm:
 *   1. Replace '.', '/', ':', '_' with '-' and tokenize on '-'.
 *   2. Lowercase every token.
 *   3. camelCase: first token stays lower; subsequent tokens get their first
 *      char uppercased.
 *   4. If the result starts with a digit, prefix with 'n'.
 *   5. If the result is a Dart reserved word, append '_'.
 *   6. Within a single set, identifiers must be unique. The caller passes a
 *      `Set<string>` of already-claimed identifiers; on collision a suffix
 *      '_2', '_3', ... is appended.
 *   7. Strip any character that is not a valid Dart identifier character
 *      (only [A-Za-z0-9_$]) — this should be rare since icon names are
 *      mostly kebab-case.
 *
 * The resolved identifier is persisted in the manifest; once an icon has
 * been assigned an identifier it is never re-derived from the rule. This
 * means future rule changes only affect newly-added icons, preserving API
 * stability.
 */
export const DART_RESERVED_WORDS: ReadonlySet<string> = new Set([
  // Reserved (cannot be used as identifiers)
  'assert', 'break', 'case', 'catch', 'class', 'const', 'continue',
  'default', 'do', 'else', 'enum', 'extends', 'false', 'final',
  'finally', 'for', 'if', 'in', 'is', 'new', 'null', 'rethrow',
  'return', 'super', 'switch', 'this', 'throw', 'true', 'try',
  'var', 'void', 'while', 'with',
  // Built-in identifiers (allowed in some contexts but not safe as static field names)
  'abstract', 'as', 'covariant', 'deferred', 'dynamic', 'export',
  'extension', 'external', 'factory', 'Function', 'get', 'implements',
  'import', 'interface', 'late', 'library', 'mixin', 'operator',
  'part', 'required', 'set', 'static', 'typedef',
  // Async-related contextual keywords
  'async', 'await', 'sync', 'yield',
  // Common type names to avoid shadowing
  'Object', 'Never', 'Type', 'Null', 'Future', 'Stream', 'Iterable',
  'List', 'Map', 'Set', 'String', 'int', 'double', 'num', 'bool',
]);

const VALID_DART_CHAR = /[A-Za-z0-9_$]/;

export function sanitizeIdentifier(
  iconifyName: string,
  claimedIdentifiers: Set<string>
): string {
  // 1. Normalize separators → '-', then tokenize.
  const tokens = iconifyName
    .replace(/[./:_]/g, '-')
    .split('-')
    .filter((t) => t.length > 0);

  if (tokens.length === 0) {
    throw new Error(`Cannot derive identifier for icon name: ${iconifyName}`);
  }

  // 2-3. camelCase
  let identifier = tokens
    .map((tok, i) => {
      const lower = tok.toLowerCase();
      if (i === 0) return lower;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');

  // 7. Strip invalid chars (safety; should be rare).
  identifier = [...identifier].filter((c) => VALID_DART_CHAR.test(c)).join('');

  if (identifier.length === 0) {
    throw new Error(`Identifier became empty after sanitization: ${iconifyName}`);
  }

  // 4. Leading digit → prefix 'n'.
  if (/^[0-9]/.test(identifier)) {
    identifier = 'n' + identifier;
  }

  // 5. Reserved word → suffix '_'.
  if (DART_RESERVED_WORDS.has(identifier)) {
    identifier = identifier + '_';
  }

  // 6. Collision resolution: append '_2', '_3', ...
  if (claimedIdentifiers.has(identifier)) {
    let n = 2;
    while (claimedIdentifiers.has(`${identifier}_${n}`)) {
      n += 1;
    }
    identifier = `${identifier}_${n}`;
  }

  return identifier;
}
