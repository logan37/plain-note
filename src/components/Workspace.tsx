import { useEffect, useMemo, useRef, useState } from 'react';
import { parseQuery, selectNotes } from '../lib/search';
import { normalizeTag } from '../lib/text';
import type { NoteFilter } from '../lib/types';
import { useVault } from '../state/vaultStore';
import { NoteEditor } from './NoteEditor';
import { NoteGrid } from './NoteGrid';
import { SearchBar } from './SearchBar';
import { SettingsDialog } from './SettingsDialog';
import { Sidebar } from './Sidebar';
import { LockIcon, MoonIcon, PlusIcon, SettingsIcon, SunIcon, SyncIcon } from './icons';

export function Workspace() {
  const { notes, tags, settings, syncing, syncError, actions } = useVault();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<NoteFilter>({ kind: 'all' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const { terms } = parseQuery(query);
  const outcome = useMemo(() => selectNotes(notes, filter, query), [notes, filter, query]);

  const tagCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const note of notes) {
      for (const tag of note.tags) {
        const key = normalizeTag(tag);
        counts.set(key, (counts.get(key) ?? 0) + 1);
      }
    }
    return counts;
  }, [notes]);

  const favouriteCount = useMemo(() => notes.filter((note) => note.favourite).length, [notes]);

  const newNote = async () => {
    const note = await actions.createNote();
    if (note) {
      setQuery('');
      setFilter({ kind: 'all' });
      setEditingId(note.id);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const meta = event.ctrlKey || event.metaKey;
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        searchRef.current?.focus();
        searchRef.current?.select();
      } else if (meta && event.key.toLowerCase() === 'n') {
        event.preventDefault();
        void newNote();
      } else if (event.key === 'Escape' && document.activeElement === searchRef.current) {
        setQuery('');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const emptyHint =
    query.trim().length > 0
      ? 'No notes match your search.'
      : filter.kind === 'favourites'
        ? 'No favourites yet. Tap the star on a note.'
        : filter.kind === 'tag'
          ? `No notes tagged #${filter.tag}.`
          : 'No notes yet. Create your first one.';

  const clearFilters = () => {
    setQuery('');
    setFilter({ kind: 'all' });
  };

  const themeIcon = settings.theme === 'dark' ? <SunIcon size={17} /> : <MoonIcon size={17} />;

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark">
            <LockIcon size={16} />
          </span>
          <span className="brand__name">Plain Note</span>
        </div>

        <SearchBar value={query} onChange={setQuery} inputRef={searchRef} />

        <div className="topbar__actions">
          <button
            type="button"
            className={`icon-button ${syncing ? 'icon-button--spin' : ''}`}
            title={syncError ?? 'Sync now'}
            aria-label="Sync now"
            onClick={() => {
              if (settings.syncFolderLabel) void actions.syncNow();
              else setSettingsOpen(true);
            }}
          >
            <SyncIcon size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            title="Toggle theme"
            aria-label="Toggle theme"
            onClick={() =>
              void actions.updateSettings({ theme: settings.theme === 'dark' ? 'light' : 'dark' })
            }
          >
            {themeIcon}
          </button>
          <button
            type="button"
            className="icon-button"
            title="Settings"
            aria-label="Settings"
            onClick={() => setSettingsOpen(true)}
          >
            <SettingsIcon size={17} />
          </button>
          <button type="button" className="button button--primary new-note" onClick={() => void newNote()}>
            <PlusIcon size={16} /> <span>New note</span>
          </button>
        </div>
      </header>

      {(syncError || syncing) && (
        <div className={`banner ${syncError ? 'banner--warn' : ''}`}>
          {syncing ? 'Syncing with your folder…' : syncError}
        </div>
      )}

      <div className="body">
        <Sidebar
          filter={filter}
          onFilterChange={setFilter}
          tags={tags}
          tagCounts={tagCounts}
          totalCount={notes.length}
          favouriteCount={favouriteCount}
        />
        <main className="content">
          <NoteGrid
            notes={outcome.notes}
            terms={terms}
            activeTag={filter.kind === 'tag' ? filter.tag : null}
            onOpen={setEditingId}
            onTogglePin={(id) => void actions.togglePin(id)}
            onToggleFavourite={(id) => void actions.toggleFavourite(id)}
            onSelectTag={(tag) => setFilter({ kind: 'tag', tag })}
            onClearFilters={clearFilters}
            emptyHint={emptyHint}
          />
        </main>
      </div>

      {editingId && <NoteEditor noteId={editingId} onClose={() => setEditingId(null)} />}
      {settingsOpen && <SettingsDialog onClose={() => setSettingsOpen(false)} />}
    </div>
  );
}
