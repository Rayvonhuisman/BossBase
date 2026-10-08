import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../../lib/supabase.js';

// Alles in de superadmin loopt via de edge function `superadmin`: die
// controleert of je superbeheerder bent en schrijft het logboek.
export async function roep(actie, extra = {}) {
  const { data, error } = await supabase.functions.invoke('superadmin', { body: { actie, ...extra } });
  if (error) {
    let bericht = error.message;
    let code = null;
    try {
      const j = await error.context?.json();
      bericht = j?.error || bericht;
      code = j?.code || null;
    } catch { /* geen json */ }
    const fout = new Error(bericht);
    fout.code = code;
    throw fout;
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

// Gegevens voor een pagina laden, met opnieuw laden na een handeling.
export function useLaad(actie, extra = null) {
  const sleutel = JSON.stringify(extra ?? {});
  const [data, setData] = useState(null);
  const [laden, setLaden] = useState(true);
  const [fout, setFout] = useState('');
  const laad = useCallback(async (stil = false) => {
    if (!stil) setLaden(true);
    setFout('');
    try {
      setData(await roep(actie, JSON.parse(sleutel)));
    } catch (e) {
      setFout(e.message || 'Laden mislukt');
    } finally {
      setLaden(false);
    }
  }, [actie, sleutel]);
  useEffect(() => { laad(); }, [laad]);
  return { data, laden, fout, herlaad: () => laad(true) };
}
