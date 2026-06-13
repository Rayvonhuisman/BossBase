import { useEffect, useState } from 'react';
import { Logo } from '../bb-shared.jsx';
import { updatePassword } from '../services/authService.js';
import { supabase } from '../lib/supabase.js';
import { PasswordRequirements, PasswordMatch, passwordValid } from '../components/PasswordStrength.jsx';

export function ResetPasswordPage({ navigate }) {
  const [password, setPassword]   = useState('');
  const [password2, setPassword2] = useState('');
  const [ready, setReady]         = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [done, setDone]           = useState(false);

  const canSubmit = passwordValid(password) && password === password2 && password2.length > 0;

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') setReady(true);
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data?.session) setReady(true);
    });
    return () => subscription.unsubscribe();
  }, []);

  const submit = async () => {
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      await updatePassword(password);
      await supabase.auth.signOut();
      setDone(true);
    } catch (err) {
      setError(err.message || 'Opslaan mislukt.');
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
            <div className="auth-title" style={{ marginBottom: 6 }}>Wachtwoord gewijzigd</div>
            <div className="auth-sub">Je kunt nu inloggen met je nieuwe wachtwoord.</div>
          </div>
          <button className="auth-submit" onClick={() => navigate('/login')}>
            Naar inloggen →
          </button>
        </div>
      </div>
    );
  }

  if (!ready) {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div className="auth-title">Wachtwoord instellen</div>
          <div className="auth-sub" style={{ textAlign: 'center' }}>
            Bezig met verifiëren van je resetlink…
          </div>
          <div style={{ textAlign: 'center', padding: '12px 0', color: 'var(--dl)' }}>⏳</div>
          <div className="auth-link" style={{ textAlign: 'center' }}>
            <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>
              Terug naar inloggen
            </a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card afu">
        <div className="auth-logo"><Logo /></div>
        <div className="auth-title">Nieuw wachtwoord instellen</div>
        <div className="auth-sub">Kies een nieuw wachtwoord voor je account.</div>
        <div className="auth-field">
          <label>Nieuw wachtwoord</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min. 8 tekens"
            autoFocus
          />
          <PasswordRequirements password={password} />
        </div>
        <div className="auth-field">
          <label>Herhaal wachtwoord</label>
          <input
            type="password"
            value={password2}
            onChange={e => setPassword2(e.target.value)}
            placeholder="Nogmaals je wachtwoord"
            onKeyDown={e => { if (e.key === 'Enter') submit(); }}
          />
          <PasswordMatch password={password} password2={password2} />
        </div>
        {error && (
          <div style={{ color: '#dc2626', fontSize: '.78rem', fontWeight: 600, marginBottom: 10 }}>
            {error}
          </div>
        )}
        <button className="auth-submit" onClick={submit} disabled={loading || !canSubmit}>
          {loading ? 'Opslaan…' : 'Wachtwoord opslaan →'}
        </button>
        <div className="auth-link">
          <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>
            Annuleren
          </a>
        </div>
      </div>
    </div>
  );
}
