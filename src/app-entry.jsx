import React, { Component } from 'react';
import { createRoot } from 'react-dom/client';
import './fonts.css';
import App from './App.jsx';
import './styles.css';
import './bb-dashboard.css';
import './mobile.css';
import { isLaadfout, herlaadEenmaal } from './lib/laadfout.js';

// Laatste vangnet voor de hele app. Zonder dit maakt React bij een fout buiten
// een pagina (zijbalk, bovenbalk, inlogscherm) de pagina leeg: een wit scherm.
class AppFoutgrens extends Component {
  constructor(props) {
    super(props);
    this.state = { fout: null };
  }

  static getDerivedStateFromError(fout) {
    return { fout };
  }

  componentDidCatch(fout, info) {
    console.error('[bb:app] fout opgevangen', fout, info?.componentStack);
    // Een onderdeel dat niet meer bestaat (nieuwe versie gepubliceerd): herladen.
    if (isLaadfout(fout)) herlaadEenmaal();
  }

  render() {
    const { fout } = this.state;
    if (!fout) return this.props.children;
    return (
      <div role="alert" style={{ maxWidth: 560, margin: '12vh auto', padding: 28, fontFamily: 'Inter, system-ui, sans-serif', background: '#fff', border: '1px solid #e5e7eb', borderRadius: 14 }}>
        <h1 style={{ fontSize: 20, margin: '0 0 10px', color: '#0D0D0D' }}>Er ging iets mis</h1>
        <p style={{ margin: '0 0 16px', lineHeight: 1.55, color: '#374151' }}>
          BossBase kon deze pagina niet tonen. Laad de pagina opnieuw. Blijft het fout gaan, stuur dan
          onderstaande melding naar info@bossbase.nl.
        </p>
        <button type="button" onClick={() => window.location.reload()} style={{ padding: '11px 18px', borderRadius: 10, border: 0, background: '#1DDB62', color: '#0D0D0D', fontWeight: 700, fontSize: 15, cursor: 'pointer' }}>
          Pagina opnieuw laden
        </button>
        <pre style={{ marginTop: 18, fontSize: 12, color: '#374151', background: '#f5f4f1', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
          {String(fout?.message || fout)}
        </pre>
      </div>
    );
  }
}

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <AppFoutgrens>
      <App />
    </AppFoutgrens>
  </React.StrictMode>
);
