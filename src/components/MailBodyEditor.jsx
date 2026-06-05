import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Bold, Italic, Underline } from 'lucide-react';

const EMPTY_FORMATS = { bold: false, italic: false, underline: false };

// Convert plain text (with \n line breaks) to HTML for the editor.
// Uses <div> per line to match Chrome's native contentEditable format.
// If the string already contains HTML tags, it is returned as-is.
export function plainToEditorHtml(text) {
  if (!text) return '';
  if (/<[a-zA-Z]/.test(text)) return text;
  return text
    .split('\n')
    .map(line => {
      const escaped = line
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;');
      return `<div>${escaped || '<br>'}</div>`;
    })
    .join('');
}

export const MailBodyEditor = forwardRef(function MailBodyEditor(
  { value, onChange, placeholder, minHeight = 180 },
  ref
) {
  const editorRef = useRef(null);
  const [focused, setFocused] = useState(false);
  const [activeFormats, setActiveFormats] = useState(EMPTY_FORMATS);
  const isFocused = useRef(false);
  const lastValueRef = useRef(null);

  // Sync value prop → innerHTML; skip when the change came from inside the editor
  useEffect(() => {
    if (!editorRef.current) return;
    if (value === lastValueRef.current) return;
    lastValueRef.current = value;
    editorRef.current.innerHTML = value || '';
  }, [value]);

  const updateActiveState = () => {
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

  const exec = cmd => {
    editorRef.current?.focus();
    document.execCommand(cmd, false, null);
    updateActiveState();
    const html = editorRef.current?.innerHTML || '';
    lastValueRef.current = html;
    onChange?.(html);
  };

  const handleInput = () => {
    const html = editorRef.current?.innerHTML || '';
    lastValueRef.current = html;
    onChange?.(html);
    updateActiveState();
  };

  useImperativeHandle(ref, () => ({
    insertAtCursor(text) {
      const editor = editorRef.current;
      if (!editor) return;
      editor.focus();
      const sel = window.getSelection();
      if (sel?.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        range.deleteContents();
        const node = document.createTextNode(text);
        range.insertNode(node);
        range.setStartAfter(node);
        range.setEndAfter(node);
        sel.removeAllRanges();
        sel.addRange(range);
      } else {
        editor.innerHTML = (editor.innerHTML || '') + text;
      }
      const html = editor.innerHTML || '';
      lastValueRef.current = html;
      onChange?.(html);
    },
  }), [onChange]);

  const isEmpty = !value || value.replace(/<[^>]*>/g, '').trim() === '';

  const TOOLBAR = [
    { cmd: 'bold', icon: <Bold size={13} />, title: 'Vet (Ctrl+B)' },
    { cmd: 'italic', icon: <Italic size={13} />, title: 'Cursief (Ctrl+I)' },
    { cmd: 'underline', icon: <Underline size={13} />, title: 'Onderstrepen (Ctrl+U)' },
  ];

  return (
    <div style={{
      border: `1px solid ${focused ? '#1DDB62' : 'var(--border)'}`,
      borderRadius: 'var(--r8)', overflow: 'hidden', background: 'var(--bg)',
      transition: 'border-color .15s',
    }}>
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
            className={`bb-tb-btn${activeFormats[item.cmd] ? ' active' : ''}`}
            onMouseDown={e => { e.preventDefault(); exec(item.cmd); }}
          >
            {item.icon}
          </button>
        ))}
      </div>
      <div style={{ position: 'relative' }}>
        {isEmpty && placeholder && (
          <div style={{
            position: 'absolute', top: 10, left: 12,
            color: '#9ca3af', fontSize: '.85rem',
            pointerEvents: 'none', userSelect: 'none', lineHeight: 1.6,
          }}>
            {placeholder}
          </div>
        )}
        <div
          ref={editorRef}
          contentEditable
          suppressContentEditableWarning
          className="bb-notitie-editor"
          onInput={handleInput}
          onKeyUp={updateActiveState}
          onMouseUp={updateActiveState}
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
  );
});
