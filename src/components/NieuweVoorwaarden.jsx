import { useEffect, useState } from 'react';
import { supabase, isDemo } from '../lib/supabase.js';
import { AKKOORD_VERSIES } from '../lib/akkoord.js';
import { logFout } from '../lib/stilleFouten.js';

// ── NIEUWE VERSIE VAN DE VOORWAARDEN ─────────────────────────────────────────
// Bij een nieuwe versie van de algemene voorwaarden laat de app een beheerder
// die nog op een oudere versie zit, de nieuwe accepteren bij het inloggen.
// Beheerders, omdat de overeenkomst met het bedrijf is; een medewerker sluit
// niets af.
//
// Accepteren gaat via akkoord-vastleggen, dat per document de huidige versie
// vastlegt met tijdstip en IP-adres (bron 'nieuwe_versie'). Het venster sluit
// pas na accepteren; uitloggen kan altijd.
export function NieuweVoorwaarden({ userId, isAdmin, onLogout }) {
  const [nodig, setNodig] = useState(false);
  const [bezig, setBezig] = useState(false);
  const [fout, setFout] = useState(null);

  useEffect(() => {
    if (isDemo || !userId || !isAdmin) return;
    let leeft = true;
    supabase.from('juridisch_akkoord').select('id')
      .eq('user_id', userId).eq('document', 'algemene_voorwaarden').eq('versie', AKKOORD_VERSIES.algemene_voorwaarden)
      .limit(1)
      .then(({ data, error }) => {
        if (error) { logFout('akkoord controleren')(error); return; }
        if (leeft) setNodig(!data?.length);
      });
    return () => { leeft = false; };
  }, [userId, isAdmin]);

  if (!nodig) return null;

  const accepteer = async () => {
    setBezig(true);
    setFout(null);
    const { data, error } = await supabase.functions.invoke('akkoord-vastleggen');
    setBezig(false);
    if (error || data?.success === false) { setFout('Vastleggen lukte niet. Probeer het zo nog eens.'); return; }
    setNodig(false);
  };

  return (
    <div className="overlay" role="dialog" aria-modal="true" aria-labelledby="nv-titel">
      <div className="modal" style={{ maxWidth: 520, width: '100%' }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title" id="nv-titel">We hebben onze voorwaarden aangepast</div>
            <div className="modal-sub">Versie {AKKOORD_VERSIES.algemene_voorwaarden}</div>
          </div>
        </div>
        <div style={{ fontSize: '.88rem', lineHeight: 1.6, color: 'var(--dm)' }}>
          <p style={{ marginTop: 0 }}>Wat er nieuw is:</p>
          <ul style={{ paddingLeft: 18, margin: '0 0 12px' }}>
            <li>
              <strong>Algemene voorwaarden, artikel 15:</strong> afspraken over de website bij een jaarabonnement.
              Het gaat om de aanmeldprijzen, hosting, domeinnaam en e-mail, de beoordelingsronde, meerwerk en wat er met de site gebeurt als je opzegt.
            </li>
            <li>
              <strong>Privacyverklaring:</strong> hoe we de gegevens en foto’s uit de intake van je website bewaren.
            </li>
          </ul>
          <p style={{ margin: 0 }}>
            Lees de <a href="/voorwaarden" target="_blank" rel="noreferrer" style={{ color: 'var(--pd)', fontWeight: 600 }}>algemene voorwaarden</a> en
            de <a href="/privacy" target="_blank" rel="noreferrer" style={{ color: 'var(--pd)', fontWeight: 600 }}>privacyverklaring</a>.
            Vragen? Mail info@bossbase.nl.
          </p>
          {fout && <p role="alert" style={{ color: '#b91c1c', marginBottom: 0 }}>{fout}</p>}
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onLogout} disabled={bezig}>Uitloggen</button>
          <button className="btn btn-p" onClick={accepteer} disabled={bezig}>{bezig ? 'Bezig…' : 'Akkoord'}</button>
        </div>
      </div>
    </div>
  );
}
