export interface NoteParts {
  title: string;
  body: string;
}

const UNTITLED = 'Untitled note';

/** The first line of a note is its title. */
export function noteParts(content: string): NoteParts {
  const normalized = content.replace(/\r\n?/g, '\n');
  const newline = normalized.indexOf('\n');
  const rawTitle = newline === -1 ? normalized : normalized.slice(0, newline);
  const body = newline === -1 ? '' : normalized.slice(newline + 1);
  const title = rawTitle.trim();
  return { title: title.length > 0 ? title : UNTITLED, body: body.replace(/^\n+/, '') };
}

export function noteTitle(content: string): string {
  return noteParts(content).title;
}

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildMatcher(terms: string[]): RegExp | null {
  const cleaned = terms.map((term) => term.trim()).filter(Boolean);
  if (cleaned.length === 0) return null;
  const pattern = cleaned
    .slice()
    .sort((a, b) => b.length - a.length)
    .map(escapeRegExp)
    .join('|');
  return new RegExp(`(${pattern})`, 'gi');
}

export interface HighlightSlice {
  text: string;
  match: boolean;
}

export function highlightSlices(text: string, matcher: RegExp | null): HighlightSlice[] {
  if (!matcher) return [{ text, match: false }];
  const slices: HighlightSlice[] = [];
  let last = 0;
  matcher.lastIndex = 0;
  let result = matcher.exec(text);
  while (result) {
    if (result.index > last) slices.push({ text: text.slice(last, result.index), match: false });
    slices.push({ text: result[0], match: true });
    last = result.index + result[0].length;
    if (result[0].length === 0) matcher.lastIndex += 1;
    result = matcher.exec(text);
  }
  if (last < text.length) slices.push({ text: text.slice(last), match: false });
  return slices;
}

export function normalizeTag(tag: string): string {
  return tag
    .trim()
    .replace(/^#+/, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}
