import { ArrowLeft } from 'lucide-react';

// De uitlegpagina achter het info-icoon van Instellingen › Websiteformulier.
// Een eigen weergave binnen het tabblad (?weergave=uitleg), zodat "terug" in de
// browser weer bij het formulier uitkomt. De wizard zelf houdt het kort; hier
// staat het hele verhaal, in dezelfde vijf stappen.
//
// Houd dit gelijk met bob-knowledge/instellingen-en-account.md (de kennis van
// Boss): wat hier staat, moet Boss ook kunnen uitleggen.

const blok = { marginTop: 22 };
const kop = { fontSize: '1rem', fontWeight: 700, margin: '0 0 8px' };
const subkop = { ...kop, fontSize: '.92rem', marginTop: 14 };
const tekst = { fontSize: 14, lineHeight: 1.65, color: 'var(--dm)', margin: '0 0 8px' };
const lijst = { ...tekst, paddingLeft: 22, margin: '0 0 8px' };

function Stappen({ children }) {
  return <ol style={lijst}>{children}</ol>;
}

export function WebsiteformulierUitleg({ onTerug }) {
  return (
    <div className="card card-p afu3" style={{ maxWidth: 820 }}>
      <button type="button" className="btn btn-s btn-sm" onClick={onTerug}>
        <ArrowLeft size={14} /> Terug naar Websiteformulier
      </button>

      <h2 style={{ fontSize: '1.25rem', margin: '18px 0 6px' }}>Zo zet je het formulier op je website</h2>
      <p style={tekst}>
        Met het websiteformulier komen aanvragen van je eigen website meteen in BossBase. Elke aanvraag wordt een
        project in de eerste fase van je pipeline, met de klant erbij. Bestaat de klant al (zelfde e-mailadres), dan
        komt het project bij die klant. Jij en je collega's met het recht Verkooppijplijn krijgen een melding. Op de
        projectkaart zie je bij <strong>De aanvraag</strong> precies wat er is ingevuld, je eigen velden onderaan, en bij
        Via staat <strong>Website</strong>.
      </p>
      <p style={tekst}>Je stelt het in met vijf korte stappen. Elke stap wordt meteen opgeslagen.</p>

      <div style={blok}>
        <h3 style={kop}>Stap 1. Heb je al een contactformulier?</h3>
        <p style={tekst}><strong>Ja</strong>: we koppelen je bestaande formulier, bijvoorbeeld van Contact Form 7, WPForms
          of Elementor. Dat blijft precies werken zoals nu, en je krijgt ook nog je eigen mail. BossBase krijgt een kopie.</p>
        <p style={tekst}><strong>Nee</strong>: je krijgt een kant-en-klaar formulier in de kleur van je bedrijf.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Stap 2. Het adres van je website</h3>
        <p style={tekst}>Typ het adres, bijvoorbeeld <code>mijnbedrijf.nl</code>. Zonder https:// of www mag ook. Alleen
          vanaf dit adres nemen we aanvragen aan, zodat niemand jouw formulier op een andere site kan gebruiken.</p>
        <p style={tekst}>Bij <strong>Ja</strong> zoeken we meteen je formulier op. Staat het op een aparte pagina, vul dan
          het adres van die pagina in, bijvoorbeeld <code>mijnbedrijf.nl/contact</code>. Vul je alleen je website in, dan
          kijken we zelf ook op pagina's als /contact en /offerte-aanvragen.</p>
        <p style={tekst}>Lukt het niet, dan zie je waarom: de pagina bestaat niet, je website blokkeert ons, of het
          formulier wordt pas later geladen. Kies dan <strong>Zelf de velden invullen</strong>.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Stap 3. De velden</h3>
        <p style={tekst}><strong>Kant-en-klaar</strong>: zet aan welke velden erin komen: telefoon, adres, postcode,
          plaats, gewenste datum en foto's (maximaal 5). Naam, e-mail en omschrijving staan er altijd in. Ernaast zie je
          meteen hoe het eruitziet.</p>
        <p style={tekst}>Wil je iets vragen wat er niet tussen staat, zoals "Soort dak" of "Oppervlakte in m²"? Klik op{' '}
          <strong>Eigen veld</strong>, geef het een naam en kies de soort: tekst, getal, keuze uit opties (met komma's
          ertussen), ja/nee of datum. Vink <strong>Verplicht</strong> aan als de klant het moet invullen.</p>
        <p style={tekst}><strong>Koppelen</strong>: bij elk veld van je formulier staat al een voorstel waar het in
          BossBase komt. Kijk het na. Past een veld nergens bij, kies dan <strong>Eigen veld</strong> en geef het een naam.
          Het e-mailadres moet gekoppeld zijn. Twee velden bij hetzelfde BossBase-veld, zoals voornaam en achternaam,
          voegen we samen. Een veld zelf toevoegen kan met <strong>Veld toevoegen</strong>: vul dan de naam uit de code van
          je formulier in (bij Contact Form 7 bijvoorbeeld <code>your-name</code>, bij Elementor{' '}
          <code>form_fields[name]</code>).</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Stap 4. De code op je website</h3>
        <p style={tekst}>Kies je soort website. Je krijgt dan de code met een kopieerknop en drie korte stappen.</p>

        <h4 style={subkop}>WordPress, kant-en-klaar formulier</h4>
        <Stappen>
          <li>Open de pagina waar het formulier moet komen en klik op <strong>Bewerken</strong>.</li>
          <li>Voeg het blok <strong>Aangepaste HTML</strong> (Custom HTML) toe.</li>
          <li>Plak de code en klik op <strong>Bijwerken</strong>.</li>
        </Stappen>
        <p style={tekst}>Met Elementor gebruik je de widget <strong>HTML</strong>. In de klassieke editor plak je de code
          op het tabblad <strong>Tekst</strong>.</p>

        <h4 style={subkop}>WordPress, je eigen formulier koppelen</h4>
        <Stappen>
          <li>Installeer de gratis plugin <strong>WPCode</strong>.</li>
          <li>Ga naar <strong>Code Snippets › Header &amp; Footer</strong>.</li>
          <li>Plak de code bij <strong>Footer</strong> en klik op <strong>Opslaan</strong>.</li>
        </Stappen>
        <p style={tekst}>Gebruik je een plugin die pagina's bewaart (cache), leeg die cache dan even.</p>

        <h4 style={subkop}>Wix</h4>
        <Stappen>
          <li>Klik in de Wix-editor op <strong>Toevoegen</strong> › <strong>Code insluiten</strong> (Embed Code) ›{' '}
            <strong>Een site insluiten</strong> (Embed a site).</li>
          <li>Plak de link bij <strong>Website-adres</strong>.</li>
          <li>Maak het vak ongeveer 750 pixels hoog en klik op <strong>Publiceren</strong>.</li>
        </Stappen>
        <p style={tekst}>Bij Wix werkt alleen het kant-en-klare formulier: Wix laat geen koppeling met zijn eigen
          formulieren toe. Kies je bij Wix voor koppelen, dan stelt de wizard voor om over te stappen. Heeft je Wix-site
          geen eigen domein, vul dan je adres op wixsite.com in.</p>

        <h4 style={subkop}>Andere websites</h4>
        <p style={tekst}>Squarespace (blok <strong>Code</strong>), Webflow (<strong>Embed</strong>), Jimdo
          (<strong>Widget/HTML</strong>) en een zelfgebouwde site: plak de code op de plek van het formulier, of bij
          koppelen in de footer. Laat je je website door iemand anders beheren, stuur hem dan de code. Er zit geen geheime
          sleutel in.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Stap 5. Testen</h3>
        <p style={tekst}>Klik op <strong>Testaanvraag versturen</strong>. Er komt dan een aanvraag van "Test Aanvraag" in
          je pipeline, met voorbeeldwaarden in je eigen velden. Met <strong>Bekijk in de pipeline</strong> open je hem.
          Vul daarna ook zelf je formulier op je website in. Testaanvragen kun je gewoon verwijderen.</p>
        <p style={tekst}>Met <strong>Klaar</strong> zet je het formulier aan.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Daarna</h3>
        <p style={tekst}>Je ziet dan een overzicht van je instellingen. Met <strong>Aanpassen</strong> loop je de stappen
          opnieuw door, met <strong>Code bekijken</strong> haal je de code opnieuw op. Onder{' '}
          <strong>Meer instellingen</strong> zet je het formulier aan of uit, beheer je je websites (ook een tweede site),
          zie je de kleur (die wijzig je in Bedrijfsprofiel), vul je een link naar je privacyverklaring in en kopieer je de
          link naar het formulier.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Veiligheid en spam</h3>
        <p style={tekst}>De code bevat geen geheime sleutel. Aanvragen komen alleen binnen vanaf jouw websites. Tegen spam
          zit er een verborgen veld in dat alleen robots invullen, en er geldt een limiet per IP-adres en per
          e-mailadres.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Komt er niets binnen?</h3>
        <ul style={lijst}>
          <li>Staat het formulier aan? Kijk onder <strong>Meer instellingen</strong> bij Aanvragen ontvangen.</li>
          <li>Staat je website bij Websites? Met en zonder www zijn voor de browser twee adressen; Toevoegen zet ze er
            allebei in. Een nieuw adres werkt binnen een minuut.</li>
          <li>Bij koppelen: is het e-mailadres gekoppeld, en staat de code op de pagina met het formulier?</li>
          <li>Heeft je website een cache-plugin, leeg dan de cache.</li>
        </ul>
        <p style={tekst}>Kom je er niet uit, vraag het Boss rechtsboven.</p>
      </div>

      <div style={{ marginTop: 22 }}>
        <button type="button" className="btn btn-p" onClick={onTerug}>
          <ArrowLeft size={14} /> Terug naar Websiteformulier
        </button>
      </div>
    </div>
  );
}
