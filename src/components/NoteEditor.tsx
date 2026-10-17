import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react';
import { formatDateTime } from '../lib/format';
import { useVault } from '../state/vaultStore';
import { TagInput } from './TagInput';
import { CloseIcon, PinIcon, StarIcon, TrashIcon } from './icons';

interface NoteEditorProps {
  noteId: string;
  onClose: () => void;
}

function splitContent(content: string): { title: string; body: string } {
  const newline = content.indexOf('\n');
  if (newline === -1) return { title: content, body: '' };
  return { title: content.slice(0, newline), body: content.slice(newline + 1) };
}

function joinContent(title: string, body: string): string {
  return body.length > 0 ? `${title}\n${body}` : title;
}

export function NoteEditor({ noteId, onClose }: NoteEditorProps) {
  const { notes, tags, actions } = useVault();
  const note = notes.find((item) => item.id === noteId);

  const [title, setTitle] = useState(() => splitContent(note?.content ?? '').title);
  const [body, setBody] = useState(() => splitContent(note?.content ?? '').body);

  const titleRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const savedRef = useRef(note?.content ?? '');
  const latestRef = useRef({ title, body });
  latestRef.current = { title, body };

  useEffect(() => {
    const incoming = notes.find((item) => item.id === noteId);
    const parts = splitContent(incoming?.content ?? '');
    setTitle(parts.title);
    setBody(parts.body);
    savedRef.current = incoming?.content ?? '';
  }, [noteId]); // eslint-disable-line react-hooks/exhaustive-deps

  const flush = useCallback(() => {
    const { title: nextTitle, body: nextBody } = latestRef.current;
    const content = joinContent(nextTitle, nextBody);
    if (content === savedRef.current) return;
    savedRef.current = content;
    void actions.updateNote(noteId, { content });
  }, [actions, noteId]);

  useEffect(() => {
    const content = joinContent(title, body);
    if (content === savedRef.current) return;
    const timer = window.setTimeout(() => {
      savedRef.current = content;
      void actions.updateNote(noteId, { content });
    }, 250);
    return () => window.clearTimeout(timer);
  }, [title, body, actions, noteId]);

  useEffect(() => () => flush(), [flush]);

  useLayoutEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    element.style.height = 'auto';
    element.style.height = `${element.scrollHeight}px`;
  }, [body]);

  useEffect(() => {
    if (title.length === 0) titleRef.current?.focus();
    else bodyRef.current?.focus();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!note) return null;

  const handleClose = () => {
    flush();
    onClose();
  };

  const onTitleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      bodyRef.current?.focus();
    } else if (event.key === 'ArrowDown') {
      event.preventDefault();
      bodyRef.current?.focus();
    }
  };

  const onBodyKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    const element = event.currentTarget;
    if (event.key === 'Escape') {
      event.preventDefault();
      handleClose();
      return;
    }
    if (event.key === 'ArrowUp' && element.selectionStart === 0) {
      event.preventDefault();
      titleRef.current?.focus();
      return;
    }
    if (
      event.key === 'Backspace' &&
      element.selectionStart === 0 &&
      element.selectionEnd === 0 &&
      body.length === 0
    ) {
      event.preventDefault();
      titleRef.current?.focus();
    }
  };

  const onDelete = () => {
    if (!window.confirm('Delete this note everywhere it is synced?')) return;
    savedRef.current = joinContent(latestRef.current.title, latestRef.current.body);
    void actions.deleteNote(noteId);
    onClose();
  };

  return (
    <div className="modal" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && handleClose()}>
      <div className="editor" role="dialog" aria-modal="true" aria-label="Note editor">
        <header className="editor__bar">
          <button
            type="button"
            className={`icon-button ${note.pinned ? 'icon-button--active' : ''}`}
            aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
            aria-pressed={note.pinned}
            onClick={() => void actions.togglePin(noteId)}
          >
            <PinIcon size={16} filled={note.pinned} />
          </button>
          <button
            type="button"
            className={`icon-button ${note.favourite ? 'icon-button--star' : ''}`}
            aria-label={note.favourite ? 'Remove from favourites' : 'Add to favourites'}
            aria-pressed={note.favourite}
            onClick={() => void actions.toggleFavourite(noteId)}
          >
            <StarIcon size={16} filled={note.favourite} />
          </button>
          <span className="editor__spacer" />
          <button type="button" className="icon-button icon-button--danger" aria-label="Delete note" onClick={onDelete}>
            <TrashIcon size={16} />
          </button>
          <button type="button" className="icon-button" aria-label="Close editor" onClick={handleClose}>
            <CloseIcon size={16} />
          </button>
        </header>

        <div className="editor__scroll">
          <input
            ref={titleRef}
            className="editor__title"
            value={title}
            placeholder="Title"
            aria-label="Note title"
            spellCheck
            onChange={(event) => setTitle(event.target.value.replace(/\n/g, ''))}
            onKeyDown={onTitleKeyDown}
          />
          <textarea
            ref={bodyRef}
            className="editor__body"
            value={body}
            placeholder="Start typing…"
            aria-label="Note body"
            spellCheck
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={onBodyKeyDown}
          />
        </div>

        <footer className="editor__foot">
          <TagInput tags={note.tags} suggestions={tags} onChange={(next) => void actions.setNoteTags(noteId, next)} />
          <span className="editor__meta">Edited {formatDateTime(note.updatedAt)}</span>
        </footer>
      </div>
    </div>
  );
}
