// Een juridisch document als pagina op de site. De tekst komt uit
// docs/juridisch/*.md (import met ?juridisch, zie scripts/vite-plugin-content.mjs);
// de build weigert een document met open plekken of een afwijkende versie.
import { PaginaSchil, PaginaKop, Sectie, Tekst } from '../../../marketing/templates/Onderdelen.jsx';

export default function JuridischDocument({ navigate, doc, pad, naam }) {
  return (
    <PaginaSchil navigate={navigate}>
      <PaginaKop
        kruimels={[{ naam: 'Home', pad: '/' }, { naam, pad }]}
        kicker="Privacy"
        h1={naam}
        lead={`Versie ${doc.versie}, geldig vanaf ${doc.geldigVanaf}.`}
      />
      <Sectie>
        <Tekst html={doc.html} />
      </Sectie>
    </PaginaSchil>
  );
}
