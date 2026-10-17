import type { RefObject } from 'react';
import { CloseIcon, SearchIcon } from './icons';

interface SearchBarProps {
  value: string;
  onChange: (value: string) => void;
  inputRef: RefObject<HTMLInputElement | null>;
}

export function SearchBar({ value, onChange, inputRef }: SearchBarProps) {
  return (
    <div className="search">
      <SearchIcon className="search__icon" size={17} />
      <input
        ref={inputRef}
        className="search__input"
        type="search"
        value={value}
        placeholder="Search notes…  (use #tag to filter)"
        aria-label="Search notes"
        autoComplete="off"
        onChange={(event) => onChange(event.target.value)}
      />
      {value.length > 0 && (
        <button type="button" className="search__clear" aria-label="Clear search" onClick={() => onChange('')}>
          <CloseIcon size={14} />
        </button>
      )}
    </div>
  );
}
