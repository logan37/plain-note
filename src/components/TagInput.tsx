import { useId, useState, type KeyboardEvent } from 'react';
import { normalizeTag } from '../lib/text';
import { CloseIcon, TagIcon } from './icons';

interface TagInputProps {
  tags: string[];
  suggestions: string[];
  onChange: (tags: string[]) => void;
}

export function TagInput({ tags, suggestions, onChange }: TagInputProps) {
  const [draft, setDraft] = useState('');
  const listId = useId();

  const commit = (value: string) => {
    const tag = normalizeTag(value);
    setDraft('');
    if (!tag || tags.includes(tag)) return;
    onChange([...tags, tag]);
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter' || event.key === ',') {
      event.preventDefault();
      commit(draft);
      return;
    }
    if (event.key === 'Backspace' && draft === '' && tags.length > 0) {
      onChange(tags.slice(0, -1));
    }
  };

  return (
    <div className="tag-input">
      <TagIcon className="tag-input__icon" size={15} />
      <div className="tag-input__fields">
        {tags.map((tag) => (
          <span key={tag} className="tag-chip">
            <span>#{tag}</span>
            <button
              type="button"
              className="tag-chip__remove"
              aria-label={`Remove tag ${tag}`}
              onClick={() => onChange(tags.filter((value) => value !== tag))}
            >
              <CloseIcon size={12} />
            </button>
          </span>
        ))}
        <input
          className="tag-input__entry"
          value={draft}
          list={listId}
          placeholder={tags.length === 0 ? 'Add tags…' : ''}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={onKeyDown}
          onBlur={() => draft.trim() && commit(draft)}
          aria-label="Add tags"
        />
        <datalist id={listId}>
          {suggestions
            .filter((tag) => !tags.includes(tag))
            .map((tag) => (
              <option key={tag} value={tag} />
            ))}
        </datalist>
      </div>
    </div>
  );
}
