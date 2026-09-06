// Publieke ondertekenpagina voor een werkbon: /werkbon/<sign_token>.
//
// Draait zonder sessie. Alle gegevens komen uit de SECURITY DEFINER-functies op
// het sign_token; die geven precies de velden terug die de klant mag zien. Wat
// hier niet staat, kán deze pagina niet opvragen: geen bedragen, geen
// inkoopprijzen, geen interne notities.
//
// Bewust dezelfde opzet als OfferteSigneren, zodat een klant die eerder een
// offerte tekende hetzelfde scherm herkent.

import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import HandtekeningCanvas from '../components/HandtekeningCanvas.jsx'
import { getWerkbonPdfUrl, getWerkbonPdfBase64 } from '../utils/generateWerkbonPdf.js'
import { signWerkbon, getFotosViaToken } from '../services/werkbonOndertekenenService.js'

const fmtDatum = d => {
  if (!d) return ''
  return new Date(d).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}
const uurFmt = n => `${Number(n || 0).toFixed(2).replace('.', ',')} u`
const tijd = t => (t ? String(t).slice(0, 5) : null)

// De RPC's leveren snake_case; de PDF-bouwer verwacht camelCase. Eén plek voor
// beide momenten (bekijken en ondertekenen), zodat ze niet uiteenlopen.
const mapCompany = c => ({
  name: c?.name, address: c?.address, postalCode: c?.postal_code, city: c?.city,
  email: c?.email, phone: c?.phone, kvk: c?.kvk, btwNumber: c?.btw_number,
  brandingColor: c?.branding_color, logoUrl: c?.logo_url,
})
const mapKlant = k => ({
  name: k?.name, address: k?.address, postcode: k?.postcode, city: k?.city,
  email: k?.email, phone: k?.phone,
})

export default function WerkbonOndertekenen({ token }) {
  const [werkbon, setWerkbon] = useState(null)
  const [taken, setTaken] = useState([])
  const [uren, setUren] = useState([])
  const [materialen, setMaterialen] = useState([])
  const [meerwerk, setMeerwerk] = useState([])
  const [notities, setNotities] = useState([])
  const [uitvoerders, setUitvoerders] = useState([])
  const [fotos, setFotos] = useState([])
  const [company, setCompany] = useState(null)
  const [klant, setKlant] = useState(null)

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '' })
  const [heeftHandtekening, setHeeftHandtekening] = useState(false)
  const [signing, setSigning] = useState(false)
  const [klaar, setKlaar] = useState(false)
  const [pdfBezig, setPdfBezig] = useState(false)
  // Wat er zojuist is getekend. De werkbon in de status komt uit de RPC en weet
  // nog van niets; zonder dit levert "Werkbon downloaden" op het bedankscherm
  // een bon met een leeg handtekeningvak — precies het bewijsstuk dat ontbreekt.
  const [ondertekening, setOndertekening] = useState(null)

  const canvasRef = useRef(null)

  useEffect(() => {
    if (!token) { setError('Geen geldige link'); setLoading(false); return }
    Promise.all([
      supabase.rpc('get_werkbon_by_sign_token', { p_token: token }),
      supabase.rpc('get_werkbon_taken_by_sign_token', { p_token: token }),
      supabase.rpc('get_werkbon_uren_by_sign_token', { p_token: token }),
      supabase.rpc('get_werkbon_materialen_by_sign_token', { p_token: token }),
      supabase.rpc('get_werkbon_notities_by_sign_token', { p_token: token }),
      supabase.rpc('get_company_by_werkbon_token', { p_token: token }),
      supabase.rpc('get_customer_by_werkbon_token', { p_token: token }),
      supabase.rpc('get_werkbon_uitvoerders_by_sign_token', { p_token: token }),
    ]).then(([w, t, u, m, n, co, cu, uv]) => {
      const bon = w.data?.[0]
      if (!bon) { setError('Werkbon niet gevonden of de link is niet meer geldig.'); return }
      setWerkbon(bon)
      if (bon.ondertekend_op) setKlaar(true)
      // Eén lijst uit de RPC, hier gesplitst: taken en meerwerk staan in dezelfde
      // tabel en zijn alleen door is_meerwerk van elkaar te onderscheiden.
      setTaken((t.data || []).filter(r => !r.is_meerwerk))
      setMeerwerk((t.data || []).filter(r => r.is_meerwerk))
      setUren(u.data || [])
      setMaterialen(m.data || [])
      setNotities(n.data || [])
      setCompany(co.data?.[0] || null)
      setKlant(cu.data?.[0] || null)
      setUitvoerders((uv.data || []).map(r => r.naam).filter(Boolean))
      // Voorvullen met het adres waar de link heen ging, anders het klantadres.
      const mail = bon.verstuurd_naar_email || cu.data?.[0]?.email || ''
      setForm(f => ({
        name: cu.data?.[0]?.name || f.name,
        email: mail || f.email,
      }))
    }).catch(err => setError(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false))
  }, [token])

  // Foto's lopen via de edge function: de bucket is privé en een signed URL is
  // niet in SQL te maken. Los van de rest geladen, zodat de pagina niet wacht.
  useEffect(() => {
    if (!token || error) return
    getFotosViaToken(token).then(setFotos).catch(() => {})
  }, [token, error])

  const pdfArgs = (extra = {}) => ([
    {
      nummer: werkbon.nummer,
      titel: werkbon.titel,
      omschrijving: werkbon.omschrijving,
      locatie: werkbon.locatie,
      geplandOp: werkbon.gepland_op,
      gestartOp: werkbon.gestart_op,
      afgerondOp: werkbon.afgerond_op,
      ondertekendOp: ondertekening?.op || werkbon.ondertekend_op,
      ondertekendDoorNaam: ondertekening?.naam || werkbon.ondertekend_door_naam,
      ondertekendDoorEmail: ondertekening?.email || werkbon.ondertekend_door_email,
      // Vers getekend: de afbeelding zit nog in het geheugen. Bij een later
      // bezoek komt hij als opgeslagen link uit get_werkbon_by_sign_token.
      handtekeningDataUrl: ondertekening?.dataUrl || null,
      handtekeningUrl: werkbon.handtekening_url || null,
      uitvoerders,
      ...extra,
    },
    {
      // De RPC levert al alleen afgevinkte taken en uren zonder naam; bouwPdfData
      // zeeft nog een keer. Twee sloten op dezelfde deur, met opzet.
      taken,
      uren: (uren || []).map(u => ({
        datum: u.datum,
        startTijd: u.start_tijd, eindTijd: u.eind_tijd,
        pauzeMinuten: u.pauze_minuten, uren: u.uren, notitie: u.notitie,
      })),
      materialen,
      meerwerk: meerwerk.map(r => ({ omschrijving: r.omschrijving, afgerond: true })),
      notities,
      fotos,
    },
    mapKlant(klant),
    mapCompany(company),
  ])

  const bekijkPdf = async () => {
    setPdfBezig(true)
    try {
      const url = await getWerkbonPdfUrl(...pdfArgs())
      const mobiel = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      if (mobiel) {
        const a = document.createElement('a')
        a.href = url
        a.download = `Werkbon-${werkbon.nummer || ''}.pdf`
        a.click()
      } else {
        window.open(url, '_blank')
      }
    } catch (err) {
      alert('PDF maken mislukt: ' + err.message)
    } finally {
      setPdfBezig(false)
    }
  }

  const onderteken = async () => {
    if (!form.name.trim()) { alert('Vul uw naam in'); return }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) { alert('Vul een geldig e-mailadres in'); return }
    const dataUrl = canvasRef.current?.dataUrl()
    if (!dataUrl) { alert('Zet eerst uw handtekening'); return }

    setSigning(true)
    try {
      // De ondertekende PDF wordt hier gemaakt, mét handtekening, en gaat mee
      // naar de edge function. Mislukt dat, dan gaat het tekenen gewoon door —
      // de handtekening in de database is het bewijs, de PDF is de weergave.
      let pdfBase64 = null
      try {
        pdfBase64 = await getWerkbonPdfBase64(...pdfArgs({
          ondertekendOp: new Date().toISOString(),
          ondertekendDoorNaam: form.name.trim(),
          ondertekendDoorEmail: form.email.trim(),
          handtekeningDataUrl: dataUrl,
        }))
      } catch (e) {
        console.warn('Ondertekende PDF maken mislukt:', e.message)
      }

      const resultaat = await signWerkbon({
        signToken: token,
        name: form.name.trim(),
        email: form.email.trim(),
        signatureDataUrl: dataUrl,
        signedPdfBase64: pdfBase64,
      })
      setOndertekening({
        op: resultaat?.ondertekend_op || new Date().toISOString(),
        naam: form.name.trim(),
        email: form.email.trim(),
        dataUrl,
      })
      setKlaar(true)
    } catch (err) {
      alert('Er is iets misgegaan: ' + err.message)
    } finally {
      setSigning(false)
    }
  }

  const brand = company?.branding_color || '#1DDB62'
  const totaalUren = uren.reduce((s, u) => s + Number(u.uren || 0), 0)

  if (loading) {
    return <Schil><div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>Werkbon laden…</div></Schil>
  }

  if (error) {
    return (
      <Schil>
        <div style={{ textAlign: 'center', padding: '40px 0' }}>
          <div style={{ fontWeight: 700, marginBottom: 8 }}>Werkbon niet gevonden</div>
          <div style={{ color: '#6b7280', fontSize: '.9rem' }}>{error}</div>
        </div>
      </Schil>
    )
  }

  if (klaar) {
    return (
      <Schil>
        {company?.logo_url && (
          <div style={{ textAlign: 'center', marginBottom: 20 }}>
            <img src={company.logo_url} alt={company.name} style={{ height: 48, objectFit: 'contain' }} />
          </div>
        )}
        <div style={{ textAlign: 'center', padding: '32px 0' }}>
          <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: 8 }}>
            Bedankt! Uw handtekening is ontvangen.
          </div>
          <div style={{ color: '#6b7280', fontSize: '.95rem' }}>
            Werkbon <strong>{werkbon?.nummer}</strong> is afgetekend. U ontvangt een bevestiging per e-mail,
            met de werkbon als bijlage.
          </div>
        </div>
        <button onClick={bekijkPdf} disabled={pdfBezig} style={st.pdfKnop}>
          {pdfBezig ? 'PDF laden…' : 'Werkbon downloaden'}
        </button>
      </Schil>
    )
  }

  return (
    <Schil>
      {/* Kop */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
        {company?.logo_url
          ? <img src={company.logo_url} alt={company.name} style={{ height: 44, objectFit: 'contain' }} />
          : <div style={{ fontWeight: 800, fontSize: '1.2rem', color: brand }}>{company?.name || 'BossBase'}</div>}
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontWeight: 700, fontSize: '1rem' }}>{werkbon.nummer}</div>
          <div style={{ color: '#6b7280', fontSize: '.82rem' }}>Werkbon</div>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 16, marginBottom: 24 }}>
        <Info label="Klant" value={klant?.name || ''} />
        <Info label="Uitgevoerd op" value={fmtDatum(werkbon.afgerond_op || werkbon.gestart_op || werkbon.gepland_op)} />
        {werkbon.locatie && <Info label="Locatie" value={werkbon.locatie} />}
        {totaalUren > 0 && <Info label="Gewerkte uren" value={uurFmt(totaalUren)} />}
        {uitvoerders.length > 0 && <Info label="Uitgevoerd door" value={uitvoerders.join(', ')} />}
      </div>

      {(werkbon.omschrijving || werkbon.titel) && (
        <Blok titel="Uitgevoerd werk">
          <div style={{ fontSize: '.9rem', color: '#374151', whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
            {werkbon.omschrijving || werkbon.titel}
          </div>
        </Blok>
      )}

      {taken.length > 0 && (
        <Blok titel="Uitgevoerde werkzaamheden">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {taken.map((t, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '.9rem' }}>
                <span style={{
                  flexShrink: 0, width: 16, height: 16, borderRadius: '50%', marginTop: 2,
                  background: '#0f9d58', color: '#fff', fontSize: 11, lineHeight: '16px',
                  textAlign: 'center', fontWeight: 700,
                }}>✓</span>
                <span style={{ color: '#111827' }}>{t.omschrijving}</span>
              </div>
            ))}
          </div>
        </Blok>
      )}

      {uren.length > 0 && (
        <Blok titel="Gewerkte uren" rechts={`Totaal ${uurFmt(totaalUren)}`}>
          {uren.map((u, i) => (
            <Regel key={i} laatste={i === uren.length - 1}>
              <div>
                <div style={{ fontWeight: 600 }}>
                  {fmtDatum(u.datum)}
                  {tijd(u.start_tijd) && tijd(u.eind_tijd) ? ` · ${tijd(u.start_tijd)}–${tijd(u.eind_tijd)}` : ''}
                </div>
                {/* Alleen tonen als er iets te melden is — een streepje onder
                    elke regel oogt als ontbrekende gegevens. */}
                {(u.pauze_minuten || u.notitie) && (
                  <div style={{ color: '#9ca3af', fontSize: '.82rem' }}>
                    {[u.pauze_minuten ? `${u.pauze_minuten} min pauze` : null, u.notitie || null]
                      .filter(Boolean).join(' · ')}
                  </div>
                )}
              </div>
              <div style={{ fontWeight: 700, whiteSpace: 'nowrap' }}>{uurFmt(u.uren)}</div>
            </Regel>
          ))}
        </Blok>
      )}

      {materialen.length > 0 && (
        <Blok titel="Gebruikt materiaal">
          {materialen.map((m, i) => (
            <Regel key={i} laatste={i === materialen.length - 1}>
              <span style={{ fontWeight: 500 }}>{m.naam}</span>
              <span style={{ color: '#6b7280', whiteSpace: 'nowrap' }}>
                {Number(m.aantal ?? 0).toLocaleString('nl-NL', { maximumFractionDigits: 2 })}
                {m.eenheid ? ` ${m.eenheid}` : ''}
              </span>
            </Regel>
          ))}
        </Blok>
      )}

      {meerwerk.length > 0 && (
        <Blok titel="Extra uitgevoerd werk">
          <div style={{ fontSize: '.82rem', color: '#6b7280', marginBottom: 8 }}>
            Dit werk zat niet in de oorspronkelijke opdracht.
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {meerwerk.map((mw, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, fontSize: '.9rem' }}>
                <span style={{
                  flexShrink: 0, width: 16, height: 16, borderRadius: '50%', marginTop: 2,
                  background: '#0f9d58', color: '#fff', fontSize: 11, lineHeight: '16px',
                  textAlign: 'center', fontWeight: 700,
                }}>✓</span>
                <span style={{ color: '#111827' }}>{mw.omschrijving}</span>
              </div>
            ))}
          </div>
        </Blok>
      )}

      {notities.length > 0 && (
        <Blok titel="Toelichting">
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notities.map((n, i) => (
              <div key={i} style={{ background: '#f9fafb', borderRadius: 8, padding: '11px 13px', fontSize: '.88rem', color: '#374151', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>
                {n.note}
              </div>
            ))}
          </div>
        </Blok>
      )}

      {fotos.length > 0 && (
        <Blok titel="Foto's" rechts={`${fotos.length}`}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
            {fotos.map((f, i) => (
              <a key={i} href={f.url} target="_blank" rel="noreferrer" style={{ display: 'block' }}>
                <img
                  src={f.url}
                  alt={f.categorie || `Foto ${i + 1}`}
                  style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 8, border: '1px solid #e5e7eb', display: 'block' }}
                />
                {f.categorie && (
                  <div style={{ fontSize: '.72rem', fontWeight: 700, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginTop: 4 }}>
                    {f.categorie}
                  </div>
                )}
              </a>
            ))}
          </div>
        </Blok>
      )}

      <button onClick={bekijkPdf} disabled={pdfBezig} style={st.pdfKnop}>
        {pdfBezig ? 'PDF laden…' : 'Werkbon als PDF bekijken'}
      </button>

      {/* Ondertekenen */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 14 }}>Uw gegevens</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
          <div>
            <label style={st.label}>Naam</label>
            <input style={st.input} value={form.name}
              onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              placeholder="Uw volledige naam" />
          </div>
          <div>
            <label style={st.label}>E-mailadres</label>
            <input style={st.input} type="email" value={form.email}
              onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
              placeholder="uw@emailadres.nl" />
          </div>
        </div>
      </div>

      <div style={{ marginBottom: 20 }}>
        {/* Hier leest de klant zelf mee, dus in de u-vorm — net als op de
            ondertekenpagina van een offerte. */}
        <HandtekeningCanvas
          ref={canvasRef}
          onChange={setHeeftHandtekening}
          titel="Handtekening"
          plaatshouder="Teken hier uw handtekening"
        />
      </div>

      <div style={{ fontSize: '.78rem', color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
        Door te ondertekenen verklaart u dat het werk op deze bon is uitgevoerd zoals beschreven.
        Deze werkbon vermeldt geen bedragen; de factuur volgt apart.
      </div>

      <button
        onClick={onderteken}
        disabled={signing || !heeftHandtekening}
        style={{
          width: '100%', padding: 14, border: 'none', borderRadius: 10,
          fontSize: '1rem', fontWeight: 700, color: '#fff',
          background: signing || !heeftHandtekening ? '#9ca3af' : brand,
          cursor: signing || !heeftHandtekening ? 'not-allowed' : 'pointer',
        }}
      >
        {signing ? 'Bezig met ondertekenen…' : 'Akkoord en ondertekenen'}
      </button>
    </Schil>
  )
}

// ── Kleine bouwstenen ───────────────────────────────────────────────────────

function Schil({ children }) {
  return (
    <div style={st.schil}><div style={st.kaart}>{children}</div></div>
  )
}

function Info({ label, value }) {
  return (
    <div>
      <div style={{ fontSize: '.72rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: 500, color: '#111827', fontSize: '.95rem' }}>{value}</div>
    </div>
  )
}

function Blok({ titel, rechts, children }) {
  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontWeight: 600, fontSize: '.78rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>{titel}</div>
        {rechts && <div style={{ fontSize: '.78rem', color: '#9ca3af', fontWeight: 600 }}>{rechts}</div>}
      </div>
      {children}
    </div>
  )
}

function Regel({ children, laatste }) {
  return (
    <div style={{
      display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
      padding: '9px 0', fontSize: '.88rem',
      borderBottom: laatste ? 'none' : '1px solid #f3f4f6',
    }}>
      {children}
    </div>
  )
}

const st = {
  schil: {
    minHeight: '100vh', background: '#f3f4f6', display: 'flex',
    alignItems: 'flex-start', justifyContent: 'center', padding: '32px 16px 64px',
  },
  kaart: {
    background: '#fff', borderRadius: 16, boxShadow: '0 4px 24px rgba(0,0,0,.08)',
    padding: 28, width: '100%', maxWidth: 680,
  },
  label: { display: 'block', fontSize: '.78rem', fontWeight: 600, color: '#374151', marginBottom: 4 },
  input: {
    width: '100%', padding: '9px 12px', border: '1px solid #d1d5db', borderRadius: 8,
    fontSize: '.92rem', outline: 'none', boxSizing: 'border-box',
  },
  pdfKnop: {
    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    width: '100%', padding: '11px 16px', marginBottom: 22,
    background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10,
    fontSize: '.9rem', fontWeight: 600, color: '#374151', cursor: 'pointer',
  },
}
