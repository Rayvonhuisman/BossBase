import { useEffect, useMemo, useState } from 'react'
import { WebsiteAanvragen } from '../components/WebsiteAanvragen.jsx'
import { Meldingen } from '../components/Meldingen.jsx'
import { X } from 'lucide-react'
import { supabase } from '../lib/supabase.js'
import { TIERS, tierLabel, tierPrice } from '../lib/tiers.js'

// De superadmin: wat er via bossbase.nl binnenkomt, en welke bedrijven er zijn
// met welk abonnement. Zelfde bouwstenen als het dashboard (page-hd, sc-kaarten,
// card met lsec-hd en lrows, badge-klassen, drawer), geen eigen vormgeving.
//
// Indeling, van boven naar beneden:
//   1. vier cijfers: nieuwe aanvragen, bedrijven, betalend, MRR;
//   2. binnengekomen aanvragen (contactformulier, demo, proef) met een lade;
//      ?aanvraag=<id> (de link uit de mail naar info@bossbase.nl) opent die lade;
//   3. bedrijven en hun abonnementen, met de bestaande bedrijfslade;
//   4. de bestaande blokken voor gratis-website-aanvragen en het meldpunt.

// ── Opmaakhulpjes ────────────────────────────────────────────────────────────
function fmtDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtRelative(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'zojuist'
  if (mins < 60) return `${mins} min geleden`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs} uur geleden`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days} ${days === 1 ? 'dag' : 'dagen'} geleden`
  return fmtDate(iso)
}

function memberInitials(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean)
  if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return '?'
}

function fmtEuro(n) {
  return new Intl.NumberFormat('nl-NL', { style: 'currency', currency: 'EUR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(n || 0)
}

// ── Statussen ────────────────────────────────────────────────────────────────
const AANVRAAG_STATUS = [
  { id: 'nieuw',          label: 'Nieuw',          badge: 'b-new' },
  { id: 'in_behandeling', label: 'In behandeling', badge: 'b-progress' },
  { id: 'gekwalificeerd', label: 'Gekwalificeerd', badge: 'b-done' },
  { id: 'afgewezen',      label: 'Afgewezen',      badge: 'b-lost' },
  { id: 'spam',           label: 'Spam',           badge: 'b-lost' },
]
const AFGEHANDELD = new Set(['gekwalificeerd', 'afgewezen', 'spam'])

function AanvraagBadge({ status }) {
  const s = AANVRAAG_STATUS.find(x => x.id === status) || AANVRAAG_STATUS[0]
  return <span className={`badge ${s.badge}`}>{s.label}</span>
}

// Het abonnement in één badge: wat het nu is en wanneer het eindigt.
function AbonnementBadge({ company }) {
  const sub = company.subscription
  if (company.status === 'geblokkeerd') return <span className="badge b-declined">Geblokkeerd</span>
  if (!sub) return <span className="badge b-lost">Geen abonnement</span>
  if (sub.status === 'opgezegd' || company.status === 'opgezegd') {
    return <span className="badge b-lost">Opgezegd{sub.opgezegdOp ? ` · ${fmtDate(sub.opgezegdOp)}` : ''}</span>
  }
  if (sub.status === 'betaalprobleem') return <span className="badge b-overdue">Betaalprobleem</span>
  if (sub.status === 'trial') {
    return <span className="badge b-orange">Proef{sub.trialEndsAt ? ` t/m ${fmtDate(sub.trialEndsAt)}` : ''}</span>
  }
  if (sub.stoptOp) return <span className="badge b-sent">Stopt {fmtDate(sub.stoptOp)}</span>
  return <span className="badge b-paid">Actief{sub.interval ? ` · ${sub.interval === 'jaar' ? 'jaar' : 'maand'}` : ''}</span>
}

function PlanBadge({ plan }) {
  return <span className="badge b-concept">{tierLabel(plan)}</span>
}

const isBetalend = c => c.subscription?.status === 'actief' && c.status !== 'geblokkeerd'

// ── Hoofdcomponent ───────────────────────────────────────────────────────────
const ALLOWED_EMAILS = ['info@bossbase.nl', 'nielsgrevink@gmail.com']

export function SuperAdminPage({ navigate, profile }) {
  // Laag 2 — beveiliging binnen de pagina zelf. Naast de route-guard in
  // App.jsx checkt de pagina nogmaals onafhankelijk of de gebruiker een
  // super admin is. `authorized` wordt vóór de hooks berekend zodat het
  // aantal hook-calls constant blijft (rules-of-hooks veilig).
  const authorized = profile?.isSuperAdmin === true && ALLOWED_EMAILS.includes(profile?.email)

  const [companies,   setCompanies]   = useState([])
  const [aanvragen,   setAanvragen]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState('')
  const [drawer,      setDrawer]      = useState(null)
  const [drawerNotes, setDrawerNotes] = useState('')
  const [drawerPlan,  setDrawerPlan]  = useState(false)
  const [saving,      setSaving]      = useState(false)
  const [aanvraagId,  setAanvraagId]  = useState(() => new URLSearchParams(window.location.search).get('aanvraag'))
  const [alleAanvragen, setAlleAanvragen] = useState(false)

  // ── Data laden ─────────────────────────────────────────────────────────────
  const load = async (keepDrawerId = null) => {
    setLoading(true)
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('super-admin-data')
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      const fresh = data.companies || []
      setCompanies(fresh)
      setAanvragen(data.aanvragen || [])
      if (keepDrawerId) {
        const updated = fresh.find(c => c.id === keepDrawerId)
        if (updated) {
          setDrawer(updated)
          setDrawerNotes(updated.subscription?.notes || '')
        }
      }
    } catch (err) {
      setError(err.message || 'Laden mislukt')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { if (authorized) load() }, [authorized])

  // De open aanvraag in de URL zetten (zonder extra stap in de geschiedenis),
  // zodat het adres gedeeld of opnieuw geladen kan worden.
  const zetAanvraag = id => {
    setAanvraagId(id)
    const url = new URL(window.location.href)
    if (id) url.searchParams.set('aanvraag', id)
    else url.searchParams.delete('aanvraag')
    window.history.replaceState(window.history.state, '', url.pathname + url.search)
  }

  // ── Acties op bedrijven ────────────────────────────────────────────────────
  const handlePlanSelect = async (company, planId) => {
    setSaving(true)
    try {
      const price = tierPrice(planId)
      if (company.subscription?.id) {
        const { error } = await supabase.from('subscriptions')
          .update({ plan: planId, price_per_month: price })
          .eq('id', company.subscription.id)
        if (error) throw error
      } else {
        const { error } = await supabase.from('subscriptions')
          .insert({ company_id: company.id, plan: planId, status: 'trial', price_per_month: price })
        if (error) throw error
      }
      setDrawerPlan(false)
      await load(drawer?.id === company.id ? company.id : null)
    } catch (err) {
      alert('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleStatusSelect = async (company, status) => {
    setSaving(true)
    try {
      const { error: compErr } = await supabase.from('companies').update({ status }).eq('id', company.id)
      if (compErr) throw compErr
      if (company.subscription?.id) {
        await supabase.from('subscriptions').update({ status }).eq('id', company.subscription.id)
      }
      await load(drawer?.id === company.id ? company.id : null)
    } catch (err) {
      alert('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!drawer?.subscription?.id) return
    setSaving(true)
    try {
      const { error } = await supabase.from('subscriptions')
        .update({ notes: drawerNotes })
        .eq('id', drawer.subscription.id)
      if (error) throw error
      await load(drawer.id)
    } catch (err) {
      alert('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const openDrawer = company => {
    setDrawer(company)
    setDrawerNotes(company.subscription?.notes || '')
    setDrawerPlan(false)
  }

  // ── Acties op aanvragen ────────────────────────────────────────────────────
  const zetAanvraagStatus = async (id, status) => {
    setSaving(true)
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('super-admin-data', { body: { actie: 'aanvraag_status', id, status } })
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      setAanvragen(lijst => lijst.map(a => a.id === id ? { ...a, status } : a))
    } catch (err) {
      alert('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  // ── Afgeleide waarden ──────────────────────────────────────────────────────
  const nieuw = aanvragen.filter(a => a.status === 'nieuw' && !a.isTest).length
  const betalend = companies.filter(isBetalend)
  const mrr = betalend.reduce((sum, c) => sum + tierPrice(c.subscription.plan), 0)
  const zichtbareAanvragen = alleAanvragen ? aanvragen : aanvragen.filter(a => !AFGEHANDELD.has(a.status))
  const openAanvraag = useMemo(() => aanvragen.find(a => a.id === aanvraagId) || null, [aanvragen, aanvraagId])

  // Niet-geautoriseerd? Render NIETS. Staat na alle hooks zodat het aantal
  // hook-calls constant blijft.
  if (!authorized) return null

  return (
    <div style={{ minHeight: '100dvh', background: 'var(--bgs)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px 60px' }}>

        <div className="page-hd afu">
          <div>
            <h1>Superadmin</h1>
            <p>Aanvragen via bossbase.nl, bedrijven en abonnementen</p>
          </div>
          <div className="page-hd-actions">
            <button className="btn btn-s btn-sm" onClick={() => load()} disabled={loading}>{loading ? 'Laden…' : 'Vernieuwen'}</button>
            <button className="btn btn-s btn-sm" onClick={() => navigate('/dashboard')}>← Dashboard</button>
          </div>
        </div>

        {error && <div className="card card-p" style={{ color: '#dc2626', fontSize: 13, marginBottom: 16 }}>Fout: {error}</div>}

        <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(4,1fr)', marginBottom: 20 }}>
          {[
            { label: 'Nieuwe aanvragen', value: nieuw },
            { label: 'Bedrijven',        value: companies.length },
            { label: 'Betalend',         value: betalend.length },
            { label: 'MRR',              value: fmtEuro(mrr) },
          ].map(k => (
            <div key={k.label} className="sc">
              <div className="sc-val">{k.value}</div>
              <div className="sc-label">{k.label}</div>
            </div>
          ))}
        </div>

        {/* ── Binnengekomen aanvragen ─────────────────────────────────────── */}
        <div className="card card-p afu2" style={{ marginBottom: 20 }}>
          <div className="lsec-hd">
            <div className="lsec-title">Binnengekomen aanvragen ({zichtbareAanvragen.length})</div>
            <button className="btn btn-ghost btn-xs" onClick={() => setAlleAanvragen(v => !v)}>
              {alleAanvragen ? 'Alleen open tonen' : 'Ook afgehandeld tonen'}
            </button>
          </div>
          {!loading && zichtbareAanvragen.length === 0 && <div className="lsec-empty">Geen open aanvragen</div>}
          <div className="lrows">
            {zichtbareAanvragen.map(a => (
              <div key={a.id} className="lrow" onClick={() => zetAanvraag(a.id)}>
                <div className="lrow-main">
                  <div className="lrow-title">{a.bedrijf ? `${a.naam} · ${a.bedrijf}` : a.naam}</div>
                  <div className="lrow-sub">{[a.onderwerp, a.email].filter(Boolean).join(' · ')}</div>
                </div>
                {a.isTest && <span className="badge b-concept">Test</span>}
                <AanvraagBadge status={a.status} />
                <div className="lrow-date">{fmtRelative(a.ontvangenOp)}</div>
              </div>
            ))}
          </div>
        </div>

        {/* ── Bedrijven en abonnementen ───────────────────────────────────── */}
        <div className="card card-p afu2" style={{ marginBottom: 20 }}>
          <div className="lsec-hd">
            <div className="lsec-title">Bedrijven en abonnementen ({companies.length})</div>
          </div>
          {loading && companies.length === 0 && <div className="lsec-empty">Laden…</div>}
          <div className="lrows">
            {companies.map(c => (
              <div key={c.id} className="lrow" onClick={() => openDrawer(c)}>
                {c.logoUrl
                  ? <img src={c.logoUrl} alt="" style={{ width: 28, height: 28, borderRadius: 6, objectFit: 'contain', background: 'var(--bgs)', flexShrink: 0 }} />
                  : <div style={{ width: 28, height: 28, borderRadius: 6, background: c.brandingColor || 'var(--border)', flexShrink: 0 }} />}
                <div className="lrow-main">
                  <div className="lrow-title">{c.name}</div>
                  <div className="lrow-sub">
                    {[c.email, `${c.memberCount} ${c.memberCount === 1 ? 'gebruiker' : 'gebruikers'}`, c.lastLogin ? `laatst ingelogd ${fmtRelative(c.lastLogin)}` : 'nooit ingelogd'].filter(Boolean).join(' · ')}
                  </div>
                </div>
                <PlanBadge plan={c.subscription?.plan || 'trial'} />
                <AbonnementBadge company={c} />
                <div className="lrow-amount">{isBetalend(c) ? `${fmtEuro(tierPrice(c.subscription.plan))}/m` : ''}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Openstaande website-aanvragen uit de welkomstactie */}
        <WebsiteAanvragen />

        {/* Bugs en ideeën uit het meldpunt, plus de schakelaar voor de actie */}
        <Meldingen />
      </div>

      {openAanvraag && (
        <AanvraagDrawer
          aanvraag={openAanvraag}
          saving={saving}
          onStatus={status => zetAanvraagStatus(openAanvraag.id, status)}
          onClose={() => zetAanvraag(null)}
        />
      )}

      {drawer && (
        <CompanyDrawer
          company={drawer}
          notes={drawerNotes}
          onNotesChange={setDrawerNotes}
          onSaveNotes={handleSaveNotes}
          onPlanSelect={handlePlanSelect}
          onStatusSelect={handleStatusSelect}
          drawerPlan={drawerPlan}
          setDrawerPlan={setDrawerPlan}
          saving={saving}
          onClose={() => setDrawer(null)}
        />
      )}
    </div>
  )
}

// ── Lade: één aanvraag ───────────────────────────────────────────────────────
function AanvraagDrawer({ aanvraag: a, saving, onStatus, onClose }) {
  useEffect(() => {
    const opEscape = e => { if (e.key === 'Escape') onClose() }
    document.addEventListener('keydown', opEscape)
    return () => document.removeEventListener('keydown', opEscape)
  }, [onClose])

  const antwoord = `mailto:${a.email}?subject=${encodeURIComponent(`Re: ${a.onderwerp || 'je aanvraag bij BossBase'}`)}`
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-body" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 16 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontWeight: 700, fontSize: 17 }}>{a.naam}{a.bedrijf ? ` · ${a.bedrijf}` : ''}</div>
              <div style={{ fontSize: 12, color: 'var(--dl)', marginTop: 2 }}>
                Via bossbase.nl · {fmtDate(a.ontvangenOp)} ({fmtRelative(a.ontvangenOp)}){a.isTest ? ' · test' : ''}
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Sluiten"><X size={16} /></button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <a className="btn btn-p btn-sm" href={antwoord}>Beantwoorden</a>
            {a.telefoon && <a className="btn btn-s btn-sm" href={`tel:${a.telefoon}`}>Bellen</a>}
          </div>

          <DrawerSection title="Status">
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {AANVRAAG_STATUS.map(s => (
                <button
                  key={s.id}
                  className={`btn btn-sm ${a.status === s.id ? 'btn-p' : 'btn-s'}`}
                  disabled={saving || a.status === s.id}
                  onClick={() => onStatus(s.id)}
                >
                  {s.label}
                </button>
              ))}
            </div>
          </DrawerSection>

          <DrawerSection title="Gegevens">
            <DrawerRow label="Naam"      value={a.naam} />
            <DrawerRow label="Bedrijf"   value={a.bedrijf} />
            <DrawerRow label="E-mail"    value={<a href={`mailto:${a.email}`} style={{ color: 'var(--pd)' }}>{a.email}</a>} />
            <DrawerRow label="Telefoon"  value={a.telefoon} />
            <DrawerRow label="Onderwerp" value={a.onderwerp} />
            <DrawerRow label="Branche"   value={a.branche} />
            <DrawerRow label="Pagina"    value={a.pagina} />
          </DrawerSection>

          <DrawerSection title="Bericht">
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 14, lineHeight: 1.55, color: 'var(--dk)' }}>{a.bericht || '—'}</div>
          </DrawerSection>
        </div>
      </div>
    </>
  )
}

// ── Lade: één bedrijf ────────────────────────────────────────────────────────
function CompanyDrawer({ company, notes, onNotesChange, onSaveNotes, onPlanSelect, onStatusSelect, drawerPlan, setDrawerPlan, saving, onClose }) {
  const sub  = company.subscription
  const stat = company.stats || {}

  const isBlocked = company.status === 'geblokkeerd'

  const handleBlock = () => {
    if (!confirm(`Weet je zeker dat je "${company.name}" wilt blokkeren? Alle gebruikers worden direct uitgelogd.`)) return
    onStatusSelect(company, 'geblokkeerd')
  }
  const handleUnblock = () => onStatusSelect(company, 'actief')

  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-body" style={{ padding: '20px 24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {company.logoUrl
                ? <img src={company.logoUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain', background: 'var(--bgs)', flexShrink: 0 }} />
                : <div style={{ width: 32, height: 32, borderRadius: 6, background: company.brandingColor || 'var(--border)', flexShrink: 0 }} />}
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 17, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.name}</div>
                <div style={{ fontSize: 12, color: 'var(--dl)', marginTop: 2 }}>{company.email || ''}</div>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} aria-label="Sluiten" style={{ flexShrink: 0 }}><X size={16} /></button>
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 20 }}>
            <button className="btn btn-s btn-sm" onClick={() => setDrawerPlan(v => !v)} disabled={saving}>Wijzig plan</button>
            {company.email && <a className="btn btn-s btn-sm" href={`mailto:${company.email}`}>Stuur mail</a>}
            {isBlocked
              ? <button className="btn btn-s btn-sm" onClick={handleUnblock} disabled={saving}>Deblokkeren</button>
              : <button className="btn btn-ghost btn-sm" style={{ color: '#dc2626' }} onClick={handleBlock} disabled={saving}>Blokkeer account</button>}
          </div>

          {drawerPlan && (
            <DrawerSection title="Plan kiezen">
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {TIERS.map(p => {
                  const isCurrent = sub?.plan === p.id
                  return (
                    <button key={p.id} className={`btn btn-sm ${isCurrent ? 'btn-p' : 'btn-s'}`}
                      onClick={() => onPlanSelect(company, p.id)} disabled={saving || isCurrent}
                      style={{ justifyContent: 'space-between' }}>
                      <span>{p.label}</span><span>€{p.price}/m</span>
                    </button>
                  )
                })}
              </div>
            </DrawerSection>
          )}

          <DrawerSection title="Abonnement">
            <DrawerRow label="Plan"        value={<PlanBadge plan={sub?.plan || 'trial'} />} />
            <DrawerRow label="Status"      value={<AbonnementBadge company={company} />} />
            <DrawerRow label="Prijs"       value={`${fmtEuro(sub ? tierPrice(sub.plan) : 0)} per maand`} />
            <DrawerRow label="Betaalt"     value={sub?.interval ? (sub.interval === 'jaar' ? 'Jaarabonnement' : 'Maandabonnement') : ''} />
            <DrawerRow label="Via Stripe"  value={sub ? (sub.heeftStripe ? 'Ja' : 'Nee') : ''} />
            <DrawerRow label="Gestart op"  value={fmtDate(sub?.startedAt)} />
            {sub?.status === 'trial' && <DrawerRow label="Proef eindigt" value={fmtDate(sub?.trialEndsAt)} />}
            {sub?.verplichtingTot && <DrawerRow label="Vast tot" value={fmtDate(sub.verplichtingTot)} />}
            {sub?.stoptOp && <DrawerRow label="Stopt op" value={fmtDate(sub.stoptOp)} />}
          </DrawerSection>

          <DrawerSection title="Bedrijfsgegevens">
            <DrawerRow label="Naam"       value={company.name} />
            <DrawerRow label="E-mail"     value={company.email || ''} />
            <DrawerRow label="Telefoon"   value={company.phone || ''} />
            <DrawerRow label="Adres"      value={company.address ? `${company.address}, ${company.postalCode || ''} ${company.city || ''}`.trim().replace(/^,\s*/, '') : ''} />
            <DrawerRow label="KvK"        value={company.kvk || ''} />
            <DrawerRow label="BTW"        value={company.btwNumber || ''} />
            <DrawerRow label="Website"    value={company.website
              ? <a href={company.website.startsWith('http') ? company.website : 'https://' + company.website} target="_blank" rel="noreferrer" style={{ color: 'var(--pd)' }}>{company.website}</a>
              : ''} />
            <DrawerRow label="Aangemaakt" value={fmtDate(company.createdAt)} />
          </DrawerSection>

          <DrawerSection title={`Teamleden (${company.memberCount})`}>
            {(company.members || []).length === 0 && <div className="lsec-empty">Geen teamleden</div>}
            <div className="lrows">
              {(company.members || []).map(m => (
                <div key={m.id} className="lrow lrow-static">
                  <div className="av" style={{ width: 28, height: 28, borderRadius: '50%', background: 'var(--bgs)', color: 'var(--dm)', fontSize: 11, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    {memberInitials(m.fullName || m.email)}
                  </div>
                  <div className="lrow-main">
                    <div className="lrow-title">{m.fullName || m.email}</div>
                    <div className="lrow-sub">{m.email}</div>
                  </div>
                  <span className="badge b-concept">{m.role}</span>
                  {m.isSuperAdmin && <span className="badge b-blue">super admin</span>}
                  <div className="lrow-date">{m.lastLogin ? fmtRelative(m.lastLogin) : 'nooit ingelogd'}</div>
                </div>
              ))}
            </div>
          </DrawerSection>

          <DrawerSection title="Gebruik">
            <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3,1fr)' }}>
              {[
                { label: 'Klanten',    value: stat.klanten    ?? 0 },
                { label: 'Projecten',  value: stat.projecten  ?? 0 },
                { label: 'Offertes',   value: stat.offertes   ?? 0 },
                { label: 'Facturen',   value: stat.facturen   ?? 0 },
                { label: 'Werkbonnen', value: stat.werkbonnen ?? 0 },
                { label: 'Omzet',      value: fmtEuro(stat.omzet) },
              ].map(s => (
                <div key={s.label} className="sc">
                  <div className="sc-val">{s.value}</div>
                  <div className="sc-label">{s.label}</div>
                </div>
              ))}
            </div>
            {stat.laatsteActiviteit && (
              <div style={{ marginTop: 10, fontSize: 12, color: 'var(--dl)' }}>
                Laatste activiteit: {fmtDate(stat.laatsteActiviteit)} ({fmtRelative(stat.laatsteActiviteit)})
              </div>
            )}
          </DrawerSection>

          <DrawerSection title="Notities">
            <textarea
              value={notes}
              onChange={e => onNotesChange(e.target.value)}
              placeholder="Interne notitie over dit account…"
              style={{ width: '100%', minHeight: 100, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 8, fontSize: 13, resize: 'vertical', boxSizing: 'border-box', fontFamily: 'inherit' }}
            />
            <button className="btn btn-p btn-sm" onClick={onSaveNotes} disabled={saving || !company.subscription?.id} style={{ marginTop: 8 }}>
              {saving ? 'Opslaan…' : 'Notitie opslaan'}
            </button>
            {!company.subscription?.id && (
              <div style={{ fontSize: 11, color: 'var(--dl)', marginTop: 4 }}>Geen abonnement gekoppeld aan dit bedrijf.</div>
            )}
          </DrawerSection>
        </div>
      </div>
    </>
  )
}

// ── Bouwstenen voor de laden ─────────────────────────────────────────────────
function DrawerSection({ title, children }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div className="lsec-title" style={{ marginBottom: 8 }}>{title}</div>
      {children}
    </div>
  )
}

function DrawerRow({ label, value }) {
  if (value === '' || value === null || value === undefined) return null
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 16, padding: '7px 0', borderBottom: '1px solid var(--border)', fontSize: 13 }}>
      <span style={{ color: 'var(--dl)', flexShrink: 0 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}
