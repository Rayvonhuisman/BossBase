import { useEffect, useRef, useState } from 'react'
import { supabase } from '../lib/supabase.js'

const PLANS = [
  { id: 'trial',       label: 'Trial',       price: 0  },
  { id: 'starter',     label: 'Starter',     price: 29 },
  { id: 'vakman',      label: 'Vakman',      price: 39 },
  { id: 'onderneming', label: 'Onderneming', price: 59 },
]

const STATUSES = [
  { id: 'trial',       label: 'Trial',       color: '#d97706', bg: '#fffbeb' },
  { id: 'actief',      label: 'Actief',      color: 'var(--pd)', bg: '#f0fdf4' },
  { id: 'geblokkeerd', label: 'Geblokkeerd', color: '#dc2626', bg: '#fef2f2' },
]

function StatusBadge({ status }) {
  const s = STATUSES.find(x => x.id === status) || STATUSES[0]
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 700, background: s.bg, color: s.color,
    }}>
      {s.label}
    </span>
  )
}

function PlanBadge({ plan }) {
  const p = PLANS.find(x => x.id === plan)
  return (
    <span style={{
      display: 'inline-block', padding: '2px 8px', borderRadius: 99,
      fontSize: 11, fontWeight: 600, background: '#f1f5f9', color: '#475569',
    }}>
      {p?.label || plan}
    </span>
  )
}

function fmtDate(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('nl-NL', { day: 'numeric', month: 'short', year: 'numeric' })
}

function fmtRelative(iso) {
  if (!iso) return '—'
  const diff = Date.now() - new Date(iso).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 2) return 'zojuist'
  if (mins < 60) return `${mins}m geleden`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}u geleden`
  const days = Math.floor(hrs / 24)
  if (days < 7) return `${days}d geleden`
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

const menuItemStyle = {
  display: 'block', width: '100%', padding: '9px 14px',
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 13, textAlign: 'left', color: '#111',
}

// ── Hoofd component ───────────────────────────────────────────
const ALLOWED_EMAILS = ['info@bossbase.nl', 'nielsgrevink@gmail.com']

export function SuperAdminPage({ navigate, profile }) {
  // Laag 2 — beveiliging binnen de pagina zelf. Naast de route-guard in
  // App.jsx checkt de pagina nogmaals onafhankelijk of de gebruiker een
  // super admin is. `authorized` wordt vóór de hooks berekend zodat het
  // aantal hook-calls constant blijft (rules-of-hooks veilig).
  const authorized = profile?.isSuperAdmin === true && ALLOWED_EMAILS.includes(profile?.email)

  const [companies,    setCompanies]    = useState([])
  const [loading,      setLoading]      = useState(true)
  const [error,        setError]        = useState('')
  const [menuOpen,     setMenuOpen]     = useState(null)
  const [menuMode,     setMenuMode]     = useState(null)
  const [drawer,       setDrawer]       = useState(null)
  const [drawerNotes,  setDrawerNotes]  = useState('')
  const [drawerPlan,   setDrawerPlan]   = useState(false)
  const [saving,       setSaving]       = useState(false)
  const menuRef = useRef(null)

  // ── Data laden ───────────────────────────────────────────────
  const load = async (keepDrawerId = null) => {
    setLoading(true)
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('super-admin-data')
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      const fresh = data.companies || []
      setCompanies(fresh)
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

  // Sluit tabel-menu bij klik buiten
  useEffect(() => {
    if (!menuOpen) return
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(null); setMenuMode(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

  // ── Acties ───────────────────────────────────────────────────
  const handlePlanSelect = async (company, planId) => {
    setSaving(true)
    try {
      const price = PLANS.find(p => p.id === planId)?.price ?? 0
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
      setMenuOpen(null); setMenuMode(null); setDrawerPlan(false)
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
      setMenuOpen(null); setMenuMode(null)
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
    setMenuOpen(null); setMenuMode(null)
  }

  // ── Afgeleide waarden ────────────────────────────────────────
  const totalCompanies = companies.length
  const activeCount    = companies.filter(c => c.subscription?.status === 'actief').length
  const trialCount     = companies.filter(c => !c.subscription || c.subscription.status === 'trial').length
  const mrr = companies.reduce((sum, c) =>
    c.subscription?.status === 'actief' ? sum + Number(c.subscription.pricePerMonth || 0) : sum, 0)

  // ── Render ───────────────────────────────────────────────────
  // Niet-geautoriseerd? Render NIETS. Staat na alle hooks zodat het aantal
  // hook-calls constant blijft.
  if (!authorized) return null

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>

      {/* Header */}
      <header style={{ background: '#0D0D0D', height: 60, padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#1DDB62', fontWeight: 800, fontSize: 17, letterSpacing: '-.3px' }}>BossBase</span>
          <span style={{ color: '#333', fontSize: 15 }}>|</span>
          <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500 }}>Admin</span>
        </div>
        <button onClick={() => navigate('/dashboard')} style={{ background: 'none', border: '1px solid #2a2a2a', color: '#9ca3af', padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13 }}>
          ← Dashboard
        </button>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px' }}>

        {/* Stats */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Bedrijven', value: totalCompanies, accent: '#1DDB62' },
            { label: 'Actief',    value: activeCount,    accent: 'var(--pd)' },
            { label: 'Trial',     value: trialCount,     accent: '#d97706' },
            { label: 'MRR',       value: `€${mrr}`,      accent: '#6366f1' },
          ].map(card => (
            <div key={card.label} className="card" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>{card.label}</div>
              <div style={{ fontSize: 26, fontWeight: 800, color: card.accent, lineHeight: 1 }}>{card.value}</div>
            </div>
          ))}
        </div>

        {/* Bedrijven tabel */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Bedrijven</div>
            <button className="btn btn-ghost btn-sm" onClick={() => load()} disabled={loading}>{loading ? 'Laden…' : 'Vernieuwen'}</button>
          </div>
          {error && <div style={{ padding: '16px 20px', color: '#dc2626', fontSize: 13 }}>Fout: {error}</div>}
          {!error && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Bedrijfsnaam', 'Email', 'Plan', 'Status', 'Leden', 'Aangemaakt', 'Laatste login', ''].map(h => (
                      <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontWeight: 600, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.05em', background: '#f8f9fa', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && <tr><td colSpan={8} style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af' }}>Laden…</td></tr>}
                  {!loading && companies.length === 0 && <tr><td colSpan={8} style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af' }}>Geen bedrijven</td></tr>}
                  {companies.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onClick={() => openDrawer(c)}>
                      <td style={{ padding: '11px 14px', fontWeight: 600 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          {c.logoUrl
                            ? <img src={c.logoUrl} alt="" style={{ width: 22, height: 22, borderRadius: 4, objectFit: 'contain', background: '#f1f5f9' }} />
                            : <div style={{ width: 22, height: 22, borderRadius: 4, background: c.brandingColor || '#e5e7eb', flexShrink: 0 }} />
                          }
                          {c.name}
                        </div>
                      </td>
                      <td style={{ padding: '11px 14px', color: '#6b7280' }}>{c.email || '—'}</td>
                      <td style={{ padding: '11px 14px' }}><PlanBadge plan={c.subscription?.plan || 'trial'} /></td>
                      <td style={{ padding: '11px 14px' }}><StatusBadge status={c.status || 'actief'} /></td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>{c.memberCount}</td>
                      <td style={{ padding: '11px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(c.createdAt)}</td>
                      <td style={{ padding: '11px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtRelative(c.lastLogin)}</td>
                      <td style={{ padding: '11px 14px' }} onClick={e => e.stopPropagation()}>
                        <div style={{ position: 'relative' }} ref={menuOpen === c.id ? menuRef : null}>
                          <button
                            className="btn btn-ghost btn-xs"
                            disabled={saving}
                            onClick={e => { e.stopPropagation(); menuOpen === c.id ? (setMenuOpen(null), setMenuMode(null)) : (setMenuOpen(c.id), setMenuMode(null)) }}
                            style={{ padding: '3px 9px', fontWeight: 700, letterSpacing: 2 }}
                          >···</button>
                          {menuOpen === c.id && (
                            <div style={{ position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50, background: '#fff', border: '1px solid var(--border)', borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,.12)', minWidth: 190, overflow: 'hidden' }}>
                              {menuMode === 'plan' && (
                                <>
                                  <div style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af', borderBottom: '1px solid var(--border)' }}>Plan kiezen</div>
                                  {PLANS.map(p => (
                                    <button key={p.id} style={{ ...menuItemStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'} onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                      onClick={() => handlePlanSelect(c, p.id)}>
                                      <span>{p.label}</span><span style={{ color: '#9ca3af', fontSize: 12 }}>€{p.price}/m</span>
                                    </button>
                                  ))}
                                </>
                              )}
                              {menuMode === 'status' && (
                                <>
                                  <div style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af', borderBottom: '1px solid var(--border)' }}>Status wijzigen</div>
                                  {STATUSES.map(s => (
                                    <button key={s.id} style={menuItemStyle}
                                      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'} onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                      onClick={() => handleStatusSelect(c, s.id)}><StatusBadge status={s.id} /></button>
                                  ))}
                                </>
                              )}
                              {!menuMode && (
                                <>
                                  <button style={menuItemStyle} onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'} onMouseLeave={e => e.currentTarget.style.background = 'none'} onClick={() => setMenuMode('plan')}>Plan wijzigen →</button>
                                  <button style={menuItemStyle} onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'} onMouseLeave={e => e.currentTarget.style.background = 'none'} onClick={() => setMenuMode('status')}>Status wijzigen →</button>
                                  <button style={{ ...menuItemStyle, color: '#1DDB62', fontWeight: 600 }} onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'} onMouseLeave={e => e.currentTarget.style.background = 'none'} onClick={() => openDrawer(c)}>Details bekijken</button>
                                </>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Detail drawer ──────────────────────────────── */}
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

// ── Detail drawer component ───────────────────────────────────
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
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200 }} onClick={onClose} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 520, background: '#fff', zIndex: 201, overflowY: 'auto', boxShadow: '-6px 0 40px rgba(0,0,0,.18)', display: 'flex', flexDirection: 'column' }}>

        {/* Sticky header */}
        <div style={{ position: 'sticky', top: 0, background: '#fff', zIndex: 10, borderBottom: '1px solid var(--border)' }}>
          {/* Naam + sluiten */}
          <div style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
              {company.logoUrl
                ? <img src={company.logoUrl} alt="" style={{ width: 32, height: 32, borderRadius: 6, objectFit: 'contain', background: '#f1f5f9', flexShrink: 0 }} />
                : <div style={{ width: 32, height: 32, borderRadius: 6, background: company.brandingColor || '#e5e7eb', flexShrink: 0 }} />
              }
              <div style={{ minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{company.name}</div>
                <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 1 }}>{company.email || '—'}</div>
              </div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={onClose} style={{ flexShrink: 0 }}>✕</button>
          </div>

          {/* Actie knoppen */}
          <div style={{ padding: '0 24px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {isBlocked ? (
              <button className="btn btn-s" onClick={handleUnblock} disabled={saving}
                style={{ background: '#f0fdf4', color: 'var(--pd)', border: '1px solid #bbf7d0', fontWeight: 600 }}>
                Deblokkeren
              </button>
            ) : (
              <button className="btn btn-s" onClick={handleBlock} disabled={saving}
                style={{ background: '#fef2f2', color: '#dc2626', border: '1px solid #fecaca', fontWeight: 600 }}>
                Blokkeer account
              </button>
            )}
            <button className="btn btn-sm btn-ghost" onClick={() => setDrawerPlan(v => !v)} disabled={saving}>
              Wijzig plan
            </button>
            {company.email && (
              <button className="btn btn-sm btn-ghost" onClick={() => window.open('mailto:' + company.email)}>
                Stuur mail
              </button>
            )}
          </div>
        </div>

        {/* Content */}
        <div style={{ padding: '20px 24px', flex: 1 }}>

          {/* Plan picker (inline, zichtbaar na klik "Wijzig plan") */}
          {drawerPlan && (
            <div style={{ background: '#f8f9fa', border: '1px solid var(--border)', borderRadius: 10, padding: '14px 16px', marginBottom: 20 }}>
              <div style={{ fontWeight: 700, fontSize: 12, color: '#6b7280', marginBottom: 10 }}>Plan kiezen</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {PLANS.map(p => {
                  const isCurrent = sub?.plan === p.id
                  return (
                    <button key={p.id} onClick={() => onPlanSelect(company, p.id)}
                      disabled={saving || isCurrent}
                      style={{
                        padding: '10px 14px', borderRadius: 8, border: isCurrent ? '2px solid #1DDB62' : '1px solid var(--border)',
                        background: isCurrent ? '#f0fdf4' : '#fff', cursor: isCurrent ? 'default' : 'pointer',
                        textAlign: 'left', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: isCurrent ? 'var(--pd)' : '#111' }}>{p.label}</span>
                      <span style={{ fontSize: 12, color: '#6b7280' }}>€{p.price}/m</span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* 1. Bedrijfsgegevens */}
          <DrawerSection title="Bedrijfsgegevens">
            <DrawerRow label="Naam"       value={company.name} />
            <DrawerRow label="E-mail"     value={company.email || '—'} />
            <DrawerRow label="Telefoon"   value={company.phone || '—'} />
            <DrawerRow label="Adres"      value={company.address ? `${company.address}, ${company.postalCode || ''} ${company.city || ''}`.trim().replace(/^,\s*/, '') : '—'} />
            <DrawerRow label="KvK"        value={company.kvk || '—'} />
            <DrawerRow label="BTW"        value={company.btwNumber || '—'} />
            <DrawerRow label="Website"    value={company.website
              ? <a href={company.website.startsWith('http') ? company.website : 'https://' + company.website} target="_blank" rel="noreferrer" style={{ color: '#1DDB62' }}>{company.website}</a>
              : '—'} />
            <DrawerRow label="Aangemaakt" value={fmtDate(company.createdAt)} />
            <DrawerRow label="Status"     value={<StatusBadge status={company.status || 'actief'} />} />
            <DrawerRow label="Branding"   value={
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <div style={{ width: 14, height: 14, borderRadius: 3, background: company.brandingColor, border: '1px solid rgba(0,0,0,.1)', flexShrink: 0 }} />
                <span>{company.brandingColor}</span>
              </div>
            } />
            {company.logoUrl && (
              <DrawerRow label="Logo" value={
                <img src={company.logoUrl} alt="" style={{ height: 28, objectFit: 'contain', borderRadius: 4, background: '#f1f5f9', padding: '2px 6px' }} />
              } />
            )}
          </DrawerSection>

          {/* 2. Abonnement */}
          <DrawerSection title="Abonnement">
            <DrawerRow label="Plan"          value={<PlanBadge plan={sub?.plan || 'trial'} />} />
            <DrawerRow label="Status"        value={<StatusBadge status={sub?.status || 'trial'} />} />
            <DrawerRow label="Prijs"         value={`€${sub?.pricePerMonth ?? 0} / maand`} />
            <DrawerRow label="Gestart op"    value={fmtDate(sub?.startedAt)} />
            {(!sub || sub.plan === 'trial') && (
              <DrawerRow label="Trial eindigt" value={fmtDate(sub?.trialEndsAt)} />
            )}
          </DrawerSection>

          {/* 3. Teamleden */}
          <DrawerSection title={`Teamleden (${company.memberCount})`}>
            {(company.members || []).length === 0 && (
              <div style={{ color: '#9ca3af', fontSize: 13 }}>Geen teamleden</div>
            )}
            {(company.members || []).map(m => (
              <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%', background: '#e5e7eb',
                  color: '#374151', fontSize: 11, fontWeight: 700,
                  display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                }}>
                  {memberInitials(m.fullName || m.email)}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, fontSize: 13 }}>{m.fullName || '—'}</span>
                    <span style={{ fontSize: 10, fontWeight: 600, color: '#6b7280', background: '#f1f5f9', padding: '1px 6px', borderRadius: 99 }}>{m.role}</span>
                    {m.isSuperAdmin && (
                      <span style={{ fontSize: 10, fontWeight: 700, color: '#6366f1', background: '#eef2ff', padding: '1px 6px', borderRadius: 99 }}>super admin</span>
                    )}
                  </div>
                  <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 1 }}>{m.email}</div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <div style={{ fontSize: 11, color: '#6b7280' }}>{fmtRelative(m.lastLogin)}</div>
                  <div style={{ fontSize: 10, color: '#c4c8d0', marginTop: 1 }}>lid sinds {fmtDate(m.createdAt)}</div>
                </div>
              </div>
            ))}
          </DrawerSection>

          {/* 4. Statistieken */}
          <DrawerSection title="Statistieken">
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
              {[
                { label: 'Klanten',    value: stat.klanten    ?? 0 },
                { label: 'Projecten',  value: stat.projecten  ?? 0 },
                { label: 'Offertes',   value: stat.offertes   ?? 0 },
                { label: 'Facturen',   value: stat.facturen   ?? 0 },
                { label: 'Werkbonnen', value: stat.werkbonnen ?? 0 },
                { label: 'Omzet',      value: fmtEuro(stat.omzet), wide: true },
              ].map(s => (
                <div key={s.label} style={{ background: '#f8f9fa', borderRadius: 8, padding: '10px 12px', gridColumn: s.wide ? 'span 3' : undefined }}>
                  <div style={{ fontSize: 10, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: '#111', lineHeight: 1 }}>{s.value}</div>
                </div>
              ))}
            </div>
            {stat.laatsteActiviteit && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#9ca3af' }}>
                Laatste activiteit: {fmtDate(stat.laatsteActiviteit)} ({fmtRelative(stat.laatsteActiviteit)})
              </div>
            )}
          </DrawerSection>

          {/* 5. Notities */}
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
              <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 4 }}>Geen abonnement gekoppeld aan dit bedrijf.</div>
            )}
          </DrawerSection>

        </div>
      </div>
    </>
  )
}

// ── Herbruikbare drawer primitieven ──────────────────────────
function DrawerSection({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function DrawerRow({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
      <span style={{ color: '#6b7280', flexShrink: 0, marginRight: 16 }}>{label}</span>
      <span style={{ fontWeight: 500, textAlign: 'right', maxWidth: '60%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{value}</span>
    </div>
  )
}
