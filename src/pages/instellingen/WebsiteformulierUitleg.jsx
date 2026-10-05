import { ArrowLeft } from 'lucide-react';

// De uitlegpagina achter het info-icoon van Instellingen › Websiteformulier.
// Een eigen weergave binnen het tabblad (?weergave=uitleg), zodat "terug" in de
// browser weer bij het formulier uitkomt.
//
// Houd dit gelijk met bob-knowledge/instellingen-en-account.md (de kennis van
// Boss): wat hier staat, moet Boss ook kunnen uitleggen.

const blok = { marginTop: 22 };
const kop = { fontSize: '1rem', fontWeight: 700, margin: '0 0 8px' };
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
        project in de eerste fase van je pipeline, met de klant erbij: bestaat de klant al (zelfde e-mailadres), dan
        komt hij bij die klant, anders maken we hem aan. Jij en je collega's met het recht Verkooppijplijn krijgen een
        melding. Op de projectkaart zie je bij <strong>De aanvraag</strong> precies wat er is ingevuld, en bij Via
        staat <strong>Website</strong>.
      </p>

      <div style={blok}>
        <h3 style={kop}>Stap 1. Vul het adres van je website in</h3>
        <p style={tekst}>
          Typ het adres van je website, bijvoorbeeld <code>mijnbedrijf.nl</code>, en klik op <strong>Toevoegen</strong>.
          We zetten het er met en zonder www in. Alleen van deze adressen nemen we aanvragen aan; zo kan niemand jouw
          formulier op een andere site gebruiken. Klik daarna op <strong>Opslaan</strong>.
        </p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Stap 2. Kies hoe je het formulier gebruikt</h3>
        <p style={tekst}><strong>Kant-en-klaar formulier</strong>: je hebt nog geen formulier, of je wilt het simpel houden.
          Kies welke velden erin staan (telefoon, adres, postcode, plaats, gewenste datum, foto's). Naam, e-mailadres en
          omschrijving staan er altijd in. Het formulier krijgt de kleur uit je bedrijfsprofiel.</p>
        <p style={tekst}><strong>Koppelen aan je eigen formulier</strong>: je hebt al een formulier, bijvoorbeeld van
          Contact Form 7, WPForms of Elementor. Dat blijft precies werken zoals nu (je krijgt ook gewoon nog je eigen
          mail); BossBase krijgt een kopie. Vul het adres van de pagina met je formulier in en klik op{' '}
          <strong>Velden ophalen</strong>. Kies bij elk veld waar het in BossBase hoort: naam, e-mail, telefoon, adres,
          postcode, plaats, omschrijving, gewenste datum of foto's. Het e-mailadres moet je koppelen. Twee velden bij
          hetzelfde BossBase-veld, zoals voornaam en achternaam, voegen we samen.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Stap 3. Plak de code in je website</h3>
        <p style={tekst}>Klik op <strong>Code kopiëren</strong> en plak de code in je website. Hoe dat gaat, hangt af van
          je website:</p>

        <h4 style={{ ...kop, fontSize: '.92rem', marginTop: 14 }}>WordPress, kant-en-klaar formulier</h4>
        <Stappen>
          <li>Open de pagina waar het formulier moet komen, bijvoorbeeld Contact, en klik op <strong>Bewerken</strong>.</li>
          <li>Klik op het plusje en kies het blok <strong>Aangepaste HTML</strong> (Custom HTML).</li>
          <li>Plak de code in het blok en klik op <strong>Bijwerken</strong>.</li>
        </Stappen>
        <p style={tekst}>Werk je met Elementor, gebruik dan de widget <strong>HTML</strong>. In de klassieke editor plak je
          de code op het tabblad <strong>Tekst</strong> (niet Visueel).</p>

        <h4 style={{ ...kop, fontSize: '.92rem', marginTop: 14 }}>WordPress, koppelen aan je eigen formulier</h4>
        <Stappen>
          <li>Installeer de gratis plugin <strong>WPCode</strong> (Plugins › Nieuwe plugin, zoek op "WPCode").</li>
          <li>Ga naar <strong>Code Snippets › Header &amp; Footer</strong>.</li>
          <li>Plak de code in het vak <strong>Footer</strong> en klik op <strong>Opslaan</strong>.</li>
        </Stappen>
        <p style={tekst}>Gebruik je een plugin die pagina's bewaart (cache), leeg die cache dan even.</p>

        <h4 style={{ ...kop, fontSize: '.92rem', marginTop: 14 }}>Wix</h4>
        <p style={tekst}>Bij Wix gebruik je het kant-en-klare formulier met de link (onder de code staat
          <strong> Link kopiëren</strong>):</p>
        <Stappen>
          <li>Open je site in de Wix-editor en ga naar de pagina waar het formulier moet komen.</li>
          <li>Klik links op het plusje (<strong>Elementen toevoegen</strong>) › <strong>Code insluiten</strong> (Embed Code) › <strong>Een site insluiten</strong> (Embed a site).</li>
          <li>Klik in het vak op <strong>Website-adres invoeren</strong> (Enter Website Address), plak de link en bevestig.</li>
          <li>Maak het vak breed genoeg en ongeveer 750 pixels hoog, en klik op <strong>Publiceren</strong>.</li>
        </Stappen>
        <p style={tekst}>Heeft je Wix-site nog geen eigen domein, vul bij stap 1 dan je adres van wixsite.com in, zoals
          <code> naam.wixsite.com</code>. Koppelen aan een formulier van Wix zelf kan niet: Wix laat geen eigen code bij
          zijn formulieren toe.</p>

        <h4 style={{ ...kop, fontSize: '.92rem', marginTop: 14 }}>Andere websites</h4>
        <p style={tekst}>Squarespace (blok <strong>Code</strong>), Webflow (<strong>Embed</strong>), Jimdo
          (<strong>Widget/HTML</strong>) en een zelfgebouwde site werken net als WordPress: plak de code op de plek van
          het formulier. Laat je je website door iemand anders beheren, stuur hem dan de code; meer is er niet nodig.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Stap 4. Test het</h3>
        <p style={tekst}>Klik op <strong>Testaanvraag versturen</strong>. Er komt dan een aanvraag van "Test Aanvraag"
          in je pipeline; met <strong>Bekijken</strong> open je hem meteen. Vul daarna zelf het formulier op je website in
          om te zien dat ook dat aankomt. Testaanvragen kun je gewoon verwijderen.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Veiligheid en spam</h3>
        <p style={tekst}>De code bevat geen geheime sleutel; je kunt hem gerust delen met wie je website bouwt. Aanvragen
          komen alleen binnen vanaf de adressen die je bij stap 1 opgeeft. Tegen spam zit er een verborgen veld in dat
          alleen robots invullen, en er geldt een limiet per IP-adres en per e-mailadres.</p>
      </div>

      <div style={blok}>
        <h3 style={kop}>Komt er niets binnen?</h3>
        <ul style={lijst}>
          <li>Staat <strong>Aanvragen ontvangen</strong> aan, en heb je op Opslaan geklikt?</li>
          <li>Staat het juiste adres bij stap 1? Een site op <code>www.mijnbedrijf.nl</code> is voor de browser iets anders
            dan <code>mijnbedrijf.nl</code>; met Toevoegen zetten we ze er allebei in. Een nieuw adres werkt binnen een
            minuut.</li>
          <li>Bij koppelen: is het e-mailveld gekoppeld, en staat de code op de pagina met het formulier?</li>
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
