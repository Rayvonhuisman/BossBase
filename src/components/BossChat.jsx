import { useEffect, useRef, useState } from 'react';
import { ModalX } from '../bb-shared.jsx';
import { supabase } from '../lib/supabase.js';

// ── BOSS ──────────────────────────────────────────────────────────────────────
// Het chatvenster van de helpagent. Een drawer, net als de klantkaart en het
// deal-paneel, zodat het aanvoelt als de rest van het portaal.
//
// De gespreksgeschiedenis staat BEWUST niet in dit component maar in App: sluit
// je het venster, dan mag je gesprek niet weg zijn. Geen localStorage of
// sessionStorage — het gesprek leeft zolang je ingelogd bent en verder niet.
//
// Antwoorden komen als stroom binnen (server-sent events). Vier soorten:
//   gesprek  het id van dit gesprek, zodat een vervolgvraag eraan vast blijft
//   tekst    een stukje antwoord; die plakken we aan het lopende bericht
//   bezig    Boss zet de vraag door naar het team
//   fout     er ging iets mis; dan tonen we dat en geen stilstaande cursor

export const BOSS_BEGROETING =
  'Hoi! Ik ben Boss. Vraag me hoe iets in BossBase werkt — waar je iets vindt, ' +
  'hoe je iets aanmaakt of instelt. Waar loop je tegenaan?';

const AVATAR = '/boss-avatar.png';

// Boss schrijft in markdown: **vet**, opsommingen en genummerde stappen. Dat is
// hem ook zo gevraagd, want het maakt een stappenplan leesbaar. Zonder opmaak
// ziet de gebruiker letterlijk `**Instellingen**` staan.
//
// Bewust géén markdown-bibliotheek: dit is een handvol patronen en een extra
// afhankelijkheid van 40 kB voor vetgedrukte tekst is niet in verhouding. We
// zetten zelf om, en escapen eerst alles zodat er via het antwoord geen HTML in
// de pagina kan belanden.
function opmaak(tekst) {
  const esc = String(tekst)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

  return esc
    .replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>')
    // Losse * voor cursief laten we met rust: sterretjes komen ook in gewone
    // tekst voor, en een half gesloten paar zou de rest van de zin verminken.
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    // Opsommingsteken aan het begin van een regel wordt een echt bolletje.
    .replace(/^[-*]\s+/gm, '· ')
}

function Bericht({ rol, tekst, bezig }) {
  const vanBoss = rol === 'boss';
  return (
    <div style={{
      display: 'flex', gap: 10, marginBottom: 14,
      flexDirection: vanBoss ? 'row' : 'row-reverse',
    }}>
      {/* Geen ronde uitsnede: de avatar is een staande figuur op een witte
          achtergrond, en rond bijsnijden toont vooral het bovenlijf in een witte
          cirkel. Contain laat het hele mannetje zien. */}
      {vanBoss && (
        <img src={AVATAR} alt="" height={30}
          style={{ width: 'auto', maxWidth: 26, flexShrink: 0, objectFit: 'contain', marginTop: 2 }} />
      )}
      <div style={{
        maxWidth: '78%',
        background: vanBoss ? 'var(--bgs)' : 'var(--p)',
        color: vanBoss ? 'var(--dk)' : '#fff',
        borderRadius: 14,
        borderTopLeftRadius: vanBoss ? 4 : 14,
        borderTopRightRadius: vanBoss ? 14 : 4,
        padding: '10px 13px',
        fontSize: 14, lineHeight: 1.55,
        whiteSpace: 'pre-wrap', wordBreak: 'break-word',
      }}>
        {vanBoss
          ? <span dangerouslySetInnerHTML={{ __html: opmaak(tekst) }} />
          : tekst}
        {/* Knipperende cursor zolang er nog tekst binnenkomt. */}
        {bezig && <span className="boss-cursor" />}
      </div>
    </div>
  );
}

export function BossChat({ open, onClose, berichten, setBerichten, gesprekId, setGesprekId }) {
  const [invoer, setInvoer] = useState('');
  const [bezig, setBezig] = useState(false);
  const [status, setStatus] = useState(null);   // 'doorzetten' | null
  const [fout, setFout] = useState(null);
  const lijstRef = useRef(null);
  const veldRef = useRef(null);

  // Meescrollen terwijl het antwoord binnenkomt.
  useEffect(() => {
    if (lijstRef.current) lijstRef.current.scrollTop = lijstRef.current.scrollHeight;
  }, [berichten, status]);

  useEffect(() => {
    if (open) setTimeout(() => veldRef.current?.focus(), 120);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const esc = e => { if (e.key === 'Escape' && !bezig) onClose(); };
    document.addEventListener('keydown', esc);
    return () => document.removeEventListener('keydown', esc);
  }, [open, bezig, onClose]);

  const verstuur = async () => {
    const vraag = invoer.trim();
    if (!vraag || bezig) return;

    setInvoer('');
    setFout(null);
    setBezig(true);

    // De vraag meteen tonen, plus een leeg antwoord waar de stroom in loopt.
    const metVraag = [...berichten, { rol: 'gebruiker', tekst: vraag }];
    setBerichten([...metVraag, { rol: 'boss', tekst: '' }]);

    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Je sessie is verlopen. Log opnieuw in.');

      // De begroeting is een vast tekstje van de frontend en hoort niet bij het
      // gesprek; hem meesturen zou Boss laten denken dat hij dat zelf heeft
      // gezegd. Alles wat de gebruiker en Boss echt hebben uitgewisseld gaat wel
      // mee, zodat een vervolgvraag in context staat.
      const historie = metVraag.filter(m => !m.begroeting);

      const res = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/boss-chat`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({
            messages: historie.map(m => ({ rol: m.rol, tekst: m.tekst })),
            ...(gesprekId ? { conversation_id: gesprekId } : {}),
          }),
        },
      );

      // Een geweigerd verzoek komt als gewone JSON terug, niet als stroom.
      if (!res.ok || !res.body) {
        let melding = 'Boss is even niet bereikbaar. Probeer het zo nog eens.';
        try {
          const j = await res.json();
          if (j?.error) melding = j.error;
        } catch { /* geen JSON: standaardmelding */ }
        throw new Error(melding);
      }

      const lezer = res.body.getReader();
      const dec = new TextDecoder();
      let rest = '';
      let soort = null;
      let antwoord = '';

      while (true) {
        const { done, value } = await lezer.read();
        if (done) break;

        rest += dec.decode(value, { stream: true });
        const regels = rest.split('\n');
        rest = regels.pop() ?? '';

        for (const regel of regels) {
          if (regel.startsWith('event: ')) { soort = regel.slice(7).trim(); continue; }
          if (!regel.startsWith('data: ')) continue;

          let d;
          try { d = JSON.parse(regel.slice(6)); } catch { continue; }

          if (soort === 'gesprek' && d.id) {
            setGesprekId(d.id);
          } else if (soort === 'tekst' && d.tekst) {
            antwoord += d.tekst;
            setStatus(null);
            setBerichten([...metVraag, { rol: 'boss', tekst: antwoord }]);
          } else if (soort === 'bezig') {
            setStatus('doorzetten');
          } else if (soort === 'fout') {
            setFout(d.bericht || 'Er ging iets mis.');
          }
        }
      }

      // Niets teruggekregen: laat geen leeg blokje staan.
      if (!antwoord) {
        setBerichten(metVraag);
        setFout(f => f || 'Boss gaf geen antwoord. Probeer het zo nog eens.');
      }
    } catch (e) {
      setBerichten(metVraag);
      setFout(e.message || 'Er ging iets mis.');
    } finally {
      setBezig(false);
      setStatus(null);
      setTimeout(() => veldRef.current?.focus(), 60);
    }
  };

  if (!open) return null;

  return (
    <>
      <div className="drawer-overlay" onClick={() => !bezig && onClose()} />
      <div className="drawer boss-drawer" role="dialog" aria-modal="true" aria-label="Boss — help">

        {/* Kop */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 11,
          padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0,
        }}>
          <img src={AVATAR} alt="" height={38}
            style={{ width: 'auto', maxWidth: 32, objectFit: 'contain', flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>Boss</div>
            <div style={{ fontSize: '.78rem', color: 'var(--dmu)' }}>Helpt je met BossBase</div>
          </div>
          <div style={{ marginLeft: 'auto' }}><ModalX onClose={onClose} /></div>
        </div>

        {/* Gesprek */}
        <div ref={lijstRef} style={{ flex: 1, overflowY: 'auto', padding: '18px 20px', minHeight: 0 }}>
          {berichten.map((m, i) => (
            <Bericht
              key={i}
              rol={m.rol}
              tekst={m.tekst}
              bezig={bezig && i === berichten.length - 1 && m.rol === 'boss' && !m.tekst}
            />
          ))}

          {status === 'doorzetten' && (
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              fontSize: '.84rem', color: 'var(--dmu)', margin: '0 0 14px 38px',
            }}>
              <span className="boss-punt" /> Boss zet je vraag door…
            </div>
          )}

          {fout && (
            <div style={{
              background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 10,
              padding: '10px 12px', fontSize: 13, color: '#b91c1c', margin: '0 0 14px',
            }}>
              {fout}
            </div>
          )}
        </div>

        {/* Invoer */}
        <div style={{ borderTop: '1px solid var(--border)', padding: '12px 16px', flexShrink: 0 }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-end' }}>
            <textarea
              ref={veldRef}
              value={invoer}
              onChange={e => setInvoer(e.target.value)}
              onKeyDown={e => {
                // Enter verstuurt, Shift+Enter maakt een nieuwe regel.
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); verstuur(); }
              }}
              placeholder="Stel je vraag…"
              rows={1}
              disabled={bezig}
              style={{
                flex: 1, resize: 'none', maxHeight: 120, minHeight: 40,
                padding: '10px 12px', fontSize: 14, lineHeight: 1.45,
                borderRadius: 10, border: '1px solid var(--bstrong)',
                fontFamily: 'inherit',
              }}
            />
            <button
              className="btn btn-p"
              onClick={verstuur}
              disabled={bezig || !invoer.trim()}
              style={{ flexShrink: 0, height: 40 }}
            >
              {bezig ? '…' : 'Stuur'}
            </button>
          </div>
          <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginTop: 6 }}>
            Enter verstuurt · Shift+Enter maakt een nieuwe regel
          </div>
        </div>
      </div>
    </>
  );
}

export default BossChat;
