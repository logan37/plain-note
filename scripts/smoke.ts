import assert from 'node:assert/strict';
import {
  decryptJson,
  deriveKey,
  encryptJson,
  exportKeyRaw,
  fromBase64,
  importKeyRaw,
  randomBytes,
  toBase64,
} from '../src/lib/crypto';
import { noteParts, normalizeTag, buildMatcher, highlightSlices } from '../src/lib/text';
import { parseQuery, selectNotes } from '../src/lib/search';
import { toMarkdown } from '../src/lib/portable';
import type { Note } from '../src/lib/types';

function note(partial: Partial<Note>): Note {
  return {
    id: partial.id ?? crypto.randomUUID(),
    content: '',
    tags: [],
    pinned: false,
    favourite: false,
    createdAt: 0,
    updatedAt: 0,
    deletedAt: null,
    ...partial,
  };
}

async function cryptoSuite() {
  const salt = randomBytes(16);
  const key = await deriveKey('correct horse battery staple', salt, 1000);
  const payload = { hello: 'world', list: [1, 2, 3] };
  const sealed = await encryptJson(key, payload);
  const opened = await decryptJson<typeof payload>(key, sealed);
  assert.deepEqual(opened, payload, 'roundtrip should preserve data');

  const same = await deriveKey('correct horse battery staple', salt, 1000);
  assert.deepEqual(await decryptJson(same, sealed), payload, 'same passphrase derives same key');

  const wrong = await deriveKey('wrong passphrase', salt, 1000);
  await assert.rejects(() => decryptJson(wrong, sealed), 'wrong key must fail auth');

  const raw = await exportKeyRaw(key);
  const imported = await importKeyRaw(raw);
  assert.deepEqual(await decryptJson(imported, sealed), payload, 'raw export/import roundtrip');

  assert.equal(toBase64(fromBase64('AQIDBA==')), 'AQIDBA==', 'base64 roundtrip');
  console.log('ok  crypto (roundtrip, determinism, auth failure, key export)');
}

function textSuite() {
  assert.deepEqual(noteParts('My title\nline one\nline two'), {
    title: 'My title',
    body: 'line one\nline two',
  });
  assert.deepEqual(noteParts('   '), { title: 'Untitled note', body: '' });
  assert.deepEqual(noteParts('Only a title'), { title: 'Only a title', body: '' });
  assert.equal(normalizeTag('#  Work Stuff '), 'work-stuff');

  const matcher = buildMatcher(['budget', 'march']);
  const slices = highlightSlices('March budget review', matcher);
  assert.deepEqual(
    slices.filter((s) => s.match).map((s) => s.text.toLowerCase()),
    ['march', 'budget'],
  );
  console.log('ok  text (title split, tag normalise, highlight)');
}

function searchSuite() {
  assert.deepEqual(parseQuery('invoice #Work  march'), {
    terms: ['invoice', 'march'],
    tags: ['work'],
  });

  const notes = [
    note({ id: 'a', content: 'Budget review\nQuarterly numbers', tags: ['finance'], updatedAt: 100 }),
    note({ id: 'b', content: 'Meeting notes\nbudget mentioned once', updatedAt: 200 }),
    note({ id: 'c', content: 'Grocery list', favourite: true, updatedAt: 50 }),
    note({ id: 'd', content: 'Pinned thing', pinned: true, updatedAt: 10 }),
  ];

  const all = selectNotes(notes, { kind: 'all' }, '');
  assert.deepEqual(all.notes.map((n) => n.id), ['d', 'b', 'a', 'c'], 'pinned first, then recency');

  const ranked = selectNotes(notes, { kind: 'all' }, 'budget');
  assert.equal(ranked.notes[0].id, 'a', 'title match outranks body match');

  const favs = selectNotes(notes, { kind: 'favourites' }, '');
  assert.deepEqual(favs.notes.map((n) => n.id), ['c'], 'favourites filter');

  const tagged = selectNotes(notes, { kind: 'tag', tag: 'finance' }, '');
  assert.deepEqual(tagged.notes.map((n) => n.id), ['a'], 'tag filter');

  const queryTagged = selectNotes(notes, { kind: 'all' }, '#finance numbers');
  assert.deepEqual(queryTagged.notes.map((n) => n.id), ['a'], '#tag in query');

  const none = selectNotes(notes, { kind: 'all' }, 'zzzz');
  assert.equal(none.notes.length, 0, 'no matches');

  const markdown = toMarkdown([notes[0]]);
  assert.ok(markdown.startsWith('# Budget review'), 'markdown export uses first-line title');
  assert.ok(markdown.includes('#finance'), 'markdown export includes tags');
  console.log('ok  search (ranking, filters, #tag, markdown)');
}

await cryptoSuite();
textSuite();
searchSuite();
console.log('\nAll smoke tests passed.');
