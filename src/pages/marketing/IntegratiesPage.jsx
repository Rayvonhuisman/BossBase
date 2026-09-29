// Overzicht van de koppelingen. Alleen wat klanten nu echt kunnen gebruiken
// staat als beschikbaar; de rest staat er eerlijk bij als niet beschikbaar.
import { PaginaSchil, PaginaKop, Sectie, Kaarten, SlotCta } from '../../marketing/templates/Onderdelen.jsx';
import { contentVanType } from '../../marketing/routes.jsx';

const STATUS = {
  '/integraties/moneybird': 'Beschikbaar · Groei en Team',
  '/integraties/snelstart': 'Beschikbaar · Groei en Team',
  '/integraties/stripe-betaallink': 'Beschikbaar · Team, of module bij Groei',
};

const NIET_BESCHIKBAAR = [
  { titel: 'Google Agenda', tekst: 'Een koppeling om afspraken naar Google Agenda te zetten is in voorbereiding, maar nog niet beschikbaar voor klanten.', status: 'Nog niet beschikbaar', statusSoort: 'gepland' },
  { titel: 'Import uit Excel', tekst: 'Klanten importeren uit Excel of CSV kan niet. Exporteren wel: klanten als Excel of CSV, offertes en facturen als PDF.', status: 'Alleen export', statusSoort: 'gepland' },
  { titel: 'Andere boekhoudpakketten', tekst: 'Werk je met een ander pakket dan Moneybird of SnelStart? Laat het ons weten via de contactpagina.', status: 'Niet beschikbaar', statusSoort: 'gepland' },
];

export default function IntegratiesPage({ navigate }) {
  const koppelingen = contentVanType('integratie');
  return (
    <PaginaSchil navigate={navigate}>
      <PaginaKop
        kruimels={[{ naam: 'Home', pad: '/' }, { naam: 'Koppelingen', pad: '/integraties' }]}
        kicker="Koppelingen"
        h1="Koppelingen met je boekhouding en betalingen"
        lead="BossBase werkt samen met Moneybird en SnelStart, en met Stripe voor een betaallink op je facturen. Per koppeling lees je precies wat er wordt uitgewisseld, in welke richting en in welk pakket."
      />
      <Sectie titel="Beschikbare koppelingen">
        <Kaarten
          items={koppelingen.map(k => ({
            href: k.path,
            titel: k.kruimel,
            tekst: k.description,
            status: STATUS[k.path],
            meer: 'Bekijk de koppeling',
          }))}
        />
      </Sectie>
      <Sectie titel="Wat er (nog) niet is" intro="Liever eerlijk vooraf dan een teleurstelling na het aanmelden." grijs>
        <Kaarten items={NIET_BESCHIKBAAR} />
      </Sectie>
      <SlotCta
        titel="Probeer de koppelingen in je proefperiode"
        tekst="De proefperiode van 14 dagen heeft de functies van Groei, inclusief de koppeling met Moneybird of SnelStart."
        cta2={{ label: 'Bekijk prijzen', href: '/prijzen' }}
      />
    </PaginaSchil>
  );
}
