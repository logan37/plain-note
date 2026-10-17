import { noteParts, normalizeTag } from './text';
import type { Note, NoteFilter } from './types';

export interface ParsedQuery {
  terms: string[];
  tags: string[];
}

/** Supports `#tag` filters plus free-text terms, e.g. `meeting #work budget`. */
export function parseQuery(raw: string): ParsedQuery {
  const terms: string[] = [];
  const tags: string[] = [];
  for (const part of raw.trim().split(/\s+/)) {
    if (!part) continue;
    if (part.startsWith('#')) {
      const tag = normalizeTag(part);
      if (tag) tags.push(tag);
    } else {
      terms.push(part.toLowerCase());
    }
  }
  return { terms, tags };
}

export function scoreNote(note: Note, terms: string[]): number {
  if (terms.length === 0) return 0;
  const { title, body } = noteParts(note.content);
  const titleLower = title.toLowerCase();
  const bodyLower = body.toLowerCase();
  const tagsLower = note.tags.map((tag) => tag.toLowerCase());
  let score = 0;
  for (const term of terms) {
    let hit = 0;
    if (titleLower.includes(term)) hit += 10;
    if (tagsLower.some((tag) => tag.includes(term))) hit += 6;
    if (bodyLower.includes(term)) hit += 2;
    if (hit === 0) return -1;
    score += hit;
  }
  return score;
}

export interface SearchOutcome {
  notes: Note[];
  scores: Map<string, number>;
}

export function selectNotes(notes: Note[], filter: NoteFilter, rawQuery: string): SearchOutcome {
  const { terms, tags } = parseQuery(rawQuery);
  const wanted = filter.kind === 'tag' ? normalizeTag(filter.tag) : null;
  const scores = new Map<string, number>();
  const matched: Note[] = [];

  for (const note of notes) {
    if (filter.kind === 'favourites' && !note.favourite) continue;
    if (wanted && !note.tags.some((tag) => normalizeTag(tag) === wanted)) continue;
    if (
      tags.length > 0 &&
      !tags.every((tag) => note.tags.some((value) => normalizeTag(value) === tag))
    ) {
      continue;
    }
    const score = scoreNote(note, terms);
    if (score < 0) continue;
    scores.set(note.id, score);
    matched.push(note);
  }

  const hasQuery = terms.length > 0;
  matched.sort((a, b) => {
    if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
    if (hasQuery) {
      const diff = (scores.get(b.id) ?? 0) - (scores.get(a.id) ?? 0);
      if (diff !== 0) return diff;
    }
    return b.updatedAt - a.updatedAt;
  });

  return { notes: matched, scores };
}
