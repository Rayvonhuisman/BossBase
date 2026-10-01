import { useState } from 'react';
import { Logo } from '../bb-shared.jsx';

// Afmelden voor de proefperiodemails, via de link onderaan elke mail. Eerst een
// klik ter bevestiging: linkscanners van mailprogramma's openen elke link, en
// zouden anders iedereen afmelden. De link is ondertekend; de edge function
// trial-mails-afmelden controleert dat.
export function AfmeldenPage() {
  const params = new URLSearchParams(window.location.search);
  const c = params.get('c') || '';
  const s = params.get('s') || '';
  const [status, setStatus] = useState(c && s ? 'vraag' : 'fout');
  const [fout, setFout] = useState(c && s ? '' : 'Deze afmeldlink is niet compleet. Gebruik de link uit de mail.');

  const afmelden = async () => {
    setStatus('bezig');
    try {
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/trial-mails-afmelden`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', apikey: import.meta.env.VITE_SUPABASE_ANON_KEY },
        body: JSON.stringify({ c, s }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok && data.success) setStatus('klaar');
      else { setFout(data.error || 'Afmelden is niet gelukt.'); setStatus('fout'); }
    } catch {
      setFout('Afmelden is niet gelukt. Probeer het later opnieuw of mail ons op info@bossbase.nl.');
      setStatus('fout');
    }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card afu" style={{ textAlign: 'center' }}>
        <div className="auth-logo"><Logo /></div>
        <div className="auth-title" style={{ marginTop: 8 }}>
          {status === 'klaar' ? 'Je bent afgemeld' : 'Afmelden'}
        </div>
        <div className="auth-sub" style={{ marginTop: 6 }}>
          {status === 'klaar' && 'Je krijgt geen mails meer over je proefperiode. Je account werkt gewoon door.'}
          {(status === 'vraag' || status === 'bezig') && 'Wil je geen mails meer krijgen over je proefperiode?'}
          {status === 'fout' && fout}
        </div>
        {(status === 'vraag' || status === 'bezig') && (
          <button className="auth-submit" style={{ marginTop: 20 }} onClick={afmelden} disabled={status === 'bezig'}>
            {status === 'bezig' ? 'Bezig...' : 'Afmelden'}
          </button>
        )}
      </div>
    </div>
  );
}
