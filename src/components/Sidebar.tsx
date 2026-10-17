import type { NoteFilter } from '../lib/types';
import { StarIcon, TagIcon, NoteIcon } from './icons';

interface SidebarProps {
  filter: NoteFilter;
  onFilterChange: (filter: NoteFilter) => void;
  tags: string[];
  tagCounts: Map<string, number>;
  totalCount: number;
  favouriteCount: number;
}

function isActive(filter: NoteFilter, candidate: NoteFilter): boolean {
  if (filter.kind !== candidate.kind) return false;
  if (filter.kind === 'tag' && candidate.kind === 'tag') return filter.tag === candidate.tag;
  return true;
}

export function Sidebar({
  filter,
  onFilterChange,
  tags,
  tagCounts,
  totalCount,
  favouriteCount,
}: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Note filters">
      <button
        type="button"
        className={`nav-item ${isActive(filter, { kind: 'all' }) ? 'nav-item--active' : ''}`}
        onClick={() => onFilterChange({ kind: 'all' })}
      >
        <NoteIcon size={16} />
        <span className="nav-item__label">All notes</span>
        <span className="nav-item__count">{totalCount}</span>
      </button>
      <button
        type="button"
        className={`nav-item ${isActive(filter, { kind: 'favourites' }) ? 'nav-item--active' : ''}`}
        onClick={() => onFilterChange({ kind: 'favourites' })}
      >
        <StarIcon size={16} filled={filter.kind === 'favourites'} />
        <span className="nav-item__label">Favourites</span>
        <span className="nav-item__count">{favouriteCount}</span>
      </button>

      {tags.length > 0 && (
        <>
          <h2 className="sidebar__heading">
            <TagIcon size={13} />
            Tags
          </h2>
          <div className="sidebar__tags">
            {tags.map((tag) => (
              <button
                key={tag}
                type="button"
                className={`nav-chip ${isActive(filter, { kind: 'tag', tag }) ? 'nav-chip--active' : ''}`}
                onClick={() => onFilterChange(filter.kind === 'tag' && filter.tag === tag ? { kind: 'all' } : { kind: 'tag', tag })}
              >
                <span>#{tag}</span>
                <span className="nav-item__count">{tagCounts.get(tag) ?? 0}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </nav>
  );
}
