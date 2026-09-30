// De actuele lijst subverwerkers. De algemene voorwaarden (art. 6.4) en de
// verwerkersovereenkomst (art. 5) verwijzen hiernaar. Houd hem gelijk met
// Bijlage/art. 5 van docs/juridisch/verwerkersovereenkomst-CONCEPT.md en §4 van
// de privacyverklaring; een wijziging kondigen we 30 dagen vooraf aan.
import { PaginaSchil, PaginaKop, Sectie } from '../../marketing/templates/Onderdelen.jsx';

const STAND = '30 september 2026';

const SUBVERWERKERS = [
  { naam: 'Supabase Pte. Ltd.', waarvoor: 'Database, inloggen, opslag van bestanden, serverfuncties', waar: 'Frankfurt, Duitsland', waarborg: 'Standaardcontractbepalingen' },
  { naam: 'Vercel Inc.', waarvoor: 'Hosting van de website en de app; gebruiksstatistieken (Web Analytics, zonder cookies)', waar: 'Wereldwijd netwerk (voor Nederland Frankfurt); serverfunctie in Frankfurt; bedrijf in de VS', waarborg: 'EU-US Data Privacy Framework en standaardcontractbepalingen' },
  { naam: 'Resend (Plus Five Five, Inc.)', waarvoor: 'Versturen van e-mail: offertes, facturen, werkbonnen, uitnodigingen en herinneringen', waar: 'Verenigde Staten', waarborg: 'EU-US Data Privacy Framework en standaardcontractbepalingen' },
  { naam: 'Stripe Payments Europe, Ltd.', waarvoor: 'Betalen van het BossBase-abonnement', waar: 'Ierland; verwerking ook buiten de EU', waarborg: 'EU-US Data Privacy Framework en standaardcontractbepalingen' },
  { naam: 'Anthropic Ireland, Ltd.', waarvoor: 'De helpassistent Boss in de app; alleen wat een gebruiker zelf in de chat typt', waar: 'Ierland; verwerking ook in de VS', waarborg: 'Standaardcontractbepalingen' },
  { naam: 'PDOK (Kadaster)', waarvoor: 'Adres opzoeken tijdens het typen in de app', waar: 'Nederland', waarborg: 'Niet nodig (binnen de EU)' },
];

const KOPPELINGEN = [
  { naam: 'Moneybird', wat: 'Relaties, facturen, kosten en btw' },
  { naam: 'SnelStart', wat: 'Relaties, verkoopboekingen en kosten' },
  { naam: 'AFAS', wat: 'Relaties en kosten' },
  { naam: 'Google Agenda', wat: 'Afspraken: titel, notities en adres van de klant' },
  { naam: 'Stripe (je eigen account, via Stripe Connect)', wat: 'Betaallinks voor je klanten: bedrag, factuurnummer en betaling' },
];

function Tabel({ kop, rijen }) {
  return (
    <div className="bb-prose" style={{ maxWidth: 'none' }}>
      <div className="bb-table-wrap">
        <table>
          <thead><tr>{kop.map(k => <th key={k}>{k}</th>)}</tr></thead>
          <tbody>{rijen.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j}>{c}</td>)}</tr>)}</tbody>
        </table>
      </div>
    </div>
  );
}

export default function SubverwerkersPage({ navigate }) {
  return (
    <PaginaSchil navigate={navigate}>
      <PaginaKop
        kruimels={[{ naam: 'Home', pad: '/' }, { naam: 'Subverwerkers', pad: '/subverwerkers' }]}
        kicker="Privacy"
        h1="Subverwerkers"
        lead={`Deze bedrijven helpen ons BossBase te leveren en verwerken daarbij gegevens voor ons. Met allemaal hebben we afspraken die minstens zo streng zijn als onze verwerkersovereenkomst. Stand: ${STAND}.`}
      />
      <Sectie titel="Subverwerkers van BossBase">
        <Tabel
          kop={['Bedrijf', 'Waarvoor', 'Waar', 'Waarborg bij doorgifte buiten de EU']}
          rijen={SUBVERWERKERS.map(s => [s.naam, s.waarvoor, s.waar, s.waarborg])}
        />
        <p className="bb-section-intro" style={{ marginTop: 18 }}>
          Komt er een subverwerker bij of verandert er een, dan laten we het klanten minstens 30 dagen van tevoren
          per mail weten.
        </p>
      </Sectie>
      <Sectie titel="Koppelingen die je zelf aanzet" intro="Dit zijn geen subverwerkers van BossBase. Met deze partijen heb je zelf een overeenkomst; BossBase stuurt gegevens alleen door als jij de koppeling aanzet." grijs>
        <Tabel kop={['Partij', 'Wat gaat erheen']} rijen={KOPPELINGEN.map(k => [k.naam, k.wat])} />
      </Sectie>
      <Sectie>
        <p className="bb-section-intro">
          BossBase is een handelsnaam van NG E-Commerce B.V., Sodalietdreef 6, 7828 CR Emmen, KvK 91856396.
          Vragen? Mail <a href="mailto:info@bossbase.nl">info@bossbase.nl</a>.
        </p>
      </Sectie>
    </PaginaSchil>
  );
}
