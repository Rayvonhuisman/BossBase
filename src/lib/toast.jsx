import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';

const ToastContext = createContext({ push: () => {} });

let counter = 0;
const nextId = () => `t_${Date.now()}_${counter++}`;

export function ToastProvider({ children }) {
  const [items, setItems] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback(id => {
    setItems(list => list.filter(i => i.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const push = useCallback((messageOrOptions, maybeType) => {
    const opts = typeof messageOrOptions === 'string'
      ? { message: messageOrOptions, type: maybeType || 'success' }
      : { type: 'success', ...messageOrOptions };
    const id = nextId();
    const ttl = opts.duration ?? (opts.type === 'error' ? 5200 : 3200);
    setItems(list => [...list, { id, ...opts }]);
    const handle = setTimeout(() => dismiss(id), ttl);
    timers.current.set(id, handle);
    return id;
  }, [dismiss]);

  const api = useMemo(() => ({
    push,
    dismiss,
    success: (m, opts) => push({ ...(opts || {}), message: m, type: 'success' }),
    error:   (m, opts) => push({ ...(opts || {}), message: m, type: 'error' }),
    info:    (m, opts) => push({ ...(opts || {}), message: m, type: 'info' }),
  }), [push, dismiss]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="bb-toast-stack" aria-live="polite">
        {items.map(t => (
          <div key={t.id} className={`bb-toast bb-toast-${t.type}`} onClick={() => dismiss(t.id)}>
            <span className="bb-toast-dot" />
            <span className="bb-toast-msg">{t.message}</span>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
