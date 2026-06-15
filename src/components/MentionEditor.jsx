import { useEffect, useRef, useState } from 'react';

// ── RENDER MENTIONS ──────────────────────────────────────────────────────────
// Converts stored @[Name](userId) markup into React elements with colored spans.
export function renderMentions(text) {
  if (!text) return null;
  const parts = [];
  const re = /@\[([^\]]+)\]\([^)]+\)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`t${i}`}>{text.slice(last, m.index)}</span>);
    parts.push(
      <strong key={`m${i}`} style={{ color: 'var(--p)', fontWeight: 700 }}>
        @{m[1]}
      </strong>
    );
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(<span key={`t${i}`}>{text.slice(last)}</span>);
  return parts.length > 0 ? parts : text;
}

// ── MENTION EDITOR ───────────────────────────────────────────────────────────
// Textarea that shows an autocomplete dropdown when @ is typed.
// Stores text as plain text with @[Name](userId) markup for mentions.
export function MentionEditor({ value = '', onChange, placeholder, rows = 4, disabled = false, teamMembers = [] }) {
  const [query, setQuery]     = useState(null);  // string after @ or null
  const [atStart, setAtStart] = useState(-1);    // index of the @ character
  const [ddIndex, setDdIndex] = useState(0);
  const textareaRef = useRef(null);
  const wrapperRef  = useRef(null);

  // Case-insensitive filter on full name (first + last); empty query shows all
  const filtered = query !== null
    ? teamMembers.filter(m => m.fullName.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];

  const showDd = query !== null && filtered.length > 0;

  // Close dropdown when clicking outside the entire component (wrapper + dropdown)
  useEffect(() => {
    if (!showDd) return;
    const h = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) {
        setQuery(null);
      }
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showDd]);

  const handleChange = e => {
    const text = e.target.value;
    onChange(text);
    detectMention(text, e.target.selectionStart);
  };

  const detectMention = (text, pos) => {
    const before = text.slice(0, pos);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) { setQuery(null); return; }
    const afterAt = before.slice(atIdx + 1);
    // Skip if this @ is already part of a completed @[Name](id) markup
    if (afterAt.startsWith('[')) { setQuery(null); return; }
    // Skip on newlines (but allow spaces so multi-word names like "Jan de Wit" work)
    if (afterAt.includes('\n')) { setQuery(null); return; }
    setAtStart(atIdx);
    setQuery(afterAt);
    setDdIndex(0);
  };

  const handleKeyDown = e => {
    if (!showDd) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setDdIndex(i => Math.min(i + 1, filtered.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setDdIndex(i => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); insertMention(filtered[ddIndex]); }
    else if (e.key === 'Escape') { setQuery(null); }
  };

  const insertMention = member => {
    const text = value || '';
    const cursorPos = textareaRef.current?.selectionStart ?? atStart + 1 + (query || '').length;
    const before = text.slice(0, atStart);
    const after  = text.slice(cursorPos);
    const markup = `@[${member.fullName}](${member.id})`;
    const newText = `${before}${markup} ${after}`;
    onChange(newText);
    setQuery(null);
    setTimeout(() => {
      if (!textareaRef.current) return;
      const p = before.length + markup.length + 1;
      textareaRef.current.setSelectionRange(p, p);
      textareaRef.current.focus();
    }, 0);
  };

  const AV_COLORS = ['#1DDB62','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <textarea
        ref={textareaRef}
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onSelect={e => { if (query !== null) detectMention(value, e.target.selectionStart); }}
        placeholder={placeholder || 'Notitie… Typ @ om iemand te taggen'}
        rows={rows}
        disabled={disabled}
        style={{ width: '100%', boxSizing: 'border-box', resize: 'vertical', fontSize: 13, lineHeight: 1.5 }}
      />
      {showDd && (
        <div style={{
          position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 400,
          background: 'white', border: '1px solid var(--border)',
          borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,.14)',
          minWidth: 220, maxHeight: 240, overflowY: 'auto',
        }}>
          <div style={{ padding: '6px 12px 4px', fontSize: 10, fontWeight: 700, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.06em', borderBottom: '1px solid var(--border)' }}>
            {query ? `Teamlid taggen — "${query}"` : 'Teamlid taggen'}
          </div>
          {filtered.map((m, i) => (
            <button
              key={m.id}
              type="button"
              onMouseDown={e => { e.preventDefault(); insertMention(m); }}
              style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 9,
                padding: '8px 12px',
                background: i === ddIndex ? 'var(--pll)' : 'none',
                border: 'none', textAlign: 'left', cursor: 'pointer',
                fontSize: 13, color: 'var(--dk)',
              }}
            >
              <div style={{
                width: 26, height: 26, borderRadius: '50%',
                background: AV_COLORS[i % AV_COLORS.length], color: 'white',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 10, fontWeight: 700, flexShrink: 0,
              }}>
                {m.fullName.slice(0, 2).toUpperCase()}
              </div>
              {m.fullName}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
