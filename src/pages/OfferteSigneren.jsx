import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'
import { signOfferte, sendEmail } from '../services/emailService.js'
import { getOffertePdfUrl } from '../utils/generatePdf.js'

const fmt = n =>
  new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0)

const fmtDate = d => {
  if (!d) return '—'
  const dt = new Date(d)
  return dt.toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
}

export default function OfferteSigneren({ token }) {
  const [offerte, setOfferte] = useState(null)
  const [items, setItems] = useState([])
  const [company, setCompany] = useState(null)
  const [klant, setKlant] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [form, setForm] = useState({ name: '', email: '' })
  const [signing, setSigning] = useState(false)
  const [done, setDone] = useState(false)
  const [hasSignature, setHasSignature] = useState(false)
  const [pdfLoading, setPdfLoading] = useState(false)

  const canvasRef = useRef(null)
  const drawing = useRef(false)
  const lastPos = useRef(null)

  useEffect(() => {
    if (!token) { setError('Geen geldig token'); setLoading(false); return }
    Promise.all([
      supabase.rpc('get_offerte_by_sign_token', { p_token: token }),
      supabase.rpc('get_offerte_items_by_token', { p_token: token }),
      supabase.rpc('get_company_by_sign_token', { p_token: token }),
      supabase.rpc('get_customer_by_sign_token', { p_token: token }),
    ]).then(([o, it, co, cu]) => {
      if (!o.data?.[0]) { setError('Offerte niet gevonden of link is ongeldig.'); return }
      const off = o.data[0]
      if (off.signed_at) { setDone(true) }
      setOfferte(off)
      setItems(it.data || [])
      setCompany(co.data?.[0] || null)
      setKlant(cu.data?.[0] || null)
      if (cu.data?.[0]?.email) setForm(f => ({ ...f, email: cu.data[0].email }))
      if (cu.data?.[0]?.name) setForm(f => ({ ...f, name: cu.data[0].name }))
    }).catch(err => setError(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false))
  }, [token])

  // Canvas setup
  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const resize = () => {
      const w = canvas.offsetWidth
      canvas.width = w
      canvas.height = 160
      ctx.strokeStyle = '#1e293b'
      ctx.lineWidth = 2.5
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
    }
    resize()
    window.addEventListener('resize', resize)
    return () => window.removeEventListener('resize', resize)
  }, [offerte])

  const getPos = (e, canvas) => {
    const r = canvas.getBoundingClientRect()
    const src = e.touches?.[0] || e
    return { x: src.clientX - r.left, y: src.clientY - r.top }
  }

  const startDraw = e => {
    e.preventDefault()
    drawing.current = true
    lastPos.current = getPos(e, canvasRef.current)
  }

  const draw = e => {
    if (!drawing.current) return
    e.preventDefault()
    const canvas = canvasRef.current
    const ctx = canvas.getContext('2d')
    const pos = getPos(e, canvas)
    ctx.beginPath()
    ctx.moveTo(lastPos.current.x, lastPos.current.y)
    ctx.lineTo(pos.x, pos.y)
    ctx.stroke()
    lastPos.current = pos
    setHasSignature(true)
  }

  const stopDraw = () => { drawing.current = false }

  const clearCanvas = () => {
    const canvas = canvasRef.current
    canvas.getContext('2d').clearRect(0, 0, canvas.width, canvas.height)
    setHasSignature(false)
  }

  const handleSubmit = async () => {
    if (!form.name.trim()) { alert('Vul uw naam in'); return }
    if (!form.email.trim() || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) {
      alert('Vul een geldig e-mailadres in'); return
    }
    if (!hasSignature) { alert('Teken eerst uw handtekening'); return }

    setSigning(true)
    try {
      const canvas = canvasRef.current
      const dataUrl = canvas.toDataURL('image/png')
      const result = await signOfferte({ signToken: token, name: form.name, email: form.email, signatureDataUrl: dataUrl })
      setDone(true)

      // Bevestigingsmails versturen (best-effort — blokkeert success niet)
      verstuurBevestigingsmails(result, form.name, form.email).catch(e =>
        console.warn('Bevestigingsmail mislukt:', e.message)
      )
    } catch (err) {
      alert('Er is iets misgegaan: ' + err.message)
    } finally {
      setSigning(false)
    }
  }

  const verstuurBevestigingsmails = async (result, signerName, signerEmail) => {
    const attachment = result.signed_pdf_base64
      ? [{ filename: result.signed_pdf_filename, content: result.signed_pdf_base64 }]
      : []

    const fromName = result.company_name || 'BossBase'
    const nummer = result.offerte_nummer || ''
    const totaal = result.totaal || ''
    const omschrijving = result.offerte_omschrijving || ''

    // Mail 1 → klant
    await sendEmail({
      to: signerEmail,
      subject: `Bevestiging: offerte ${nummer} ondertekend`,
      html: `<p>Beste ${signerName},</p>
             <p>Bedankt voor het ondertekenen van offerte <strong>${nummer}</strong>.</p>
             ${omschrijving ? `<p>Omschrijving: ${omschrijving}</p>` : ''}
             <p>Totaal: <strong>${totaal}</strong></p>
             ${attachment.length ? '<p>In de bijlage vindt u de ondertekende offerte.</p>' : ''}
             <p>We nemen zo snel mogelijk contact met u op.</p>
             <p>Met vriendelijke groet,<br>${fromName}</p>`,
      fromName,
      attachments: attachment,
    })

    // Mail 2 → eigenaar
    if (result.company_email) {
      await sendEmail({
        to: result.company_email,
        subject: `Offerte ${nummer} ondertekend door ${signerName}`,
        html: `<p>Goed nieuws! Offerte <strong>${nummer}</strong> is zojuist ondertekend.</p>
               <p>Ondertekend door: <strong>${signerName}</strong> (${signerEmail})<br>
                  Datum en tijd: ${new Date(result.signed_at).toLocaleString('nl-NL')}<br>
                  Totaal: <strong>${totaal}</strong></p>
               ${attachment.length ? '<p>De ondertekende offerte is als bijlage toegevoegd.</p>' : ''}`,
        fromName,
        attachments: attachment,
      })
    }
  }

  const handlePreviewPdf = async () => {
    setPdfLoading(true)
    try {
      const mappedOfferte = {
        nummer: offerte.nummer,
        createdAt: offerte.created_at,
        geldigTot: offerte.geldig_tot,
        totaalExcl: offerte.totaal_excl,
        totaalIncl: offerte.totaal_incl,
        btwPct: offerte.btw_pct,
        omschrijving: offerte.omschrijving,
        notes: offerte.notes,
      }
      const mappedItems = (items || []).map(item => ({
        omschrijving: item.omschrijving,
        aantal: item.aantal,
        prijsPer: item.prijs_per,
        btwPct: item.btw_pct,
        subtotaal: item.subtotaal,
        type: item.type,
      }))
      const mappedCompany = {
        name: company?.name,
        address: company?.address,
        postalCode: company?.postal_code,
        city: company?.city,
        email: company?.email,
        kvk: company?.kvk,
        btwNumber: company?.btw_number,
        brandingColor: company?.branding_color,
        logoUrl: company?.logo_url,
      }
      const mappedKlant = {
        name: klant?.name,
        address: klant?.address,
        postalCode: klant?.postal_code,
        city: klant?.city,
        email: klant?.email,
      }
      const pdfUrl = await getOffertePdfUrl(mappedOfferte, mappedItems, mappedKlant, mappedCompany)
      const isMobile = /Android|iPhone|iPad|iPod/i.test(navigator.userAgent)
      if (isMobile) {
        const link = document.createElement('a')
        link.href = pdfUrl
        link.download = `Offerte-${offerte.nummer}.pdf`
        link.click()
      } else {
        window.open(pdfUrl, '_blank')
      }
    } catch (err) {
      alert('PDF genereren mislukt: ' + err.message)
    } finally {
      setPdfLoading(false)
    }
  }

  const brandColor = company?.branding_color || '#f97316'

  if (loading) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', color: '#6b7280', padding: '40px 0' }}>Offerte laden…</div>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>
          <div style={{ textAlign: 'center', padding: '40px 0' }}>
            <div style={{ fontSize: '2rem', marginBottom: 12 }}>⚠️</div>
            <div style={{ fontWeight: 700, marginBottom: 8 }}>Offerte niet gevonden</div>
            <div style={{ color: '#6b7280', fontSize: '.9rem' }}>{error}</div>
          </div>
        </div>
      </div>
    )
  }

  if (done) {
    return (
      <div style={styles.shell}>
        <div style={styles.card}>
          {company?.logo_url && (
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <img src={company.logo_url} alt={company.name} style={{ height: 48, objectFit: 'contain' }} />
            </div>
          )}
          <div style={{ textAlign: 'center', padding: '32px 0' }}>
            <div style={{ fontSize: '3rem', marginBottom: 16 }}>✅</div>
            <div style={{ fontWeight: 800, fontSize: '1.25rem', marginBottom: 8 }}>
              Bedankt! Uw handtekening is ontvangen.
            </div>
            <div style={{ color: '#6b7280', fontSize: '.95rem' }}>
              Offerte <strong>{offerte?.nummer}</strong> is ondertekend. U ontvangt een bevestiging per e-mail.
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div style={styles.shell}>
      <div style={styles.card}>
        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24, paddingBottom: 20, borderBottom: '1px solid #e5e7eb' }}>
          {company?.logo_url
            ? <img src={company.logo_url} alt={company.name} style={{ height: 44, objectFit: 'contain' }} />
            : <div style={{ fontWeight: 800, fontSize: '1.2rem', color: brandColor }}>{company?.name || 'BossBase'}</div>
          }
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>{offerte.nummer}</div>
            <div style={{ color: '#6b7280', fontSize: '.82rem' }}>Offerte</div>
          </div>
        </div>

        {/* Gegevens */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 16, marginBottom: 24 }}>
          <InfoBlok label="Klant" value={klant?.name || '—'} />
          <InfoBlok label="Datum" value={fmtDate(offerte.created_at || offerte.geldig_tot)} />
          <InfoBlok label="Geldig tot" value={fmtDate(offerte.geldig_tot)} />
          <InfoBlok label="Totaalbedrag incl. BTW" value={fmt(offerte.totaal_incl)} />
        </div>

        {offerte.omschrijving && (
          <div style={{ marginBottom: 20, padding: '12px 14px', background: '#f9fafb', borderRadius: 8, fontSize: '.9rem', color: '#374151' }}>
            <div style={{ fontWeight: 600, marginBottom: 4, fontSize: '.78rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em' }}>Omschrijving</div>
            {offerte.omschrijving}
          </div>
        )}

        {/* Regelitems */}
        {items.length > 0 && (
          <div style={{ marginBottom: 24 }}>
            <div style={{ fontWeight: 600, fontSize: '.78rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 8 }}>Regelitems</div>
            <div style={{ border: '1px solid #e5e7eb', borderRadius: 8, overflow: 'hidden' }}>
              {items.map((item, i) => (
                <div key={item.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderBottom: i < items.length - 1 ? '1px solid #f3f4f6' : 'none', fontSize: '.88rem' }}>
                  <div>
                    <span style={{ fontWeight: 500 }}>{item.omschrijving}</span>
                    {item.eenheid && item.aantal && (
                      <span style={{ color: '#9ca3af', marginLeft: 8 }}>{item.aantal} × {fmt(item.prijs_per)} {item.eenheid}</span>
                    )}
                  </div>
                  <div style={{ fontWeight: 600, whiteSpace: 'nowrap', marginLeft: 12 }}>{fmt(item.subtotaal)}</div>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', padding: '12px 14px', background: '#f9fafb', fontWeight: 700 }}>
                <span>Totaal incl. BTW</span>
                <span style={{ color: '#111827' }}>{fmt(offerte.totaal_incl)}</span>
              </div>
            </div>
          </div>
        )}

        {/* PDF bekijken */}
        <button
          onClick={handlePreviewPdf}
          disabled={pdfLoading}
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            width: '100%', padding: '11px 16px', marginBottom: 20,
            background: '#fff', border: '1.5px solid #e5e7eb', borderRadius: 10,
            fontSize: '.9rem', fontWeight: 600, color: '#374151',
            cursor: pdfLoading ? 'not-allowed' : 'pointer',
            transition: 'border-color .15s, background .15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = '#9ca3af'; e.currentTarget.style.background = '#f9fafb'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = '#e5e7eb'; e.currentTarget.style.background = '#fff'; }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><polyline points="10 9 9 9 8 9"/>
          </svg>
          {pdfLoading ? 'PDF laden…' : 'Download offerte als PDF'}
        </button>

        {/* Gegevens invullen */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 14 }}>Uw gegevens</div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
            <div>
              <label style={styles.label}>Naam</label>
              <input
                style={styles.input}
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                placeholder="Uw volledige naam"
              />
            </div>
            <div>
              <label style={styles.label}>E-mailadres</label>
              <input
                style={styles.input}
                type="email"
                value={form.email}
                onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                placeholder="uw@emailadres.nl"
              />
            </div>
          </div>
        </div>

        {/* Handtekening canvas */}
        <div style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
            <div style={{ fontWeight: 700, fontSize: '1rem' }}>Handtekening</div>
            {hasSignature && (
              <button onClick={clearCanvas} style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '.82rem', textDecoration: 'underline' }}>
                Wissen
              </button>
            )}
          </div>
          <div style={{ border: '2px dashed #d1d5db', borderRadius: 8, background: '#fafafa', cursor: 'crosshair', touchAction: 'none', position: 'relative' }}>
            <canvas
              ref={canvasRef}
              style={{ display: 'block', width: '100%', borderRadius: 8 }}
              onMouseDown={startDraw}
              onMouseMove={draw}
              onMouseUp={stopDraw}
              onMouseLeave={stopDraw}
              onTouchStart={startDraw}
              onTouchMove={draw}
              onTouchEnd={stopDraw}
            />
            {!hasSignature && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9ca3af', fontSize: '.88rem', pointerEvents: 'none' }}>
                Teken hier uw handtekening
              </div>
            )}
          </div>
        </div>

        {/* Disclaimer + knop */}
        <div style={{ fontSize: '.78rem', color: '#6b7280', marginBottom: 16, lineHeight: 1.6 }}>
          Door op "Akkoord en ondertekenen" te klikken gaat u akkoord met de offerte van{' '}
          <strong>{company?.name || 'het bedrijf'}</strong>. Uw handtekening en gegevens worden opgeslagen.
        </div>

        <button
          onClick={handleSubmit}
          disabled={signing}
          style={{
            width: '100%',
            padding: '14px',
            background: signing ? '#9ca3af' : brandColor,
            color: '#fff',
            border: 'none',
            borderRadius: 10,
            fontSize: '1rem',
            fontWeight: 700,
            cursor: signing ? 'not-allowed' : 'pointer',
            transition: 'background .2s',
          }}
        >
          {signing ? 'Ondertekening verwerken…' : '✍️ Akkoord en ondertekenen'}
        </button>
      </div>
    </div>
  )
}

function InfoBlok({ label, value, accent }) {
  return (
    <div>
      <div style={{ fontSize: '.72rem', fontWeight: 600, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 3 }}>{label}</div>
      <div style={{ fontWeight: accent ? 700 : 500, color: accent || '#111827', fontSize: accent ? '1.1rem' : '.95rem' }}>{value}</div>
    </div>
  )
}

const styles = {
  shell: {
    minHeight: '100vh',
    background: '#f3f4f6',
    display: 'flex',
    alignItems: 'flex-start',
    justifyContent: 'center',
    padding: '32px 16px 64px',
  },
  card: {
    background: '#fff',
    borderRadius: 16,
    boxShadow: '0 4px 24px rgba(0,0,0,.08)',
    padding: '28px 28px',
    width: '100%',
    maxWidth: 680,
  },
  label: {
    display: 'block',
    fontSize: '.78rem',
    fontWeight: 600,
    color: '#374151',
    marginBottom: 4,
  },
  input: {
    width: '100%',
    padding: '9px 12px',
    border: '1px solid #d1d5db',
    borderRadius: 8,
    fontSize: '.92rem',
    outline: 'none',
    boxSizing: 'border-box',
  },
}
