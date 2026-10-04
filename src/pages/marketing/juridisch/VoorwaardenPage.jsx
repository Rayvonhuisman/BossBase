import doc from '../../../../docs/juridisch/algemene-voorwaarden.md?juridisch';
import JuridischDocument from './JuridischDocument.jsx';

export default function VoorwaardenPage({ navigate }) {
  return <JuridischDocument navigate={navigate} doc={doc} pad="/voorwaarden" naam="Algemene voorwaarden" kicker="Voorwaarden" />;
}
