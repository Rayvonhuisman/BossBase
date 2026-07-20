import { useState, useEffect } from 'react';
import { Logo } from '../bb-shared.jsx';
import { supabase } from '../lib/supabase.js';
import { readableTextColor } from '../utils/mailTemplate.js';

// Publieke bedankpagina ná een Stripe-betaling (geen login). Toont de branding van
// HET BEDRIJF waaraan betaald wordt (logo + kleur van de ondernemer), bepaald via
// de factuur-id in de URL (?factuur=<uuid>) → publieke RPC get_payment_branding.
// Lukt dat niet, dan valt de pagina terug op de neutrale BossBase-huisstijl.
//   status = 'success'   → /betaald
//   status = 'cancelled' → /betaling-geannuleerd

const CheckIcon = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const XIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M18 6L6 18M6 6l12 12" />
  </svg>
);

export function BetaalStatusPage({ status = 'success' }) {
  const success = status === 'success';
  const [branding, setBranding] = useState(null);

  useEffect(() => {
    let alive = true;
    let token = '';
    try { token = new URLSearchParams(window.location.search).get('token') || ''; } catch { /* geen params */ }
    if (!token) return;
    supabase.rpc('get_payment_branding', { p_token: token })
      .then(({ data }) => { if (alive && data && (data.logo_url || data.company_name || data.branding_color)) setBranding(data); })
      .catch(() => { /* fallback: BossBase-huisstijl */ });
    return () => { alive = false; };
  }, []);

  const brandColor = branding?.branding_color || null;
  const accent = brandColor || 'var(--pd)';

  const header = branding?.logo_url
    ? <img src={branding.logo_url} alt={branding.company_name || ''} style={{ maxHeight: 48, maxWidth: 220, objectFit: 'contain' }} />
    : branding?.company_name
      ? <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--dk)', letterSpacing: '-0.5px' }}>{branding.company_name}</div>
      : <Logo />;

  return (
    <div className="auth-shell">
      <div className="auth-card afu" style={{ textAlign: 'center', maxWidth: 440 }}>
        <div className="auth-logo" style={{ marginBottom: 24 }}>{header}</div>

        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bgs)', border: '1px solid var(--border)',
          color: success ? accent : 'var(--dmu)',
        }}>
          {success ? CheckIcon : XIcon}
        </div>

        <div className="auth-title">{success ? 'Betaling gelukt' : 'Betaling geannuleerd'}</div>
        <p style={{ color: 'var(--dm)', fontSize: '.95rem', lineHeight: 1.6, margin: '4px 0 0' }}>
          {success
            ? 'Bedankt! Je betaling is ontvangen. Je kunt dit venster sluiten.'
            : 'Je betaling is geannuleerd — er is niets afgeschreven. Je kunt het opnieuw proberen.'}
        </p>

        {!success && (
          brandColor
            ? <button
                onClick={() => window.history.back()}
                style={{ marginTop: 22, width: '100%', padding: 12, borderRadius: 'var(--r10)', fontWeight: 700, fontSize: '.95rem', border: `1.5px solid ${brandColor}`, background: brandColor, color: readableTextColor(brandColor), cursor: 'pointer' }}
              >
                Opnieuw proberen
              </button>
            : <button className="auth-submit" style={{ marginTop: 22 }} onClick={() => window.history.back()}>
                Opnieuw proberen
              </button>
        )}

        <div style={{ marginTop: 22, fontSize: '.78rem', color: 'var(--dl)' }}>
          Betaling verwerkt via <a href="https://www.bossbase.nl" style={{ color: 'var(--dl)', fontWeight: 600, textDecoration: 'none' }}>BossBase</a>
        </div>
      </div>
    </div>
  );
}
