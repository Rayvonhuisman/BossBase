import { Component } from 'react';
import { isLaadfout, herlaadEenmaal } from '../lib/laadfout.js';

// Vangt render-fouten van één pagina op zodat een crash in bijv. de Database-
// pagina niet de HELE app-shell (en dus alle andere pagina's) meesleept in een
// wit scherm. Toont de foutmelding zodat het probleem zichtbaar/diagnostiseerbaar
// is i.p.v. een blanco pagina. Geef een `resetKey` (bv. de huidige pagina-id):
// verandert die, dan probeert de boundary opnieuw te renderen.
export class PageErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    console.error('[bb:pagina] render-fout opgevangen', error, info?.componentStack);
    // Een onderdeel van een oudere versie bestaat niet meer (er is net een
    // nieuwe versie gepubliceerd): één keer herladen haalt de nieuwe op.
    if (isLaadfout(error)) herlaadEenmaal();
  }

  componentDidUpdate(prevProps) {
    // Bij navigeren naar een andere pagina de fout wissen en opnieuw proberen.
    if (prevProps.resetKey !== this.props.resetKey && this.state.error) {
      this.setState({ error: null });
    }
  }

  render() {
    const { error } = this.state;
    if (error && isLaadfout(error)) {
      return (
        <div className="card card-p" style={{ margin: 24, maxWidth: 560 }} role="alert">
          <div style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 8 }}>Er is een nieuwe versie van BossBase</div>
          <div style={{ fontSize: '.88rem', color: 'var(--dm)', marginBottom: 12 }}>
            Deze pagina hoort bij de vorige versie. Herlaad de pagina om verder te gaan; je gegevens blijven gewoon staan.
          </div>
          <button className="btn btn-p btn-sm" onClick={() => window.location.reload()}>Pagina herladen</button>
        </div>
      );
    }
    if (error) {
      return (
        <div className="card card-p" style={{ margin: 24, maxWidth: 720 }}>
          <div style={{ fontWeight: 700, fontSize: '1rem', color: '#dc2626', marginBottom: 8 }}>
            Er ging iets mis bij het laden van deze pagina
          </div>
          <div style={{ fontSize: '.85rem', color: 'var(--dm)', marginBottom: 12 }}>
            De rest van de app blijft gewoon werken. Probeer de pagina te herladen; blijft het fout gaan, deel dan onderstaande melding.
          </div>
          <pre style={{ fontSize: '.78rem', color: 'var(--dk)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 8, padding: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word', overflow: 'auto', maxHeight: 240 }}>
            {String(error?.message || error)}
          </pre>
          <button className="btn btn-p btn-sm" style={{ marginTop: 12 }} onClick={() => window.location.reload()}>
            Pagina herladen
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
