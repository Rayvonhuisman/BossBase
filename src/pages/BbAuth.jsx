import React, { useState, useEffect } from 'react';
import { Logo } from '../bb-shared.jsx';
import {
  Paintbrush, Trees, Hammer, AppWindow, Plug, Home, ShowerHead, Zap, Sparkles, HardHat,
  MailCheck, Rocket, User, Users, Check, Plus,
} from 'lucide-react';
import { loginWithEmail, registerWithEmail, requestPasswordReset, resendVerificationEmail, requestVerificationCode, verifyCode, vertaalAuthFout } from '../services/authService.js';
import { PasswordRequirements, PasswordMatch, passwordValid } from '../components/PasswordStrength.jsx';

const TRADES = [
  { Icon: Paintbrush, label: 'Schilder' }, { Icon: Trees, label: 'Hovenier' },
  { Icon: Hammer, label: 'Aannemer' }, { Icon: AppWindow, label: 'Kozijnen' },
  { Icon: Plug, label: 'Installateur' }, { Icon: Home, label: 'Dakdekker' },
  { Icon: ShowerHead, label: 'Loodgieter' }, { Icon: Zap, label: 'Elektricien' },
  { Icon: Sparkles, label: 'Schoonmaak' }, { Icon: HardHat, label: 'Anders' },
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
        setError(vertaalAuthFout(msg) || 'Inloggen is mislukt.');
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
      await requestPasswordReset(forgotEmail);
      setForgot('sent');
    } catch (err) {
      setForgotError(vertaalAuthFout(err.message) || 'Versturen mislukt.');
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
            <div style={{ marginBottom: 12 }}><MailCheck size={42} strokeWidth={1.6} color="var(--p)" /></div>
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

// ── E-MAILVERIFICATIE (6-cijferige code) ─────────────────────────────────────
// Herbruikt door RegisterFlow (na registratie) én door App.jsx (gating bij een
// onbevestigde sessie, bv. na page-refresh).
export function EmailVerificationScreen({ email, onVerified, onBack }) {
  const [code, setCode] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [countdown, setCountdown] = useState(60); // code is zojuist verstuurd

  useEffect(() => {
    if (countdown <= 0) return;
    const t = setTimeout(() => setCountdown(c => c - 1), 1000);
    return () => clearTimeout(t);
  }, [countdown]);

  const submit = async () => {
    if (code.length !== 6) { setError('Vul de 6-cijferige code in.'); return; }
    setLoading(true); setError('');
    try {
      const res = await verifyCode(code);
      if (res?.success) {
        await onVerified();
      } else {
        setError(res?.error || 'Code is onjuist.');
        if (res?.code === 'EXPIRED' || res?.code === 'TOO_MANY' || res?.code === 'NO_CODE') setCode('');
      }
    } catch {
      setError('Er ging iets mis. Probeer het opnieuw.');
    } finally {
      setLoading(false);
    }
  };

  const resend = async () => {
    setResendLoading(true); setError('');
    try { await requestVerificationCode(); setCountdown(60); setCode(''); }
    catch { /* stil — rate limiting geeft alsnog success terug */ }
    finally { setResendLoading(false); }
  };

  return (
    <div className="auth-shell">
      <div className="auth-card afu">
        <div className="auth-logo"><Logo /></div>
        <div style={{ textAlign: 'center', marginBottom: 18 }}>
          <div style={{ display: 'inline-flex', width: 56, height: 56, borderRadius: '50%', background: '#f0fdf4', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
            <MailCheck size={26} color="#15A34A" />
          </div>
          <div className="auth-title" style={{ marginBottom: 6 }}>Bevestig je e-mailadres</div>
          <div className="auth-sub">
            We hebben een 6-cijferige code gestuurd naar <strong>{email}</strong>.
          </div>
        </div>

        <div className="auth-field">
          <input
            value={code}
            onChange={e => { setCode(e.target.value.replace(/\D/g, '').slice(0, 6)); setError(''); }}
            onKeyDown={e => { if (e.key === 'Enter' && code.length === 6) submit(); }}
            inputMode="numeric"
            autoComplete="one-time-code"
            placeholder="••••••"
            maxLength={6}
            autoFocus
            style={{ textAlign: 'center', fontSize: '1.8rem', letterSpacing: '0.5em', fontWeight: 700, paddingLeft: '0.5em' }}
          />
        </div>

        {error && (
          <div style={{ color: '#dc2626', fontSize: '.82rem', fontWeight: 600, marginBottom: 10, textAlign: 'center' }}>{error}</div>
        )}

        <button className="auth-submit" onClick={submit} disabled={loading || code.length !== 6} style={{ width: '100%' }}>
          {loading ? 'Verifiëren…' : 'Verifiëren'}
        </button>

        <div style={{ textAlign: 'center', marginTop: 14, fontSize: '.82rem', color: 'var(--dmu)' }}>
          {countdown > 0 ? (
            <span>Geen code ontvangen? Opnieuw versturen kan over {countdown}s</span>
          ) : (
            <button
              onClick={resend}
              disabled={resendLoading}
              style={{ background: 'none', border: 'none', color: 'var(--p)', fontWeight: 600, cursor: 'pointer', padding: 0 }}
            >
              {resendLoading ? 'Versturen…' : 'Code opnieuw versturen'}
            </button>
          )}
        </div>

        {onBack && (
          <div className="auth-link" style={{ textAlign: 'center', marginTop: 10 }}>
            <a href="#" onClick={e => { e.preventDefault(); onBack(); }}>Terug naar inloggen</a>
          </div>
        )}
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
  const [needsVerification, setNeedsVerification] = useState(false);
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
      if (result?.requiresVerification) {
        setNeedsVerification(true);
      } else if (result?.requiresConfirmation) {
        setNeedsConfirmation(true);
      } else {
        onDone();
      }
    } catch (err) {
      setError(vertaalAuthFout(err.message) || 'Registreren is mislukt.');
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
            {i < step ? <Check size={14} strokeWidth={2.5} /> : i + 1}
          </div>
          {i < steps.length - 1 && <div className={`onboard-step-line ${i < step ? 'done' : ''}`} />}
        </React.Fragment>
      ))}
    </div>
  );

  if (needsVerification) {
    return <EmailVerificationScreen email={form.email} onVerified={onDone} onBack={onBack} />;
  }

  if (needsConfirmation) {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ marginBottom: 12 }}><MailCheck size={42} strokeWidth={1.6} color="var(--p)" /></div>
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
                    <t.Icon size={18} strokeWidth={1.8} style={{ flexShrink: 0 }} />{t.label}
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
              <div className="setup-option-icon"><User size={20} strokeWidth={2} /></div>
              <div>
                <div className="setup-option-label">Ik werk alleen (zzp)</div>
                <div className="setup-option-sub">Je doet alles zelf — offertes, planning, uitvoering en administratie.</div>
              </div>
            </button>
            <button className={`setup-option${setup === 'team' ? ' selected' : ''}`} onClick={() => setSetup('team')}>
              <div className="setup-option-icon"><Users size={20} strokeWidth={2} /></div>
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
              <Plus size={15} strokeWidth={2} /> Nog een medewerker toevoegen
            </button>
          </>
        )}
        {error && <div style={{ color: '#dc2626', fontSize: '.78rem', fontWeight: 600, marginTop: 10 }}>{error}</div>}
        <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
          {step > 0 && <button className="btn btn-s" style={{ flex: 1, justifyContent: 'center' }} onClick={() => setStep(s => s - 1)}>Terug</button>}
          {step < 3
            ? <button className="auth-submit" style={{ flex: 1 }} onClick={next} disabled={step === 0 && !step0Valid}>Volgende →</button>
            : <button className="auth-submit" style={{ flex: 1 }} onClick={submit} disabled={loading}>{loading ? 'Bezig...' : <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7 }}>BossBase starten <Rocket size={16} strokeWidth={1.8} /></span>}</button>
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
