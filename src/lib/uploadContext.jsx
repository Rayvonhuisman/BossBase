import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { X, Check } from 'lucide-react';

// Globale, niet-blokkerende upload-manager. Een aanroeper start een upload met
// startUpload(label, run [, count]) waarbij `run` een async functie is die de
// daadwerkelijke upload + koppeling doet. De UI hoeft hier niet op te wachten;
// de status verschijnt in de globale UploadIndicator (boven in beeld).
//
//   const { startUpload } = useUploads();
//   startUpload('Bonnetje.jpg', async () => { ...upload + attach... });
//
// Bij een fout blijft de taak staan met status 'error' en een "Opnieuw"-knop
// die `run` opnieuw uitvoert.

const UploadContext = createContext({ startUpload: () => {} });
export const useUploads = () => useContext(UploadContext);

let _id = 0;
const nextId = () => `up_${Date.now()}_${_id++}`;

export function UploadProvider({ children }) {
  const [tasks, setTasks] = useState([]); // { id, label, count, status, error }
  const runs = useRef(new Map());         // id → run-functie (voor retry)
  const timers = useRef(new Map());

  const dismiss = useCallback(id => {
    setTasks(list => list.filter(t => t.id !== id));
    runs.current.delete(id);
    const h = timers.current.get(id);
    if (h) { clearTimeout(h); timers.current.delete(id); }
  }, []);

  const execute = useCallback((id, run) => {
    setTasks(list => list.map(t => (t.id === id ? { ...t, status: 'uploading', error: null } : t)));
    Promise.resolve()
      .then(run)
      .then(() => {
        setTasks(list => list.map(t => (t.id === id ? { ...t, status: 'done' } : t)));
        const h = setTimeout(() => dismiss(id), 2500);
        timers.current.set(id, h);
      })
      .catch(err => {
        setTasks(list => list.map(t => (t.id === id ? { ...t, status: 'error', error: err?.message || 'Upload mislukt' } : t)));
      });
  }, [dismiss]);

  const startUpload = useCallback((label, run, count = 1) => {
    const id = nextId();
    runs.current.set(id, run);
    setTasks(list => [...list, { id, label, count, status: 'uploading', error: null }]);
    execute(id, run);
    return id;
  }, [execute]);

  const retry = useCallback(id => {
    const run = runs.current.get(id);
    if (run) execute(id, run);
  }, [execute]);

  const api = useMemo(() => ({ startUpload }), [startUpload]);

  return (
    <UploadContext.Provider value={api}>
      {children}
      <UploadIndicator tasks={tasks} onRetry={retry} onDismiss={dismiss} />
    </UploadContext.Provider>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden
      style={{
        width: 14, height: 14, borderRadius: '50%',
        border: '2px solid rgba(0,0,0,.15)', borderTopColor: 'var(--p, #1DDB62)',
        display: 'inline-block', animation: 'bb-up-spin .7s linear infinite', flexShrink: 0,
      }}
    />
  );
}

function UploadIndicator({ tasks, onRetry, onDismiss }) {
  if (!tasks.length) return null;

  const uploading = tasks.filter(t => t.status === 'uploading');
  const errored   = tasks.filter(t => t.status === 'error');
  const done      = tasks.filter(t => t.status === 'done');
  const uploadingCount = uploading.reduce((s, t) => s + (t.count || 1), 0);

  let content;
  if (uploading.length > 0) {
    content = (
      <>
        <Spinner />
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {uploadingCount === 1 ? 'Bestand wordt geüpload…' : `${uploadingCount} bestanden worden geüpload…`}
        </span>
        {errored.length > 0 && (
          <span style={{ fontSize: 12, color: '#dc2626', fontWeight: 600 }}>· {errored.length} mislukt</span>
        )}
      </>
    );
  } else if (errored.length > 0) {
    content = (
      <>
        <span style={{ width: 14, height: 14, borderRadius: '50%', background: '#fee2e2', color: '#dc2626', fontSize: 11, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>!</span>
        <span style={{ fontWeight: 600, fontSize: 13, color: '#dc2626' }}>
          {errored.length === 1 ? 'Upload mislukt' : `${errored.length} uploads mislukt`}
        </span>
        <button
          type="button"
          onClick={() => errored.forEach(t => onRetry(t.id))}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--p, #1DDB62)', fontWeight: 700, fontSize: 13, padding: '0 2px' }}
        >
          Opnieuw proberen
        </button>
        <button
          type="button"
          onClick={() => errored.forEach(t => onDismiss(t.id))}
          aria-label="Sluiten"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#9ca3af', padding: '0 2px', lineHeight: 1, display: 'inline-flex', alignItems: 'center' }}
        >
          <X size={15} />
        </button>
      </>
    );
  } else if (done.length > 0) {
    content = (
      <>
        <span style={{ color: '#16a34a', flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}><Check size={15} strokeWidth={3} /></span>
        <span style={{ fontWeight: 600, fontSize: 13 }}>
          {done.length === 1 ? 'Bestand geüpload' : `${done.length} bestanden geüpload`}
        </span>
      </>
    );
  }

  return (
    <>
      <style>{'@keyframes bb-up-spin{to{transform:rotate(360deg)}}'}</style>
      <div
        aria-live="polite"
        style={{
          position: 'fixed', top: 14, left: '50%', transform: 'translateX(-50%)',
          zIndex: 4000, display: 'inline-flex', alignItems: 'center', gap: 9,
          background: '#fff', border: '1px solid var(--border, #e5e7eb)', borderRadius: 999,
          boxShadow: '0 6px 24px rgba(0,0,0,.14)', padding: '8px 16px', maxWidth: '92vw',
        }}
      >
        {content}
      </div>
    </>
  );
}
