import doc from '../../../../docs/juridisch/verwerkersovereenkomst.md?juridisch';
import JuridischDocument from './JuridischDocument.jsx';

export default function VerwerkersovereenkomstPage({ navigate }) {
  return <JuridischDocument navigate={navigate} doc={doc} pad="/verwerkersovereenkomst" naam="Verwerkersovereenkomst" />;
}
