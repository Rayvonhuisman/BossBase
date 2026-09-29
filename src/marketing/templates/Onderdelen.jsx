// Bouwstenen voor de nieuwe websitepagina's. Gewone <a href>-links: de
// navigatie binnen de site regelt MarketingApp.
import { useEffect } from 'react';
import { Nav, Footer, I, initChoreo } from '../../pages/marketing/MktShared.jsx';
import './content.css';

export function PaginaSchil({ navigate, children }) {
  useEffect(() => initChoreo(), []);
  return (
    <div className="bm">
      <Nav navigate={navigate} />
      <main>{children}</main>
      <Footer navigate={navigate} />
    </div>
  );
}

export function Kruimelpad({ items }) {
  if (!items || items.length < 2) return null;
  return (
    <nav className="bb-crumbs" aria-label="Kruimelpad">
      <ol>
        {items.map((k, i) => (
          <li key={k.pad}>
            {i === items.length - 1
              ? <span aria-current="page">{k.naam}</span>
              : <a href={k.pad}>{k.naam}</a>}
          </li>
        ))}
      </ol>
    </nav>
  );
}

export function Knop({ href, children, soort = 'p' }) {
  return (
    <a href={href} className={`btn btn-${soort}${soort === 'p' ? ' glow' : ''} btn-lg`}>
      {children}{soort === 'p' ? <> {I.arrowRight}</> : null}
    </a>
  );
}

export function PaginaKop({ kruimels, kicker, h1, lead, cta, cta2, noot }) {
  return (
    <header className="bb-hero">
      <div className="container">
        <Kruimelpad items={kruimels} />
        {kicker && <span className="section-kicker">{kicker}</span>}
        <h1>{h1}</h1>
        {lead && <p className="bb-lead">{lead}</p>}
        {(cta || cta2) && (
          <div className="hero-ctas">
            {cta && <Knop href={cta.href}>{cta.label}</Knop>}
            {cta2 && <Knop href={cta2.href} soort="s">{cta2.label}</Knop>}
          </div>
        )}
        {noot && <p className="bb-hero-note">{noot}</p>}
      </div>
    </header>
  );
}

export function Sectie({ titel, intro, grijs, children, id }) {
  return (
    <section className="section" id={id} style={grijs ? { background: 'var(--bgs)' } : undefined}>
      <div className="container">
        {titel && <h2 className="bb-section-title">{titel}</h2>}
        {intro && <p className="bb-section-intro">{intro}</p>}
        {children}
      </div>
    </section>
  );
}

export function Kaarten({ items, twee }) {
  return (
    <div className={`bb-cards${twee ? ' two' : ''}`}>
      {items.map(k => k.href ? (
        <a key={k.href} href={k.href} className="bb-card">
          {k.tag && <span className="bb-card-tag">{k.tag}</span>}
          <h3>{k.titel}</h3>
          {k.tekst && <p>{k.tekst}</p>}
          {k.status && <span className={`bb-card-status${k.statusSoort ? ` ${k.statusSoort}` : ''}`}>{k.status}</span>}
          <span className="bb-card-more">{k.meer || 'Lees meer'} {I.arrowRight}</span>
        </a>
      ) : (
        <div key={k.titel} className="bb-card">
          {k.tag && <span className="bb-card-tag">{k.tag}</span>}
          <h3>{k.titel}</h3>
          {k.tekst && <p>{k.tekst}</p>}
          {k.status && <span className={`bb-card-status${k.statusSoort ? ` ${k.statusSoort}` : ''}`}>{k.status}</span>}
        </div>
      ))}
    </div>
  );
}

export function Stappen({ items }) {
  return (
    <ol className="bb-steps">
      {items.map(s => (
        <li key={s.titel}>
          <h3>{s.titel}</h3>
          <p>{s.tekst}</p>
        </li>
      ))}
    </ol>
  );
}

export function Vragen({ items }) {
  return (
    <div className="bb-faq">
      {items.map(v => (
        <details key={v.v}>
          <summary>{v.v}</summary>
          <div><p>{v.a}</p></div>
        </details>
      ))}
    </div>
  );
}

export function Beeld({ beeld, voorrang }) {
  if (!beeld) return null;
  return (
    <figure className="bb-shot">
      <img
        src={beeld.src}
        alt={beeld.alt}
        width={beeld.width}
        height={beeld.height}
        loading={voorrang ? 'eager' : 'lazy'}
        decoding="async"
        {...(voorrang ? { fetchPriority: 'high' } : {})}
      />
      {beeld.bijschrift && <figcaption>{beeld.bijschrift}</figcaption>}
    </figure>
  );
}

export function SlotCta({ titel, tekst, cta, cta2 }) {
  return (
    <section className="section">
      <div className="container">
        <div className="final-cta">
          <h2>{titel}</h2>
          {tekst && <p>{tekst}</p>}
          <div className="hero-ctas">
            <Knop href={cta?.href || '/register'}>{cta?.label || 'Start 14 dagen gratis'}</Knop>
            {cta2 && <Knop href={cta2.href} soort="s">{cta2.label}</Knop>}
          </div>
        </div>
      </div>
    </section>
  );
}

// Tekst die in de build al naar HTML is omgezet (zie scripts/vite-plugin-content.mjs).
export function Tekst({ html }) {
  return <div className="bb-prose" dangerouslySetInnerHTML={{ __html: html }} />;
}
