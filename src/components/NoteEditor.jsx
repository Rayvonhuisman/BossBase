import { useEffect, useRef, useState } from 'react';
import { Bold, Italic, Underline } from 'lucide-react';
import { normalizeToHtml, htmlToPlain } from '../lib/noteFormat.js';

// ── Gedeeld notitie-component ─────────────────────────────────────────────────
// Combineert de @-tagging van MentionEditor met de B/I/U-opmaak van
// MailBodyEditor in één contentEditable. Opslag = HTML met mention-spans.
//
//   <NoteEditor value={v} onChange={setV} mentions={true} teamMembers={tm} />
//
//   mentions={true}  → @-detectie + dropdown + tag-hint (interne notities)
//   mentions={false} → geen @-detectie, geen dropdown, geen tag-hint
//                      (mail body / klantgerichte velden)
// Beide varianten hebben dezelfde B/I/U-toolbar en dezelfde look.

// ── STYLE INJECTION (éénmalig) — alleen de mention-chip; de rest staat in CSS ──
let _stylesInjected = false;
function injectNoteStyles() {
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
  `;
  document.head.appendChild(el);
}

// ── READ-ONLY WEERGAVE ────────────────────────────────────────────────────────
// Geeft een opgeslagen notitie veilig weer (legacy markup én HTML).
export function renderNote(value) {
  injectNoteStyles();
  const html = normalizeToHtml(value);
  if (!html) return null;
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

const EMPTY_FORMATS = { bold: false, italic: false, underline: false };

export function NoteEditor({
  value = '',
  onChange,
  mentions = true,
  teamMembers = [],
  placeholder,
  disabled = false,
  minHeight = 90,
}) {
  injectNoteStyles();

  const editorRef = useRef(null);
  const wrapperRef = useRef(null);
  const lastValueRef = useRef(value);
  const isFocused = useRef(false);

  const [focused, setFocused] = useState(false);
  const [activeFormats, setActiveFormats] = useState(EMPTY_FORMATS);

  // @-dropdown state (alleen relevant bij mentions={true})
  const [query, setQuery] = useState(null);   // tekst na @ (null = dropdown dicht)
  const [atInfo, setAtInfo] = useState(null);  // { node, offset }
  const [ddIndex, setDdIndex] = useState(0);

  const filtered = (mentions && query !== null)
    ? teamMembers.filter(m => m.fullName.toLowerCase().includes(query.toLowerCase())).slice(0, 8)
    : [];
  const showDd = mentions && query !== null && filtered.length > 0;

  // ── Init DOM bij mount (legacy markup → spans, gesanitized)
  useEffect(() => {
    if (!editorRef.current) return;
    editorRef.current.innerHTML = normalizeToHtml(value);
    lastValueRef.current = value;
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Sync als value van buiten verandert (bv. na opslaan/reset)
  useEffect(() => {
    if (!editorRef.current) return;
    if (value === lastValueRef.current) return; // eigen input → niet overschrijven
    lastValueRef.current = value;
    editorRef.current.innerHTML = normalizeToHtml(value);
  }, [value]);

  // ── Sluit dropdown bij klik buiten
  useEffect(() => {
    if (!showDd) return;
    const h = e => {
      if (wrapperRef.current && !wrapperRef.current.contains(e.target)) setQuery(null);
    };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [showDd]);

  // ── Actieve opmaak-knoppen bijwerken
  const updateActiveState = () => {
    if (typeof document === 'undefined') return;
    setActiveFormats({
      bold: document.queryCommandState('bold'),
      italic: document.queryCommandState('italic'),
      underline: document.queryCommandState('underline'),
    });
  };
  useEffect(() => {
    const onSel = () => { if (isFocused.current) updateActiveState(); };
    document.addEventListener('selectionchange', onSel);
    return () => document.removeEventListener('selectionchange', onSel);
  }, []);

  // ── Emit huidige inhoud (leeg veld → lege string voor disabled-checks)
  const emit = () => {
    if (!editorRef.current) return;
    if (editorRef.current.innerHTML === '<br>') editorRef.current.innerHTML = '';
    const html = editorRef.current.innerHTML;
    const isEmpty = htmlToPlain(html) === '' && !editorRef.current.querySelector('.bb-mention');
    const out = isEmpty ? '' : html;
    lastValueRef.current = out;
    onChange?.(out);
  };

  // ── @-detectie op cursor-positie
  const detectMention = () => {
    if (!mentions) return;
    const sel = window.getSelection();
    if (!sel?.rangeCount) { setQuery(null); return; }
    const range = sel.getRangeAt(0);
    if (!range.collapsed) { setQuery(null); return; }
    const node = range.startContainer;
    if (node.nodeType !== 3) { setQuery(null); return; }
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

  // ── Mention invoegen op cursor-positie
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
    const afterNode = document.createTextNode(' ' + text.slice(cursorOffset));

    const parent = node.parentNode;
    parent.insertBefore(beforeNode, node);
    parent.insertBefore(span, node);
    parent.insertBefore(afterNode, node);
    parent.removeChild(node);

    try {
      const newRange = document.createRange();
      newRange.setStart(afterNode, 1);
      newRange.collapse(true);
      sel.removeAllRanges();
      sel.addRange(newRange);
    } catch (_) { /* ignore */ }

    setQuery(null);
    setAtInfo(null);
    emit();
  };

  // ── Input
  const handleInput = () => {
    emit();
    detectMention();
    updateActiveState();
  };

  // ── Plak als platte tekst (geen vreemde/onveilige HTML meenemen)
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

  // ── Toetsen: dropdown-navigatie heeft voorrang; anders native (Ctrl+B/I/U)
  const handleKeyDown = (e) => {
    if (!showDd) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setDdIndex(i => Math.min(i + 1, filtered.length - 1)); return; }
    if (e.key === 'ArrowUp') { e.preventDefault(); setDdIndex(i => Math.max(i - 1, 0)); return; }
    if (e.key === 'Enter') { e.preventDefault(); insertMention(filtered[ddIndex]); return; }
    if (e.key === 'Escape') { setQuery(null); return; }
    if (e.key === ' ') {
      const exact = filtered.find(m => m.fullName.toLowerCase() === query?.toLowerCase());
      if (exact || filtered.length > 0) { e.preventDefault(); insertMention(exact || filtered[0]); }
    }
  };

  // ── Opmaak-knop
  const exec = (cmd) => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, null);
    updateActiveState();
    emit();
  };

  const TOOLBAR = [
    { cmd: 'bold', icon: <Bold size={13} />, title: 'Vet (Ctrl+B)' },
    { cmd: 'italic', icon: <Italic size={13} />, title: 'Cursief (Ctrl+I)' },
    { cmd: 'underline', icon: <Underline size={13} />, title: 'Onderstrepen (Ctrl+U)' },
  ];

  const AV_COLORS = ['#1DDB62', '#3b82f6', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const ph = placeholder || (mentions ? 'Notitie… Typ @ om iemand te taggen' : 'Notitie…');
  const isEmpty = htmlToPlain(value) === '' && !/bb-mention/.test(value || '');

  return (
    <div ref={wrapperRef} style={{ position: 'relative' }}>
      <div style={{
        border: `1px solid ${focused ? '#1DDB62' : 'var(--border)'}`,
        borderRadius: 'var(--r8, 8px)', overflow: 'hidden', background: 'var(--bg, #fff)',
        transition: 'border-color .15s',
        opacity: disabled ? 0.6 : 1,
      }}>
        {/* Opmaak-toolbar */}
        <div style={{
          display: 'flex', gap: 1, padding: '4px 6px',
          borderBottom: '1px solid var(--border)', background: 'var(--bgs)',
          alignItems: 'center',
        }}>
          {TOOLBAR.map((item, i) => (
            <button
              key={i}
              type="button"
              title={item.title}
              disabled={disabled}
              className={`bb-tb-btn${activeFormats[item.cmd] ? ' active' : ''}`}
              onMouseDown={e => { e.preventDefault(); if (!disabled) exec(item.cmd); }}
            >
              {item.icon}
            </button>
          ))}
        </div>

        {/* Bewerkbaar veld */}
        <div style={{ position: 'relative' }}>
          {isEmpty && (
            <div style={{
              position: 'absolute', top: 10, left: 12,
              color: '#9ca3af', fontSize: '.85rem',
              pointerEvents: 'none', userSelect: 'none', lineHeight: 1.6,
            }}>
              {ph}
            </div>
          )}
          <div
            ref={editorRef}
            className="bb-notitie-editor"
            contentEditable={disabled ? 'false' : 'true'}
            suppressContentEditableWarning
            onInput={handleInput}
            onKeyDown={handleKeyDown}
            onKeyUp={() => { detectMention(); updateActiveState(); }}
            onClick={detectMention}
            onMouseUp={updateActiveState}
            onPaste={handlePaste}
            onFocus={() => { isFocused.current = true; setFocused(true); updateActiveState(); }}
            onBlur={() => { isFocused.current = false; setFocused(false); setActiveFormats(EMPTY_FORMATS); }}
            style={{
              minHeight, padding: '10px 12px',
              outline: 'none', fontSize: '.85rem', lineHeight: 1.6,
              color: 'var(--dk)', fontFamily: 'inherit',
              overflowY: 'auto',
            }}
          />
        </div>
      </div>

      {/* @-dropdown */}
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
