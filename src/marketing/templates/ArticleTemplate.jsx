// Sjabloon voor kennisbankartikelen (src/content/kennisbank/*.md).
import { PaginaSchil, Kruimelpad, Kaarten, Sectie, Knop, Tekst, Beeld } from './Onderdelen.jsx';
import { docVoorPad } from '../routes.jsx';
import { datumTekst, SITE_NAAM } from '../site.js';

export default function ArticleTemplate({ inhoud, navigate }) {
  const { meta, html, toc, kruimels } = inhoud;
  const leesOok = (meta.gerelateerd || [])
    .map(pad => {
      const d = docVoorPad(pad);
      if (!d) return null;
      return { href: pad, titel: d.h1, tekst: d.description, tag: d.type === 'artikel' ? 'Kennisbank' : d.kicker, meer: d.type === 'artikel' ? 'Lees het artikel' : 'Bekijk de pagina' };
    })
    .filter(Boolean);

  return (
    <PaginaSchil navigate={navigate}>
      <header className="bb-article-head">
        <div className="container">
          <Kruimelpad items={kruimels} />
          <h1>{meta.h1}</h1>
          <p className="bb-meta">
            <span>Door {meta.auteur || `de redactie van ${SITE_NAAM}`}</span>
            {meta.gepubliceerd && (
              <span>Gepubliceerd <time dateTime={meta.gepubliceerd}>{datumTekst(meta.gepubliceerd)}</time></span>
            )}
            {meta.gewijzigd && meta.gewijzigd !== meta.gepubliceerd && (
              <span>Bijgewerkt <time dateTime={meta.gewijzigd}>{datumTekst(meta.gewijzigd)}</time></span>
            )}
            <span>{meta.leestijd} min lezen</span>
          </p>
          {meta.samenvatting && (
            <div className="bb-answer">
              <strong>Kort antwoord</strong>
              <p>{meta.samenvatting}</p>
            </div>
          )}
        </div>
      </header>

      <section className="section" style={{ paddingTop: 36 }}>
        <div className="container bb-article-layout">
          <article>
            {meta.beeld && <div style={{ maxWidth: 740, marginBottom: 28 }}><Beeld beeld={meta.beeld} /></div>}
            <Tekst html={html} />

            {meta.cta && (
              <aside className="bb-inline-cta" aria-label="BossBase proberen">
                <div>
                  <h2>{meta.cta.titel}</h2>
                  {meta.cta.tekst && <p>{meta.cta.tekst}</p>}
                </div>
                <Knop href={meta.cta.href || '/register'}>{meta.cta.label || 'Start 14 dagen gratis'}</Knop>
              </aside>
            )}

            {meta.bronnen?.length > 0 && (
              <div className="bb-sources">
                <h2>Bronnen</h2>
                <ul>
                  {meta.bronnen.map(b => (
                    <li key={b.url}>
                      <a href={b.url} target="_blank" rel="noopener noreferrer">{b.titel}</a>
                      {b.uitgever ? ` — ${b.uitgever}` : ''}
                    </li>
                  ))}
                </ul>
                <p className="bb-note">
                  Gecontroleerd op <time dateTime={meta.bronnenGecontroleerd}>{datumTekst(meta.bronnenGecontroleerd)}</time>.
                  Regels kunnen veranderen; kijk bij twijfel altijd op de website van de bron of vraag je boekhouder.
                </p>
              </div>
            )}
          </article>

          {toc?.length > 2 && (
            <nav className="bb-toc" aria-label="In dit artikel">
              <h2>In dit artikel</h2>
              <ol>
                {toc.map(t => <li key={t.id}><a href={`#${t.id}`}>{t.tekst}</a></li>)}
              </ol>
            </nav>
          )}
        </div>
      </section>

      {leesOok.length > 0 && (
        <Sectie titel="Lees ook" grijs>
          <Kaarten items={leesOok} />
        </Sectie>
      )}
    </PaginaSchil>
  );
}
