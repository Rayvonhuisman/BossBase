import { useRef, useState } from 'react';
import { useToast } from '../lib/toast.jsx';

// Sleepvak voor een factuur of bon bij een kostenpost. Eén component, zodat de
// kostenmodal en de kostentab van een project er hetzelfde uitzien en dezelfde
// grens voor bestandsgrootte hanteren.
const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function BijlageDropzone({ files, onChange, label = 'Factuur of bon', verplicht = false, error = '', compact = false }) {
  const toast = useToast();
  const inputRef = useRef(null);
  const [dragOver, setDragOver] = useState(false);

  const addFiles = nieuw => {
    const ok = [];
    for (const f of nieuw) {
      if (f.size > MAX_FILE_SIZE) { toast.error(`${f.name}: bestand is te groot. Maximum is 10MB.`); continue; }
      ok.push(f);
    }
    if (ok.length) onChange([...files, ...ok]);
  };
  const removeFile = idx => onChange(files.filter((_, i) => i !== idx));

  return (
    <div>
      <label style={{ fontSize: '.8rem', fontWeight: 600, color: 'var(--dk)', marginBottom: 6, display: 'block' }}>
        {label}{verplicht ? ' *' : ''}
      </label>
      <div
        role="button"
        tabIndex={0}
        style={{
          border: `2px dashed ${error ? 'var(--rd)' : dragOver ? 'var(--p)' : 'var(--border)'}`,
          borderRadius: 'var(--r8)',
          padding: compact ? '12px 14px' : '18px 16px',
          textAlign: 'center',
          cursor: 'pointer',
          background: dragOver ? 'var(--bgs)' : 'transparent',
          transition: 'border-color .15s, background .15s',
        }}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click(); } }}
        onDragOver={e => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={e => { e.preventDefault(); setDragOver(false); addFiles(Array.from(e.dataTransfer.files)); }}
      >
        <div style={{ color: 'var(--dl)', marginBottom: 6, display: 'flex', justifyContent: 'center' }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
            <polyline points="17 8 12 3 7 8"/>
            <line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
        </div>
        <div style={{ fontSize: '.82rem', color: 'var(--dk)', fontWeight: 500 }}>Sleep bestand hierheen of klik om te uploaden</div>
        <div style={{ fontSize: '.74rem', color: 'var(--dl)', marginTop: 3 }}>JPG, PNG of PDF · Max 10MB per bestand</div>
      </div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,application/pdf"
        multiple
        style={{ display: 'none' }}
        onChange={e => { addFiles(Array.from(e.target.files)); e.target.value = ''; }}
      />
      {error && (
        <div style={{ fontSize: '.76rem', lineHeight: 1.4, color: 'var(--rd)', marginTop: 6 }}>{error}</div>
      )}
      {files.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 20, padding: '3px 8px 3px 10px', fontSize: '.76rem' }}>
              <span style={{ maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
              <button type="button" aria-label={`${f.name} verwijderen`} onClick={() => removeFile(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, lineHeight: 1, color: 'var(--dl)', fontSize: '1.1rem', display: 'flex', alignItems: 'center' }}>×</button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
