import React, { useState } from 'react';
import { I, Logo } from '../bb-shared.jsx';
import { loginWithEmail, registerWithEmail } from '../services/authService.js';

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
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const submit = async () => {
    setError('');
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return setError('Vul een geldig e-mailadres in.');
    if (!form.password) return setError('Vul je wachtwoord in.');
    setLoading(true);
    try {
      await loginWithEmail(form.email, form.password);
      onLogin();
    } catch (err) {
      setError(err.message || 'Inloggen is mislukt.');
    } finally {
      setLoading(false);
    }
  };
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
          <input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="••••••••" />
        </div>
        {error && <div style={{ color: '#dc2626', fontSize: '.78rem', fontWeight: 600, marginBottom: 10 }}>{error}</div>}
        <div style={{ textAlign: 'right', marginBottom: 4 }}>
          <a href="#" style={{ fontSize: '.78rem', color: 'var(--pd)', fontWeight: 600 }}>Wachtwoord vergeten?</a>
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
  const [form, setForm] = useState({ fullName: '', email: '', password: '', companyName: '', phone: '', kvk: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const steps = ['Account', 'Bedrijf', 'Setup', 'Team'];
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const validateAccount = () => {
    if (!form.fullName.trim()) return 'Vul je volledige naam in.';
    if (!/^\S+@\S+\.\S+$/.test(form.email)) return 'Vul een geldig e-mailadres in.';
    if (!form.password) return 'Vul een wachtwoord in.';
    if (form.password.length < 8) return 'Gebruik minimaal 8 tekens voor je wachtwoord.';
    return '';
  };

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
      await registerWithEmail({ ...form, trade });
      onDone();
    } catch (err) {
      setError(err.message || 'Registreren is mislukt.');
    } finally {
      setLoading(false);
    }
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
            <div className="auth-field"><label>Wachtwoord</label><input type="password" value={form.password} onChange={e => set('password', e.target.value)} placeholder="Min. 8 tekens" /></div>
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
            ? <button className="auth-submit" style={{ flex: 1 }} onClick={next}>Volgende →</button>
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
