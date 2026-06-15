import { useEffect, useRef, useState } from 'react';

// ── STYLE INJECTION (éénmalig per app-load) ──────────────────────────────────
let _stylesInjected = false;
function injectStyles() {
  if (_stylesInjected || typeof document === 'undefined') return;
  _stylesInjected = true;
  const el = document.createElement('style');
  el.textContent = `
    .bb-mention {
      background: rgba(29,219,98,.15);
      color: #15803d;
      border-radius: 4px;
      padding: 0 3px;
      font-weight: 700;
      display: inline;
      cursor: default;
    }
    .bb-me-field {
      display: block;
      width: 100%;
      box-sizing: border-box;
      font-size: 13px;
      line-height: 1.5;
      font-family: inherit;
      word-break: break-word;
      white-space: pre-wrap;
      overflow-y: auto;
      outline: none;
      border: 1px solid var(--br, #d1d5db);
      border-radius: 8px;
      padding: 8px 10px;
      background: white;
      color: inherit;
      transition: border-color .15s, box-shadow .15s;
    }
    .bb-me-field:focus {
      border-color: var(--p, #1DDB62);
      box-shadow: 0 0 0 2px rgba(29,219,98,.15);
    }
    .bb-me-field[contenteditable="false"] {
      background: #f9fafb;
      color: #6b7280;
      cursor: default;
    }
    .bb-me-field:empty::before {
      content: attr(data-placeholder);
      color: #9ca3af;
      pointer-events: none;
      display: block;
    }
  `;
  document.head.appendChild(el);
}

// ── MARKUP ↔ HTML CONVERSIE ───────────────────────────────────────────────────

function esc(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// @[Naam](id) markup → HTML met gemarkeerde chips
function markupToHtml(text) {
  if (!text) return '';
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let html = '', last = 0, m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) {
      html += esc(text.slice(last, m.index)).replace(/\n/g, '<br>');
    }
    html += `<span class="bb-mention" data-id="${esc(m[2])}" data-name="${esc(m[1])}" contenteditable="false">@${esc(m[1])}</span>`;
    last = m.index + m[0].length;
  }
  if (last < text.length) html += esc(text.slice(last)).replace(/\n/g, '<br>');
  return html;
}

// contentEditable DOM → @[Naam](id) markup
function domToMarkup(el) {
  let s = '';
  let first = true;
  for (const node of el.childNodes) {
    if (node.nodeType === 3) { // TEXT_NODE
      s += node.textContent;
      first = false;
    } else if (node.nodeType === 1) { // ELEMENT_NODE
      if (node.classList.contains('bb-mention')) {
        s += `@[${node.dataset.name}](${node.dataset.id})`;
        first = false;
      } else if (node.tagName === 'BR') {
        s += '\n';
        first = false;
      } else if (node.tagName === 'DIV' || node.tagName === 'P') {
        if (!first) s += '\n'; // geen leading newline bij het eerste blok
        s += domToMarkup(node);
        first = false;
      } else {
        s += domToMarkup(node);
      }
    }
  }
  return s;
}

// ── RENDER MENTIONS (voor weergave van opgeslagen notities) ───────────────────
export function renderMentions(text) {
  injectStyles();
  if (!text) return null;
  const parts = [];
  const re = /@\[([^\]]+)\]\([^)]+\)/g;
  let last = 0, m, i = 0;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(<span key={`t${i}`}>{text.slice(last, m.index)}</span>);
    parts.push(<span key={`m${i}`} className="bb-mention">@{m[1]}</span>);
    last = m.index + m[0].length;
    i++;
  }
  if (last < text.length) parts.push(<span key={`t${i}`}>{text.slice(last)}</span>);
  return parts.length > 0 ? parts : text;
}

// ── MENTION EDITOR ────────────────────────────────────────────────────────────
export function MentionEditor({ value = '', onChange, placeholder, rows = 4, disabled = false, teamMembers = [] }) {
  injectStyles();

  const editorRef  = useRef(null);
  const wrapperRef = useRef(null);
  const lastValRef = useRef(value); // bijhouden welke waarde we zelf zetten

  const [query,   setQuery]   = useState(null);  // tekst na @ (null = geen dropdown)
  const [atInfo,  setAtInfo]  = useState(null);  // { node, offset } positie van de @
  const [ddIndex, setDdIndex] = useState(0);

  const filtered = query !== null
    ? teamMembers.filter(m => m.fullName.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];
  const showDd = query !== null && filtered.length > 0;

  // ── Initialiseer DOM bij mount
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = markupToHtml(value);
    lastValRef.current = value;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Synchroniseer DOM als value van buiten verandert (bv. na opslaan)
  useEffect(() => {
    if (!editorRef.current) return;
    if (value === lastValRef.current) return; // eigen input, niet overschrijven
    lastValRef.current = value;
    editorRef.current.innerHTML = markupToHtml(value);
  }, [value]);

  // ── Sluit dropdown bij klik buiten de wrapper
  useEffect(() => {
    if (!showDd) return;
    const h = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setQuery(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showDd]);

  // ── Detecteer cursor-positie en update de @ dropdown
  const detectMention = () => {
    const sel = window.getSelection();
    if (!sel?.rangeCount) { setQuery(null); return; }
    const range = sel.getRangeAt(0);
    if (!range.collapsed) { setQuery(null); return; }
    const node = range.startContainer;
    if (node.nodeType !== 3) { setQuery(null); return; } // alleen TEXT_NODE
    if (node.parentElement?.classList?.contains('bb-mention')) { setQuery(null); return; }
    const before = node.textContent.slice(0, range.startOffset);
    const atIdx = before.lastIndexOf('@');
    if (atIdx === -1) { setQuery(null); return; }
    const afterAt = before.slice(atIdx + 1);
    if (afterAt.includes('\n')) { setQuery(null); return; }
    setAtInfo({ node, offset: atIdx });
    setQuery(afterAt);
    setDdIndex(0);
  };

  // ── Voeg mention in op cursor-positie
  const insertMention = (member) => {
    if (!atInfo || !editorRef.current) return;
    const { node, offset } = atInfo;

    const sel = window.getSelection();
    const cursorOffset = sel?.rangeCount
      ? sel.getRangeAt(0).startOffset
      : offset + 1 + (query?.length ?? 0);

    const text = node.textContent;

    const span = document.createElement('span');
    span.className = 'bb-mention';
    span.dataset.id = member.id;
    span.dataset.name = member.fullName;
    span.setAttribute('contenteditable', 'false');
    span.textContent = `@${member.fullName}`;

    const beforeNode = document.createTextNode(text.slice(0, offset));
    const afterNode  = document.createTextNode(' ' + text.slice(cursorOffset));

    const parent = node.parentNode;
    parent.insertBefore(beforeNode, node);
    parent.insertBefore(span, node);
    parent.insertBefore(afterNode, node);
    parent.removeChild(node);

    // Zet cursor na de spatie achter de chip
    try {
      const newRange = document.createRange();
      newRange.setStart(afterNode, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } catch (_) {}

    setQuery(null);
    setAtInfo(null);

    const markup = domToMarkup(editorRef.current);
    lastValRef.current = markup;
    onChange(markup);
  };

  // ── Input handler
  const handleInput = () => {
    if (!editorRef.current) return;
    // Browser plaatst soms een losse <br> als enige inhoud → verwijder
    if (editorRef.current.innerHTML === '<br>') editorRef.current.innerHTML = '';
    const markup = domToMarkup(editorRef.current);
    lastValRef.current = markup;
    onChange(markup);
    detectMention();
  };

  // ── Plak als plain text (geen HTML-opmaak meenemen)
  const handlePaste = (e) => {
    e.preventDefault();
    const text = e.clipboardData.getData('text/plain');
    const sel = window.getSelection();
    if (!sel?.rangeCount) return;
    const range = sel.getRangeAt(0);
    range.deleteContents();
    const tn = document.createTextNode(text);
    range.insertNode(tn);
    range.setStartAfter(tn);
    range.collapse(true);
    sel.removeAllRanges();
    sel.addRange(range);
    handleInput();
  };

  // ── Keyboard navigatie dropdown + auto-insert bij spatie
  const handleKeyDown = (e) => {
    if (!showDd) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setDdIndex(i => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp')   { e.preventDefault(); setDdIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter')     { e.preventDefault(); insertMention(filtered[ddIndex]); return; }
    if (e.key === 'Escape')    { setQuery(null); return; }
    if (e.key === ' ') {
      // Auto-insert: exacte match heeft voorkeur, anders de bovenste optie
      const exact = filtered.find(m => m.fullName.toLowerCase() === query?.toLowerCase());
      if (exact || filtered.length > 0) { e.preventDefault(); insertMention(exact || filtered[0]); }
    }
  };

  const AV_COLORS = ['#1DDB62','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4'];

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div
        ref={editorRef}
        className="bb-me-field"
        contentEditable={disabled ? 'false' : 'true'}
        suppressContentEditableWarning
        data-placeholder={placeholder || 'Notitie… Typ @ om iemand te taggen'}
        onInput={handleInput}
        onKeyDown={handleKeyDown}
        onKeyUp={detectMention}
        onClick={detectMention}
        onSelect={detectMention}
        onPaste={handlePaste}
        style={{ minHeight: `calc(${rows} * 1.5em + 18px)` }}
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
