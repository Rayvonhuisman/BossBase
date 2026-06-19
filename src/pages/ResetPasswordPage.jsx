import { useEffect, useState } from 'react';
import { CheckCircle2, Clock, Link2Off, LoaderCircle } from 'lucide-react';
import { Logo } from '../bb-shared.jsx';
import { validateResetToken, applyPasswordReset, vertaalAuthFout } from '../services/authService.js';
import { PasswordRequirements, PasswordMatch, passwordValid } from '../components/PasswordStrength.jsx';

function AuthIcon({ icon: Icon, color, bg }) {
  return (
    <div style={{ width: 56, height: 56, borderRadius: '50%', background: bg, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
      <Icon size={26} color={color} strokeWidth={1.8} />
    </div>
  );
}

// States: checking | valid | expired | used | invalid | done
export function ResetPasswordPage({ token, navigate }) {
  const [status, setStatus]   = useState(token ? 'checking' : 'invalid');
  const [password, setPassword]   = useState('');
  const [password2, setPassword2] = useState('');
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');

  const canSubmit = passwordValid(password) && password === password2 && password2.length > 0;

  useEffect(() => {
    if (!token) return;
    validateResetToken(token).then(result => {
      if (result.valid) {
        setStatus('valid');
      } else if (result.code === 'EXPIRED') {
        setStatus('expired');
      } else if (result.code === 'USED') {
        setStatus('used');
      } else {
        setStatus('invalid');
      }
    });
  }, [token]);

  const submit = async () => {
    if (!canSubmit) return;
    setError('');
    setLoading(true);
    try {
      await applyPasswordReset(token, password);
      setStatus('done');
    } catch (err) {
      if (err.code === 'EXPIRED') {
        setStatus('expired');
      } else if (err.code === 'USED') {
        setStatus('used');
      } else {
        setError(vertaalAuthFout(err.message) || 'Opslaan mislukt.');
      }
    } finally {
      setLoading(false);
    }
  };

  // ── Laden ────────────────────────────────────────────────────
  if (status === 'checking') {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div className="auth-title">Wachtwoord instellen</div>
          <div className="auth-sub" style={{ textAlign: 'center' }}>Resetlink controleren…</div>
          <div style={{ textAlign: 'center', padding: '12px 0' }}>
            <AuthIcon icon={LoaderCircle} color="#6b7280" bg="#f3f4f6" />
          </div>
        </div>
      </div>
    );
  }

  // ── Verlopen ─────────────────────────────────────────────────
  if (status === 'expired') {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <AuthIcon icon={Clock} color="#d97706" bg="#fffbeb" />
            <div className="auth-title" style={{ marginBottom: 6 }}>Link verlopen</div>
            <div className="auth-sub">
              Deze link is verlopen. Vraag een nieuwe resetlink aan.
            </div>
          </div>
          <button className="auth-submit" onClick={() => navigate('/login')}>
            Nieuwe resetlink aanvragen →
          </button>
        </div>
      </div>
    );
  }

  // ── Al gebruikt ──────────────────────────────────────────────
  if (status === 'used') {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <AuthIcon icon={CheckCircle2} color="#1DDB62" bg="#f0fdf4" />
            <div className="auth-title" style={{ marginBottom: 6 }}>Link al gebruikt</div>
            <div className="auth-sub">
              Deze link is al gebruikt. Log in met je nieuwe wachtwoord of vraag een nieuwe link aan.
            </div>
          </div>
          <button className="auth-submit" onClick={() => navigate('/login')}>
            Inloggen →
          </button>
          <div className="auth-link" style={{ textAlign: 'center', marginTop: 8 }}>
            <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>
              Nieuwe resetlink aanvragen
            </a>
          </div>
        </div>
      </div>
    );
  }

  // ── Ongeldig ─────────────────────────────────────────────────
  if (status === 'invalid') {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <AuthIcon icon={Link2Off} color="#dc2626" bg="#fef2f2" />
            <div className="auth-title" style={{ marginBottom: 6 }}>Ongeldige resetlink</div>
            <div className="auth-sub">
              Deze link is ongeldig. Vraag een nieuwe wachtwoordreset aan.
            </div>
          </div>
          <button className="auth-submit" onClick={() => navigate('/login')}>
            Nieuwe resetlink aanvragen →
          </button>
        </div>
      </div>
    );
  }

  // ── Succes ───────────────────────────────────────────────────
  if (status === 'done') {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 8 }}>
            <AuthIcon icon={CheckCircle2} color="#1DDB62" bg="#f0fdf4" />
            <div className="auth-title" style={{ marginBottom: 6 }}>Wachtwoord gewijzigd!</div>
            <div className="auth-sub">Je kunt nu inloggen met je nieuwe wachtwoord.</div>
          </div>
          <button className="auth-submit" onClick={() => navigate('/login')}>
            Ga naar inloggen →
          </button>
        </div>
      </div>
    );
  }

  // ── Formulier (status === 'valid') ───────────────────────────
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
          {loading ? 'Opslaan…' : 'Stel wachtwoord in →'}
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
