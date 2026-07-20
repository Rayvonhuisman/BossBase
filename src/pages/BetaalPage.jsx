import { useState, useEffect } from 'react';
import { Logo } from '../bb-shared.jsx';
import { supabase } from '../lib/supabase.js';

// Publieke tussenpagina achter de permanente betaallink /betaal/<token> (geen
// login). Roept stripe-pay-link aan; die bepaalt server-side de actie en maakt bij
// een openstaande factuur een VERSE Checkout Session. De klant wordt dan direct
// doorgestuurd. Andere uitkomsten (al betaald / niet beschikbaar / ongeldig)
// tonen een nette melding in de branding van het bedrijf, met fallback.

const CheckIcon = (
  <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <path d="M20 6L9 17l-5-5" />
  </svg>
);
const InfoIcon = (
  <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
    <circle cx="12" cy="12" r="10" /><path d="M12 16v-4M12 8h.01" />
  </svg>
);
const Spinner = (
  <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" style={{ animation: 'bbspin 0.8s linear infinite' }}>
    <path d="M12 2a10 10 0 0 1 10 10" />
    <style>{'@keyframes bbspin{to{transform:rotate(360deg)}}'}</style>
  </svg>
);

export function BetaalPage({ token }) {
  const [result, setResult] = useState({ state: 'loading' });
  const [branding, setBranding] = useState(null);

  // Branding van HET BEDRIJF los ophalen via hetzelfde publieke pad als de
  // bedankpagina (get_payment_branding op het token). Zo tonen logo + kleur direct,
  // óók tijdens 'loading' en het doorsturen naar Stripe. Fallback: BossBase-huisstijl.
  useEffect(() => {
    let alive = true;
    if (!token) return;
    supabase.rpc('get_payment_branding', { p_token: token })
      .then(({ data }) => { if (alive && data && (data.logo_url || data.company_name || data.branding_color)) setBranding(data); })
      .catch(() => { /* fallback: BossBase-huisstijl */ });
    return () => { alive = false; };
  }, [token]);

  useEffect(() => {
    let alive = true;
    if (!token) { setResult({ state: 'invalid' }); return; }
    supabase.functions.invoke('stripe-pay-link', { body: { token } })
      .then(({ data, error }) => {
        if (!alive) return;
        if (error || !data) { setResult({ state: 'error' }); return; }
        if (data.state === 'redirect' && data.url) { window.location.href = data.url; return; }
        setResult(data);
      })
      .catch(() => { if (alive) setResult({ state: 'error' }); });
    return () => { alive = false; };
  }, [token]);

  // Voorkeur voor de los opgehaalde branding; anders die uit de functie-respons.
  const b = branding || result.branding || null;
  const brandColor = b?.branding_color || null;
  const accent = brandColor || 'var(--pd)';

  const header = b?.logo_url
    ? <img src={b.logo_url} alt={b.company_name || ''} style={{ maxHeight: 48, maxWidth: 220, objectFit: 'contain' }} />
    : b?.company_name
      ? <div style={{ fontSize: 20, fontWeight: 700, color: 'var(--dk)', letterSpacing: '-0.5px' }}>{b.company_name}</div>
      : <Logo />;

  const bedrijf = b?.company_name || 'het bedrijf';

  // Per uitkomst: icoon, iconkleur, titel, tekst, optionele actie.
  let icon = Spinner, iconColor = accent, title = 'Betaling voorbereiden…', text = 'Een moment geduld.', action = null;
  if (result.state === 'redirect') {
    title = 'Doorsturen…'; text = 'Je wordt doorgestuurd naar de beveiligde betaalpagina.';
  } else if (result.state === 'paid') {
    icon = CheckIcon; title = 'Deze factuur is al betaald'; text = 'Er is niets meer verschuldigd. Bedankt!';
  } else if (result.state === 'no_stripe') {
    icon = InfoIcon; iconColor = 'var(--dmu)'; title = 'Online betalen niet beschikbaar';
    text = `Online betalen is momenteel niet mogelijk. Neem contact op met ${bedrijf} om de factuur te voldoen.`;
  } else if (result.state === 'invalid') {
    icon = InfoIcon; iconColor = 'var(--dmu)'; title = 'Betaallink ongeldig';
    text = 'Deze betaallink is ongeldig of niet meer beschikbaar. Controleer de link in je e-mail.';
  } else if (result.state === 'error') {
    icon = InfoIcon; iconColor = 'var(--dmu)'; title = 'Er ging iets mis';
    text = 'De betaling kon niet worden gestart. Probeer het later opnieuw.';
    action = <button className="auth-submit" style={{ marginTop: 22 }} onClick={() => window.location.reload()}>Opnieuw proberen</button>;
  }

  return (
    <div className="auth-shell">
      <div className="auth-card afu" style={{ textAlign: 'center', maxWidth: 440 }}>
        <div className="auth-logo" style={{ marginBottom: 24 }}>{header}</div>
        <div style={{
          width: 64, height: 64, borderRadius: '50%', margin: '0 auto 18px',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: 'var(--bgs)', border: '1px solid var(--border)', color: iconColor,
        }}>
          {icon}
        </div>
        <div className="auth-title">{title}</div>
        <p style={{ color: 'var(--dm)', fontSize: '.95rem', lineHeight: 1.6, margin: '4px 0 0' }}>{text}</p>
        {action}
        <div style={{ marginTop: 22, fontSize: '.78rem', color: 'var(--dl)' }}>
          Betaling verwerkt via <a href="https://www.bossbase.nl" style={{ color: 'var(--dl)', fontWeight: 600, textDecoration: 'none' }}>BossBase</a>
        </div>
      </div>
    </div>
  );
}
