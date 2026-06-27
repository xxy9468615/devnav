import { useState, useEffect, useRef } from 'react';

export default function SearchBar() {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Dispatch filter events to the grid
    const timer = setTimeout(() => {
      document.dispatchEvent(new CustomEvent('filter-change', {
        detail: { query: query.trim() },
      }));
    }, 200);

    return () => { clearTimeout(timer); };
  }, [query]);

  // Keyboard shortcut: / to focus
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === '/' && document.activeElement?.tagName !== 'INPUT') {
        e.preventDefault();
        inputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        inputRef.current?.blur();
        setQuery('');
      }
    };
    document.addEventListener('keydown', handler);
    return () => { document.removeEventListener('keydown', handler); };
  }, []);

  return (
    <div className="relative">
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <svg className="h-5 w-5 text-text-secondary/50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
        </svg>
      </div>
      <input
        ref={inputRef}
        type="text"
        value={query}
        onChange={(e) => { setQuery(e.target.value); }}
        placeholder="Search resources... (press / to focus)"
        className="w-full pl-10 pr-10 py-3 bg-bg-secondary dark:bg-dark-bg-secondary border border-bg-tertiary/50 dark:border-dark-bg-tertiary/50 rounded-xl text-text-primary dark:text-dark-text-primary placeholder:text-text-secondary/40 dark:placeholder:text-dark-text-secondary/40 focus:outline-none focus:ring-2 focus:ring-accent-blue/30 focus:border-accent-blue/50 transition-all text-sm"
      />
      {query && (
        <button
          onClick={() => { setQuery(''); }}
          className="absolute inset-y-0 right-0 pr-3 flex items-center text-text-secondary/50 hover:text-text-secondary transition-colors"
        >
          <svg className="h-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      )}
    </div>
  );
}
