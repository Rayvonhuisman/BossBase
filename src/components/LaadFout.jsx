import { useEffect, useState } from 'react';

// Eén manier om te laten zien dat laden mislukt is, overal in de app. Vroeger
// bleef een pagina bij een netwerkfout eeuwig op "Laden…" staan, toonde hij
// een kale Engelse foutmelding ("TypeError: Failed to fetch"), of bleef het
// scherm na het inloggen helemaal wit. Audit 2026-10-01, M23.

/** Een fout uit fetch/Supabase in begrijpelijk Nederlands. */
export function laadFoutTekst(fout) {
  const t = String(fout?.message || fout || '').toLowerCase();
  if (!t) return 'Er ging iets mis bij het laden.';
  if (t.includes('failed to fetch') || t.includes('networkerror') || t.includes('network request failed') || t.includes('load failed')) {
    return 'Geen verbinding met BossBase. Controleer je internetverbinding en probeer het opnieuw.';
  }
  if (t.includes('timeout') || t.includes('statement timeout') || t.includes('canceling statement')) {
    return 'Het laden duurde te lang. Probeer het opnieuw.';
  }
  if (t.includes('jwt') || t.includes('session') || t.includes('niet ingelogd')) {
    return 'Je sessie is verlopen. Log opnieuw in.';
  }
  return 'Er ging iets mis bij het laden. Probeer het opnieuw.';
}

/** Kaart met foutmelding en "Opnieuw proberen", voor binnen een pagina. */
export function LaadFout({ fout, onOpnieuw, titel = 'Laden is niet gelukt' }) {
  return (
    <div className="card card-p" role="alert" style={{ margin: '24px auto', maxWidth: 560, textAlign: 'center' }}>
      <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>{titel}</div>
      <div style={{ fontSize: '.88rem', color: 'var(--dm)', marginBottom: 14 }}>{laadFoutTekst(fout)}</div>
      {onOpnieuw && (
        <button type="button" className="btn btn-p btn-sm" onClick={onOpnieuw}>Opnieuw proberen</button>
      )}
    </div>
  );
}

/**
 * Volledig scherm tijdens het opstarten (profiel en rechten laden). Eerst een
 * spinner; na `naMs` milliseconden een melding met "Opnieuw proberen", want een
 * wit scherm zonder uitleg leest als een kapotte app.
 */
export function LaadScherm({ fout, onOpnieuw, naMs = 10000 }) {
  const [lang, setLang] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setLang(true), naMs);
    return () => clearTimeout(t);
  }, [naMs]);

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: 16 }}>
      {fout || lang ? (
        <div className="card card-p" role="alert" style={{ maxWidth: 460, textAlign: 'center' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 6 }}>
            {fout ? 'BossBase kon je gegevens niet laden' : 'Dit duurt langer dan normaal'}
          </div>
          <div style={{ fontSize: '.88rem', color: 'var(--dm)', marginBottom: 14 }}>
            {fout ? laadFoutTekst(fout) : 'We wachten nog op de server. Je kunt het opnieuw proberen.'}
          </div>
          {onOpnieuw && <button type="button" className="btn btn-p btn-sm" onClick={onOpnieuw}>Opnieuw proberen</button>}
        </div>
      ) : (
        <div aria-label="Laden" role="status" style={{
          width: 28, height: 28, borderRadius: '50%', border: '3px solid var(--border)',
          borderTopColor: 'var(--p)', animation: 'bbLaadDraai .8s linear infinite',
        }}>
          <style>{'@keyframes bbLaadDraai{to{transform:rotate(360deg)}}'}</style>
        </div>
      )}
    </div>
  );
}
