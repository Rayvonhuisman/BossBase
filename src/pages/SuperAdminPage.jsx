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
  { id: 'actief',      label: 'Actief',      color: '#16a34a', bg: '#f0fdf4' },
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

const menuItemStyle = {
  display: 'block', width: '100%', padding: '9px 14px',
  background: 'none', border: 'none', cursor: 'pointer',
  fontSize: 13, textAlign: 'left', color: '#111',
}

export function SuperAdminPage({ navigate }) {
  const [companies, setCompanies] = useState([])
  const [loading,   setLoading]   = useState(true)
  const [error,     setError]     = useState('')
  const [menuOpen,  setMenuOpen]  = useState(null)  // company id
  const [menuMode,  setMenuMode]  = useState(null)  // null | 'plan' | 'status'
  const [drawer,    setDrawer]    = useState(null)  // company object
  const [drawerNotes, setDrawerNotes] = useState('')
  const [saving,    setSaving]    = useState(false)
  const menuRef = useRef(null)

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('super-admin-data')
      if (fnErr) throw new Error(fnErr.message)
      if (data?.error) throw new Error(data.error)
      setCompanies(data.companies || [])
    } catch (err) {
      setError(err.message || 'Laden mislukt')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  // Sluit menu bij klik buiten
  useEffect(() => {
    if (!menuOpen) return
    const handler = e => {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setMenuOpen(null)
        setMenuMode(null)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [menuOpen])

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
      setMenuOpen(null)
      setMenuMode(null)
      await load()
    } catch (err) {
      alert('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleStatusSelect = async (company, status) => {
    setSaving(true)
    try {
      const { error: compErr } = await supabase.from('companies')
        .update({ status })
        .eq('id', company.id)
      if (compErr) throw compErr

      if (company.subscription?.id) {
        await supabase.from('subscriptions')
          .update({ status })
          .eq('id', company.subscription.id)
      }
      setMenuOpen(null)
      setMenuMode(null)
      await load()
    } catch (err) {
      alert('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const handleSaveNotes = async () => {
    if (!drawer) return
    setSaving(true)
    try {
      if (drawer.subscription?.id) {
        const { error } = await supabase.from('subscriptions')
          .update({ notes: drawerNotes })
          .eq('id', drawer.subscription.id)
        if (error) throw error
      }
      setDrawer(prev => prev ? { ...prev, subscription: { ...prev.subscription, notes: drawerNotes } } : prev)
      await load()
    } catch (err) {
      alert('Opslaan mislukt: ' + err.message)
    } finally {
      setSaving(false)
    }
  }

  const openDrawer = company => {
    setDrawer(company)
    setDrawerNotes(company.subscription?.notes || '')
    setMenuOpen(null)
    setMenuMode(null)
  }

  const totalCompanies = companies.length
  const activeCount    = companies.filter(c => c.subscription?.status === 'actief').length
  const trialCount     = companies.filter(c => !c.subscription || c.subscription.status === 'trial').length
  const mrr = companies.reduce((sum, c) => {
    if (c.subscription?.status === 'actief') return sum + (Number(c.subscription.pricePerMonth) || 0)
    return sum
  }, 0)

  return (
    <div style={{ minHeight: '100dvh', background: '#f8f9fa' }}>

      {/* ── Header ─────────────────────────────────── */}
      <header style={{
        background: '#0D0D0D', height: 60,
        padding: '0 28px', display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span style={{ color: '#1DDB62', fontWeight: 800, fontSize: 17, letterSpacing: '-.3px' }}>BossBase</span>
          <span style={{ color: '#333', fontSize: 15 }}>|</span>
          <span style={{ color: '#9ca3af', fontSize: 13, fontWeight: 500 }}>Admin</span>
        </div>
        <button
          onClick={() => navigate('/dashboard')}
          style={{
            background: 'none', border: '1px solid #2a2a2a', color: '#9ca3af',
            padding: '6px 14px', borderRadius: 6, cursor: 'pointer', fontSize: 13,
          }}
        >
          ← Dashboard
        </button>
      </header>

      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '28px 20px' }}>

        {/* ── Stats ──────────────────────────────────── */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
          {[
            { label: 'Bedrijven',  value: totalCompanies, accent: '#1DDB62' },
            { label: 'Actief',     value: activeCount,    accent: '#16a34a' },
            { label: 'Trial',      value: trialCount,     accent: '#d97706' },
            { label: 'MRR',        value: `€${mrr}`,      accent: '#6366f1' },
          ].map(card => (
            <div key={card.label} className="card" style={{ padding: '18px 20px' }}>
              <div style={{ fontSize: 11, fontWeight: 700, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 6 }}>
                {card.label}
              </div>
              <div style={{ fontSize: 26, fontWeight: 800, color: card.accent, lineHeight: 1 }}>
                {card.value}
              </div>
            </div>
          ))}
        </div>

        {/* ── Tabel ──────────────────────────────────── */}
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ fontWeight: 700, fontSize: 14 }}>Bedrijven</div>
            <button className="btn btn-ghost btn-s" onClick={load} disabled={loading}>
              {loading ? 'Laden…' : 'Vernieuwen'}
            </button>
          </div>

          {error && (
            <div style={{ padding: '16px 20px', color: '#dc2626', fontSize: 13 }}>Fout: {error}</div>
          )}

          {!error && (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr>
                    {['Bedrijfsnaam', 'Email', 'Plan', 'Status', 'Leden', 'Aangemaakt', 'Laatste login', ''].map(h => (
                      <th key={h} style={{
                        padding: '9px 14px', textAlign: 'left',
                        fontWeight: 600, fontSize: 11, color: '#9ca3af',
                        textTransform: 'uppercase', letterSpacing: '.05em',
                        background: '#f8f9fa', borderBottom: '1px solid var(--border)',
                        whiteSpace: 'nowrap',
                      }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading && (
                    <tr>
                      <td colSpan={8} style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af' }}>Laden…</td>
                    </tr>
                  )}
                  {!loading && companies.length === 0 && (
                    <tr>
                      <td colSpan={8} style={{ padding: '32px 20px', textAlign: 'center', color: '#9ca3af' }}>Geen bedrijven</td>
                    </tr>
                  )}
                  {companies.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '11px 14px', fontWeight: 600 }}>{c.name}</td>
                      <td style={{ padding: '11px 14px', color: '#6b7280' }}>{c.email || '—'}</td>
                      <td style={{ padding: '11px 14px' }}><PlanBadge plan={c.subscription?.plan || 'trial'} /></td>
                      <td style={{ padding: '11px 14px' }}><StatusBadge status={c.status || 'actief'} /></td>
                      <td style={{ padding: '11px 14px', textAlign: 'center' }}>{c.memberCount}</td>
                      <td style={{ padding: '11px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtDate(c.createdAt)}</td>
                      <td style={{ padding: '11px 14px', color: '#6b7280', whiteSpace: 'nowrap' }}>{fmtRelative(c.lastLogin)}</td>
                      <td style={{ padding: '11px 14px' }}>
                        <div style={{ position: 'relative' }} ref={menuOpen === c.id ? menuRef : null}>
                          <button
                            className="btn btn-ghost btn-xs"
                            disabled={saving}
                            onClick={() => {
                              if (menuOpen === c.id) { setMenuOpen(null); setMenuMode(null) }
                              else { setMenuOpen(c.id); setMenuMode(null) }
                            }}
                            style={{ padding: '3px 9px', fontWeight: 700, letterSpacing: 2 }}
                          >
                            ···
                          </button>

                          {menuOpen === c.id && (
                            <div style={{
                              position: 'absolute', right: 0, top: 'calc(100% + 4px)', zIndex: 50,
                              background: '#fff', border: '1px solid var(--border)',
                              borderRadius: 8, boxShadow: '0 4px 24px rgba(0,0,0,.12)',
                              minWidth: 190, overflow: 'hidden',
                            }}>
                              {menuMode === 'plan' && (
                                <>
                                  <div style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af', borderBottom: '1px solid var(--border)' }}>
                                    Plan kiezen
                                  </div>
                                  {PLANS.map(p => (
                                    <button key={p.id}
                                      style={{ ...menuItemStyle, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
                                      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                      onClick={() => handlePlanSelect(c, p.id)}
                                    >
                                      <span>{p.label}</span>
                                      <span style={{ color: '#9ca3af', fontSize: 12 }}>€{p.price}/m</span>
                                    </button>
                                  ))}
                                </>
                              )}

                              {menuMode === 'status' && (
                                <>
                                  <div style={{ padding: '7px 14px', fontSize: 11, fontWeight: 700, color: '#9ca3af', borderBottom: '1px solid var(--border)' }}>
                                    Status wijzigen
                                  </div>
                                  {STATUSES.map(s => (
                                    <button key={s.id}
                                      style={menuItemStyle}
                                      onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                      onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                      onClick={() => handleStatusSelect(c, s.id)}
                                    >
                                      <StatusBadge status={s.id} />
                                    </button>
                                  ))}
                                </>
                              )}

                              {!menuMode && (
                                <>
                                  <button style={menuItemStyle}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    onClick={() => setMenuMode('plan')}
                                  >
                                    Plan wijzigen →
                                  </button>
                                  <button style={menuItemStyle}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    onClick={() => setMenuMode('status')}
                                  >
                                    Status wijzigen →
                                  </button>
                                  <button style={menuItemStyle}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f8f9fa'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    onClick={() => openDrawer(c)}
                                  >
                                    Notitie toevoegen
                                  </button>
                                  <button style={{ ...menuItemStyle, color: '#1DDB62', fontWeight: 600 }}
                                    onMouseEnter={e => e.currentTarget.style.background = '#f0fdf4'}
                                    onMouseLeave={e => e.currentTarget.style.background = 'none'}
                                    onClick={() => openDrawer(c)}
                                  >
                                    Details bekijken
                                  </button>
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

      {/* ── Details drawer ─────────────────────────── */}
      {drawer && (
        <>
          <div
            style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.45)', zIndex: 200 }}
            onClick={() => setDrawer(null)}
          />
          <div style={{
            position: 'fixed', top: 0, right: 0, bottom: 0, width: 480,
            background: '#fff', zIndex: 201, overflowY: 'auto',
            boxShadow: '-6px 0 32px rgba(0,0,0,.15)',
          }}>
            {/* Drawer header */}
            <div style={{ padding: '18px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, background: '#fff', zIndex: 1 }}>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{drawer.name}</div>
              <button className="btn btn-ghost btn-s" onClick={() => setDrawer(null)}>✕</button>
            </div>

            <div style={{ padding: '20px 24px' }}>

              {/* Bedrijfsgegevens */}
              <Section title="Bedrijfsgegevens">
                {[
                  ['Naam', drawer.name],
                  ['E-mail', drawer.email || '—'],
                  ['Stad', drawer.city || '—'],
                  ['KVK', drawer.kvk || '—'],
                  ['Status', <StatusBadge status={drawer.status || 'actief'} />],
                  ['Aangemaakt', fmtDate(drawer.createdAt)],
                ].map(([k, v]) => <Row key={k} label={k} value={v} />)}
              </Section>

              {/* Abonnement */}
              <Section title="Abonnement">
                {[
                  ['Plan', <PlanBadge plan={drawer.subscription?.plan || 'trial'} />],
                  ['Status', <StatusBadge status={drawer.subscription?.status || 'trial'} />],
                  ['Prijs', `€${drawer.subscription?.pricePerMonth ?? 0} / maand`],
                  ['Trial eindigt', fmtDate(drawer.subscription?.trialEndsAt)],
                ].map(([k, v]) => <Row key={k} label={k} value={v} />)}
              </Section>

              {/* Teamleden */}
              <Section title={`Teamleden (${drawer.memberCount})`}>
                {(drawer.members || []).length === 0 && (
                  <div style={{ color: '#9ca3af', fontSize: 13 }}>Geen teamleden</div>
                )}
                {(drawer.members || []).map(m => (
                  <div key={m.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{m.fullName || m.email || '—'}</div>
                      <div style={{ color: '#9ca3af', fontSize: 11, marginTop: 1 }}>
                        {m.email} · {m.role}
                      </div>
                    </div>
                    <div style={{ color: '#9ca3af', fontSize: 11, whiteSpace: 'nowrap' }}>
                      {fmtRelative(m.lastLogin)}
                    </div>
                  </div>
                ))}
              </Section>

              {/* Notities */}
              <Section title="Notities">
                <textarea
                  value={drawerNotes}
                  onChange={e => setDrawerNotes(e.target.value)}
                  placeholder="Interne notitie over dit account…"
                  style={{
                    width: '100%', minHeight: 96, padding: '10px 12px',
                    border: '1px solid var(--border)', borderRadius: 8,
                    fontSize: 13, resize: 'vertical', boxSizing: 'border-box',
                    fontFamily: 'inherit',
                  }}
                />
                <button
                  className="btn btn-p btn-s"
                  onClick={handleSaveNotes}
                  disabled={saving}
                  style={{ marginTop: 8 }}
                >
                  {saving ? 'Opslaan…' : 'Notitie opslaan'}
                </button>
              </Section>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 28 }}>
      <div style={{ fontWeight: 700, fontSize: 11, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: 10 }}>
        {title}
      </div>
      {children}
    </div>
  )
}

function Row({ label, value }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 13 }}>
      <span style={{ color: '#6b7280' }}>{label}</span>
      <span style={{ fontWeight: 500 }}>{value}</span>
    </div>
  )
}
