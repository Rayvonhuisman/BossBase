// Overzicht van alle kennisbankartikelen, gegroepeerd per onderwerp.
import { PaginaSchil, PaginaKop, Sectie, Kaarten } from '../../marketing/templates/Onderdelen.jsx';
import { contentVanType } from '../../marketing/routes.jsx';

const ONDERWERPEN = ['Offertes en werkbonnen', 'Planning en uren', 'Facturen en administratie', 'Klanten en leads'];

export default function KennisbankPage({ navigate }) {
  const artikelen = contentVanType('artikel');
  const groepen = ONDERWERPEN
    .map(o => ({ onderwerp: o, items: artikelen.filter(a => a.onderwerp === o) }))
    .filter(g => g.items.length);
  const overig = artikelen.filter(a => !ONDERWERPEN.includes(a.onderwerp));
  if (overig.length) groepen.push({ onderwerp: 'Overig', items: overig });

  return (
    <PaginaSchil navigate={navigate}>
      <PaginaKop
        kruimels={[{ naam: 'Home', pad: '/' }, { naam: 'Kennisbank', pad: '/kennisbank' }]}
        kicker="Kennisbank"
        h1="Praktische uitleg voor vakbedrijven"
        lead="Over werkbonnen, offertes, planning, uren, facturen en je administratie. Met voorbeelden en checklists die je zo kunt gebruiken, of je nu met BossBase werkt of niet."
      />
      {groepen.map((g, i) => (
        <Sectie key={g.onderwerp} titel={g.onderwerp} grijs={i % 2 === 1}>
          <Kaarten
            items={g.items.map(a => ({
              href: a.path,
              titel: a.h1,
              tekst: a.description,
              meer: `Lees het artikel · ${a.leestijd} min`,
            }))}
          />
        </Sectie>
      ))}
    </PaginaSchil>
  );
}
