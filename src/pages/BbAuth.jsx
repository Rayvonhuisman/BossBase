import React, { useState } from 'react';
import { I, Logo } from '../bb-shared.jsx';
import { loginWithEmail, registerWithEmail, resetPasswordForEmail, resendVerificationEmail } from '../services/authService.js';
import { PasswordRequirements, PasswordMatch, passwordValid } from '../components/PasswordStrength.jsx';

const TRADES = [
  { icon: '🖌️', label: 'Schilder' }, { icon: '🌿', label: 'Hovenier' },
  { icon: '🔨', label: 'Aannemer' }, { icon: '🪟', label: 'Kozijnen' },
  { icon: '🔧', label: 'Installateur' }, { icon: '🏠', label: 'Dakdekker' },
  { icon: '🚿', label: 'Loodgieter' }, { icon: '⚡', label: 'Elektricien' },
  { icon: '🧹', label: 'Schoonmaak' }, { icon: '🏗️', label: 'Anders' },
];

export function LoginPage({ onLogin, onRegister }) {
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [unconfirmed, setUnconfirmed] = useState(false); // email not confirmed yet
  // forgot password state: null | 'form' | 'sent'
  const [forgot, setForgot] = useState(null);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotError, setForgotError] = useState('');
  const [resendLoading, setResendLoading] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setError('');
    setUnconfirmed(false);
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('Vul een geldig e-mailadres in.');
    if (!form.password) return setError('Vul je wachtwoord in.');
    setLoading(true);
    try {
      await loginWithEmail(form.email, form.password);
      onLogin();
    } catch (err) {
      const msg = err.message || '';
      if (/not confirmed|email.*confirm/i.test(msg)) {
        setUnconfirmed(true);
      } else {
        setError(msg || 'Inloggen is mislukt.');
      }
    } finally {
      setLoading(false);
    }
  };

  const sendReset = async () => {
    setForgotError('');
    if (!/^\S+@\S+\.\S+$/.test(forgotEmail)) return setForgotError('Vul een geldig e-mailadres in.');
    setForgotLoading(true);
    try {
      await resetPasswordForEmail(forgotEmail);
      setForgot('sent');
    } catch (err) {
      setForgotError(err.message || 'Versturen mislukt.');
    } finally {
      setForgotLoading(false);
    }
  };

  const resendConfirmation = async () => {
    setResendLoading(true);
    try {
      await resendVerificationEmail(form.email);
      setError('');
      setUnconfirmed(false);
      setError('Verificatiemail opnieuw verstuurd. Check je inbox.');
    } catch {
      // ignore
    } finally {
      setResendLoading(false);
    }
  };

  // ── Forgot: bevestiging verstuurd ────────────────────────────────────────
  if (forgot === 'sent') {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <div className="auth-title" style={{ marginBottom: 6 }}>Check je e-mail</div>
            <div className="auth-sub">
              We hebben een resetlink gestuurd naar <strong>{forgotEmail}</strong>.
              Klik op de link in de mail om je wachtwoord opnieuw in te stellen.
            </div>
          </div>
          <div className="auth-link" style={{ textAlign: 'center' }}>
            <a href="#" onClick={e => { e.preventDefault(); setForgot(null); }}>
              Terug naar inloggen
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Forgot: e-mailinvoer ─────────────────────────────────────────────────
  if (forgot === 'form') {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div className="auth-title">Wachtwoord vergeten</div>
          <div className="auth-sub">
            Vul je e-mailadres in en we sturen je een resetlink.
          </div>
          <div className="auth-field">
            <label>E-mailadres</label>
            <input
              type="email"
              value={forgotEmail}
              onChange={e => setForgotEmail(e.target.value)}
              placeholder="je@bedrijf.nl"
              autoFocus
              onKeyDown={e => { if (e.key === 'Enter') sendReset(); }}
            />
          </div>
          {forgotError && (
            <div style={{ color: '#dc2626', fontSize: '.78rem', fontWeight: 600, marginBottom: 10 }}>
              {forgotError}
            </div>
          )}
          <button className="auth-submit" onClick={sendReset} disabled={forgotLoading}>
            {forgotLoading ? 'Versturen…' : 'Stuur resetlink →'}
          </button>
          <div className="auth-link">
            <a href="#" onClick={e => { e.preventDefault(); setForgot(null); }}>
              Terug naar inloggen
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Normaal inlogscherm ──────────────────────────────────────────────────
  return (
    <div className="auth-shell">
      <div className="auth-card afu">
        <div className="auth-logo"><Logo /></div>
        <div className="auth-title">Welkom terug</div>
        <div className="auth-sub">
          Beheer klanten, offertes, jobs en omzet<br />
          vanuit één eenvoudig dashboard.
        </div>
        <div className="auth-field">
          <label>E-mailadres</label>
          <input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="je@bedrijf.nl" />
        </div>
        <div className="auth-field">
          <label>Wachtwoord</label>
          <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••"
            onKeyDown={e => { if (e.key === 'Enter') submit(); }} />
        </div>
        {unconfirmed ? (
          <div style={{ background: '#fef9c3', border: '1px solid #fde68a', borderRadius: 8, padding: '10px 14px', marginBottom: 12, fontSize: '.8rem', color: '#92400e' }}>
            <strong>E-mail nog niet bevestigd.</strong> Check je inbox voor de verificatiemail.
            <br />
            <button onClick={resendLoading ? undefined : resendConfirmation} disabled={resendLoading}
              style={{ marginTop: 6, background: 'none', border: 'none', padding: 0, color: '#92400e', textDecoration: 'underline', cursor: 'pointer', fontSize: '.8rem', fontWeight: 600 }}>
              {resendLoading ? 'Versturen…' : 'Verificatiemail opnieuw sturen'}
            </button>
          </div>
        ) : error ? (
          <div style={{ color: '#dc2626', fontSize: '.78rem', fontWeight: 600, marginBottom: 10 }}>{error}</div>
        ) : null}
        <div style={{ textAlign: 'right', marginBottom: 4 }}>
          <a href="#" onClick={e => { e.preventDefault(); setForgotEmail(form.email); setForgot('form'); }}
            style={{ fontSize: '.78rem', color: 'var(--pd)', fontWeight: 600 }}>
            Wachtwoord vergeten?
          </a>
        </div>
        <button className="auth-submit" onClick={submit} disabled={loading}>{loading ? 'Bezig...' : 'Inloggen →'}</button>
        <div className="auth-divider"><span>of</span></div>
        <div className="auth-link">
          Nog geen account? <a href="#" onClick={e => { e.preventDefault(); onRegister(); }}>Gratis aanmelden</a>
        </div>
      </div>
    </div>
  );
}

export function RegisterFlow({ onDone, onBack }) {
  const [step, setStep] = useState(0);
  const [trade, setTrade] = useState('');
  const [setup, setSetup] = useState('');
  const [form, setForm] = useState({ fullName: '', email: '', password: '', password2: '', companyName: '', phone: '', kvk: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [needsConfirmation, setNeedsConfirmation] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const steps = ['Account', 'Bedrijf', 'Setup', 'Team'];
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validateAccount = () => {
    if (!form.fullName.trim()) return 'Vul je volledige naam in.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Vul een geldig e-mailadres in.';
    if (!form.password) return 'Vul een wachtwoord in.';
    if (!passwordValid(form.password)) return 'Vul een wachtwoord in dat aan alle vereisten voldoet.';
    if (!form.password2) return 'Herhaal je wachtwoord.';
    if (form.password !== form.password2) return 'Wachtwoorden komen niet overeen.';
    return '';
  };

  const step0Valid = form.fullName.trim() &&
    /^\S+@\S+\.\S+$/.test(form.email) &&
    passwordValid(form.password) &&
    form.password === form.password2 &&
    form.password2.length > 0;

  const validateCompany = () => {
    if (!form.companyName.trim()) return 'Vul je bedrijfsnaam in.';
    return '';
  };

  const next = () => {
    const msg = step === 0 ? validateAccount() : step === 1 ? validateCompany() : '';
    if (msg) {
      setError(msg);
      return;
    }
    setError('');
    setStep(s => s + 1);
  };

  const submit = async () => {
    const msg = validateAccount() || validateCompany();
    if (msg) {
      setError(msg);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const result = await registerWithEmail({ ...form, trade });
      if (result?.requiresConfirmation) {
        setNeedsConfirmation(true);
      } else {
        onDone();
      }
    } catch (err) {
      setError(err.message || 'Registreren is mislukt.');
    } finally {
      setLoading(false);
    }
  };

  const resendConfirmation = async () => {
    setResendLoading(true);
    try { await resendVerificationEmail(form.email); } catch { /* ignore */ }
    finally { setResendLoading(false); }
  };

  const stepTitles = ['Maak je account aan', 'Vertel over je bedrijf', 'Hoe werk je?', 'Nodig je team uit'];
  const stepSubs = [
    'Naam, e-mail en wachtwoord — klaar.',
    'We passen BossBase aan op jouw branche.',
    'Solo of met een team? We zetten alles goed.',
    'Optioneel — je kunt dit later ook doen.',
  ];

  const StepDots = () => (
    <div className="onboard-steps">
      {steps.map((s, i) => (
        <React.Fragment key={i}>
          <div className={`onboard-step-dot ${i < step ? 'done' : i === step ? 'active' : 'todo'}`}>
            {i < step ? I.check : i + 1}
          </div>
          {i < steps.length - 1 && <div className={`onboard-step-line ${i < step ? 'done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );

  if (needsConfirmation) {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📬</div>
            <div className="auth-title" style={{ marginBottom: 6 }}>Bevestig je e-mailadres</div>
            <div className="auth-sub">
              We hebben een verificatiemail gestuurd naar <strong>{form.email}</strong>.
              Klik op de link in de mail om je account te activeren.
            </div>
          </div>
          <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 9, padding: '12px 16px', fontSize: '.82rem', color: '#166534', marginBottom: 16, lineHeight: 1.6 }}>
            Geen mail ontvangen? Check ook je spammap. De mail kan soms even duren.
          </div>
          <button className="btn btn-s" style={{ width: '100%', justifyContent: 'center', marginBottom: 10 }}
            onClick={resendConfirmation} disabled={resendLoading}>
            {resendLoading ? 'Versturen…' : 'Verificatiemail opnieuw sturen'}
          </button>
          <div className="auth-link" style={{ textAlign: 'center' }}>
            <a href="#" onClick={e => { e.preventDefault(); onBack(); }}>Terug naar inloggen</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card afu" style={{ maxWidth: 480 }}>
        <div className="auth-logo"><Logo /></div>
        <StepDots />
        <div className="auth-title">{stepTitles[step]}</div>
        <div className="auth-sub">{stepSubs[step]}</div>

        {step === 0 && (
          <>
            <div className="auth-field"><label>Volledige naam</label><input value={form.fullName} onChange={e => set('fullName', e.target.value)} placeholder="Marco Veldhuis" /></div>
            <div className="auth-field"><label>E-mailadres</label><input type="email" value={form.email} onChange={e => set('email', e.target.value)} placeholder="marco@veldhuis.nl" /></div>
            <div className="auth-field">
              <label>Wachtwoord</label>
              <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 8 tekens" />
              <PasswordRequirements password={form.password} />
            </div>
            <div className="auth-field">
              <label>Herhaal wachtwoord</label>
              <input type="password" value={form.password2} onChange={e => set('password2', e.target.value)} placeholder="Nogmaals je wachtwoord" />
              <PasswordMatch password={form.password} password2={form.password2} />
            </div>
          </>
        )}
        {step === 1 && (
          <>
            <div className="auth-field"><label>Bedrijfsnaam</label><input value={form.companyName} onChange={e => set('companyName', e.target.value)} placeholder="Veldhuis Schilderwerken" /></div>
            <div style={{ marginBottom: 8 }}>
              <div className="auth-field" style={{ marginBottom: 8 }}><label>Branche</label></div>
              <div className="trade-grid">
                {TRADES.map(t => (
                  <button key={t.label} className={`trade-option${trade === t.label ? ' selected' : ''}`} onClick={() => setTrade(t.label)}>
                    <span>{t.icon}</span>{t.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="auth-field"><label>Telefoon</label><input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="06-12345678" /></div>
            <div className="auth-field"><label>KvK-nummer</label><input value={form.kvk} onChange={e => set('kvk', e.target.value)} placeholder="12345678" /></div>
          </>
        )}
        {step === 2 && (
          <div className="setup-options">
            <button className={`setup-option${setup === 'solo' ? ' selected' : ''}`} onClick={() => setSetup('solo')}>
              <div className="setup-option-icon">👤</div>
              <div>
                <div className="setup-option-label">Ik werk alleen (zzp)</div>
                <div className="setup-option-sub">Je doet alles zelf — offertes, planning, uitvoering en administratie.</div>
              </div>
            </button>
            <button className={`setup-option${setup === 'team' ? ' selected' : ''}`} onClick={() => setSetup('team')}>
              <div className="setup-option-icon">👥</div>
              <div>
                <div className="setup-option-label">Ik werk met een team</div>
                <div className="setup-option-sub">Je hebt medewerkers of onderaannemers aan wie je werk toewijst.</div>
              </div>
            </button>
          </div>
        )}
        {step === 3 && (
          <>
            <div style={{ marginBottom: 14, padding: 12, background: 'var(--bgs)', borderRadius: 'var(--r8)', border: '1px solid var(--border)', fontSize: '.8rem', color: 'var(--dmu)' }}>
              Medewerkers ontvangen een uitnodiging per e-mail en kunnen na acceptatie inloggen.
            </div>
            <div className="auth-field"><label>Naam medewerker</label><input placeholder="Remco Smit" /></div>
            <div className="auth-field"><label>E-mailadres</label><input type="email" placeholder="remco@veldhuis.nl" /></div>
            <div className="auth-field">
              <label>Rol</label>
              <select><option>Medewerker</option><option>Admin</option></select>
            </div>
            <button className="btn btn-s btn-sm" style={{ width: '100%', justifyContent: 'center', marginBottom: 8 }}>
              {I.plus} Nog een medewerker toevoegen
            </button>
          </>
        )}
        {error && <div style={{ color: '#dc2626', fontSize: '.78rem', fontWeight: 600, marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {step > 0 && <button className="btn btn-s" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep(s => s - 1)}>Terug</button>}
          {step < 3
            ? <button className="auth-submit" style={{ flex: 1 }} onClick={next} disabled={step === 0 && !step0Valid}>Volgende →</button>
            : <button className="auth-submit" style={{ flex: 1 }} onClick={submit} disabled={loading}>{loading ? 'Bezig...' : 'BossBase starten 🚀'}</button>
          }
        </div>
        {step === 3 && (
          <div className="auth-link">
            <a href="#" onClick={e => { e.preventDefault(); submit(); }}>Overslaan, later doen</a>
          </div>
        )}
        {step === 0 && (
          <div className="auth-link">
            Al een account? <a href="#" onClick={e => { e.preventDefault(); onBack(); }}>Inloggen</a>
          </div>
        )}
      </div>
    </div>
  );
}
