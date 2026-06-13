import { useEffect, useState } from 'react';
import { Logo } from '../bb-shared.jsx';
import { supabase } from '../lib/supabase.js';

const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY;

async function fetchInvite(token) {
  const url = `${SUPABASE_URL}/functions/v1/get-invite?token=${encodeURIComponent(token)}`;
  const res = await fetch(url, {
    headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
  });
  return res.json();
}

export function UitnodigingPage({ token, navigate }) {
  const [invite, setInvite]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [expired, setExpired]   = useState(false);
  const [notFound, setNotFound] = useState(false);

  const [fullName, setFullName] = useState('');
  const [password, setPassword] = useState('');
  const [password2, setPassword2] = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [done, setDone]         = useState(false);

  useEffect(() => {
    if (!token) { setNotFound(true); setLoading(false); return; }
    fetchInvite(token)
      .then(data => {
        if (data.expired) { setExpired(true); return; }
        if (data.error) { setNotFound(true); return; }
        setInvite(data);
        if (data.fullName) setFullName(data.fullName);
      })
      .catch(() => setNotFound(true))
      .finally(() => setLoading(false));
  }, [token]);

  const submit = async () => {
    setError('');
    if (!fullName.trim()) return setError('Vul je naam in.');
    if (!password) return setError('Kies een wachtwoord.');
    if (password.length < 8) return setError('Gebruik minimaal 8 tekens.');
    if (password !== password2) return setError('Wachtwoorden komen niet overeen.');
    setSaving(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('accept-invite', {
        body: { token, fullName: fullName.trim(), password },
      });
      if (fnErr) throw new Error(fnErr.message);
      if (!data?.success) throw new Error(data?.error || 'Accepteren mislukt');

      // Direct inloggen
      const { error: loginErr } = await supabase.auth.signInWithPassword({
        email: invite.email,
        password,
      });
      if (loginErr) throw loginErr;

      setDone(true);
      setTimeout(() => navigate('/dashboard'), 1500);
    } catch (err) {
      setError(err.message || 'Er is iets misgegaan.');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div className="auth-sub" style={{ textAlign: 'center' }}>Uitnodiging laden…</div>
        </div>
      </div>
    );
  }

  if (expired) {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>⏰</div>
            <div className="auth-title" style={{ marginBottom: 6 }}>Uitnodiging verlopen</div>
            <div className="auth-sub">
              Deze uitnodigingslink is niet meer geldig (48 uur verstreken).
              Vraag de beheerder om een nieuwe uitnodiging te sturen.
            </div>
          </div>
          <div className="auth-link" style={{ textAlign: 'center' }}>
            <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>
              Terug naar inloggen
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (notFound) {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center', marginBottom: 16 }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🔍</div>
            <div className="auth-title" style={{ marginBottom: 6 }}>Uitnodiging niet gevonden</div>
            <div className="auth-sub">
              Deze uitnodigingslink is ongeldig of al gebruikt.
            </div>
          </div>
          <div className="auth-link" style={{ textAlign: 'center' }}>
            <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>
              Terug naar inloggen
            </a>
          </div>
        </div>
      </div>
    );
  }

  if (done) {
    return (
      <div className="auth-shell">
        <div className="auth-card afu">
          <div className="auth-logo"><Logo /></div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
            <div className="auth-title" style={{ marginBottom: 6 }}>Welkom bij {invite?.companyName}!</div>
            <div className="auth-sub">Je account is aangemaakt. Je wordt doorgestuurd…</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="auth-shell">
      <div className="auth-card afu">
        <div className="auth-logo"><Logo /></div>
        <div className="auth-title">Uitnodiging accepteren</div>
        <div className="auth-sub">
          Je bent uitgenodigd voor <strong>{invite?.companyName}</strong> op BossBase.
          Maak je account aan om aan de slag te gaan.
        </div>
        <div className="auth-field">
          <label>E-mailadres</label>
          <input type="email" value={invite?.email || ''} disabled
            style={{ background: '#f3f4f6', color: '#6b7280', cursor: 'not-allowed' }} />
        </div>
        <div className="auth-field">
          <label>Volledige naam</label>
          <input
            value={fullName}
            onChange={e => setFullName(e.target.value)}
            placeholder="Je volledige naam"
            autoFocus={!fullName}
          />
        </div>
        <div className="auth-field">
          <label>Wachtwoord kiezen</label>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder="Min. 8 tekens"
          />
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
        </div>
        {error && (
          <div style={{ color: '#dc2626', fontSize: '.78rem', fontWeight: 600, marginBottom: 10 }}>
            {error}
          </div>
        )}
        <button className="auth-submit" onClick={submit} disabled={saving}>
          {saving ? 'Account aanmaken…' : 'Account aanmaken →'}
        </button>
        <div className="auth-link">
          Al een account?{' '}
          <a href="#" onClick={e => { e.preventDefault(); navigate('/login'); }}>Inloggen</a>
        </div>
      </div>
    </div>
  );
}
