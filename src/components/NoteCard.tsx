import { formatRelative } from '../lib/format';
import { noteParts } from '../lib/text';
import type { Note } from '../lib/types';
import { Highlight } from './Highlight';
import { PinIcon, StarIcon } from './icons';

interface NoteCardProps {
  note: Note;
  terms: string[];
  activeTag: string | null;
  onOpen: (id: string) => void;
  onTogglePin: (id: string) => void;
  onToggleFavourite: (id: string) => void;
  onSelectTag: (tag: string) => void;
}

export function NoteCard({
  note,
  terms,
  activeTag,
  onOpen,
  onTogglePin,
  onToggleFavourite,
  onSelectTag,
}: NoteCardProps) {
  const { title, body } = noteParts(note.content);
  const hasTags = note.tags.length > 0;

  return (
    <article
      className="card"
      role="button"
      tabIndex={0}
      aria-label={`Open note ${title}`}
      onClick={() => onOpen(note.id)}
      onKeyDown={(event) => {
        if (event.target !== event.currentTarget) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onOpen(note.id);
        }
      }}
    >
      <header className="card__head">
        <h3 className="card__title">
          <Highlight text={title} terms={terms} />
        </h3>
        <div className="card__actions">
          <button
            type="button"
            className={`icon-button ${note.pinned ? 'icon-button--active' : ''}`}
            aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
            aria-pressed={note.pinned}
            title={note.pinned ? 'Unpin' : 'Pin'}
            onClick={(event) => {
              event.stopPropagation();
              onTogglePin(note.id);
            }}
          >
            <PinIcon size={15} filled={note.pinned} />
          </button>
          <button
            type="button"
            className={`icon-button ${note.favourite ? 'icon-button--star' : ''}`}
            aria-label={note.favourite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={note.favourite}
            title={note.favourite ? 'Unfavourite' : 'Favourite'}
            onClick={(event) => {
              event.stopPropagation();
              onToggleFavourite(note.id);
            }}
          >
            <StarIcon size={15} filled={note.favourite} />
          </button>
        </div>
      </header>

      {body.trim().length > 0 && (
        <p className="card__body">
          <Highlight text={body} terms={terms} />
        </p>
      )}

      <footer className="card__foot">
        <div className="card__tags">
          {hasTags &&
            note.tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`tag-pill ${activeTag === tag ? 'tag-pill--active' : ''}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onSelectTag(tag);
                }}
              >
                #{tag}
              </button>
            ))}
        </div>
        <time className="card__time" dateTime={new Date(note.updatedAt).toISOString()}>
          {formatRelative(note.updatedAt)}
        </time>
      </footer>
    </article>
  );
}
