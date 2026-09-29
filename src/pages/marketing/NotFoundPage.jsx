// De foutpagina voor een adres dat niet bestaat. Vercel serveert hem als
// 404.html, met status 404 — dus geen stille doorverwijzing naar de homepage.
import { PaginaSchil, Kaarten, Knop } from '../../marketing/templates/Onderdelen.jsx';

const SUGGESTIES = [
  { href: '/functies', titel: 'Functies', tekst: 'Klantbeheer, offertes, planning, werkbonnen, uren en facturen.' },
  { href: '/prijzen', titel: 'Prijzen', tekst: 'Starter, Groei en Team, per maand of per jaar.' },
  { href: '/kennisbank', titel: 'Kennisbank', tekst: 'Praktische uitleg over werkbonnen, offertes, planning en administratie.' },
];

export default function NotFoundPage({ navigate }) {
  return (
    <PaginaSchil navigate={navigate}>
      <section className="bb-404">
        <div className="container">
          <p className="bb-code">FOUT 404</p>
          <h1 style={{ fontSize: 'clamp(32px,4.4vw,52px)', fontWeight: 900, marginTop: 10 }}>Deze pagina bestaat niet</h1>
          <p style={{ marginTop: 16, fontSize: 18, maxWidth: '36em' }}>
            Misschien is het adres verkeerd getypt, of is de pagina verplaatst. Kies hieronder waar je heen wilt,
            of ga terug naar de homepage.
          </p>
          <div className="hero-ctas" style={{ marginTop: 26 }}>
            <Knop href="/">Naar de homepage</Knop>
            <Knop href="/contact" soort="s">Contact opnemen</Knop>
          </div>
          <div style={{ marginTop: 48 }}>
            <Kaarten items={SUGGESTIES} />
          </div>
        </div>
      </section>
    </PaginaSchil>
  );
}
