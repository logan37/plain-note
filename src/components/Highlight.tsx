import { useMemo } from 'react';
import { buildMatcher, highlightSlices } from '../lib/text';

export function Highlight({ text, terms }: { text: string; terms: string[] }) {
  const key = terms.join('\u0000');
  const matcher = useMemo(() => buildMatcher(terms), [key]);
  const slices = useMemo(() => highlightSlices(text, matcher), [text, matcher]);

  return (
    <>
      {slices.map((slice, index) =>
        slice.match ? (
          <mark key={index} className="hl">
            {slice.text}
          </mark>
        ) : (
          <span key={index}>{slice.text}</span>
        ),
      )}
    </>
  );
}
