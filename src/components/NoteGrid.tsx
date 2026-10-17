import type { Note } from '../lib/types';
import { NoteCard } from './NoteCard';
import { NoteIcon } from './icons';

interface NoteGridProps {
  notes: Note[];
  terms: string[];
  activeTag: string | null;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  onSelectTag: (tag: string) => void;
  onClearFilters: () => void;
  emptyHint: string;
}

export function NoteGrid({
  notes,
  terms,
  activeTag,
  onOpen,
  onTogglePin,
  onToggleFavourite,
  onSelectTag,
  onClearFilters,
  emptyHint,
}: NoteGridProps) {
  if (notes.length === 0) {
    return (
      <div className="empty-state">
        <NoteIcon size={40} />
        <p>{emptyHint}</p>
        <button type="button" className="button button--ghost" onClick={onClearFilters}>
          Clear filters
        </button>
      </div>
    );
  }

  const pinned = notes.filter((note) => note.pinned);
  const rest = notes.filter((note) => !note.pinned);

  const renderCard = (note: Note) => (
    <NoteCard
      key={note.id}
      note={note}
      terms={terms}
      activeTag={activeTag}
      onOpen={onOpen}
      onTogglePin={onTogglePin}
      onToggleFavourite={onToggleFavourite}
      onSelectTag={onSelectTag}
    />
  );

  return (
    <div className="grid-stack">
      {pinned.length > 0 && (
        <section className="grid-section">
          <h2 className="grid-section__label">Pinned</h2>
          <div className="masonry">{pinned.map(renderCard)}</div>
        </section>
      )}
      <section className="grid-section">
        {pinned.length > 0 && <h2 className="grid-section__label">Others</h2>}
        <div className="masonry">{rest.map(renderCard)}</div>
      </section>
    </div>
  );
}
