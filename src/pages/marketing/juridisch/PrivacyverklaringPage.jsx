import doc from '../../../../docs/juridisch/privacyverklaring.md?juridisch';
import JuridischDocument from './JuridischDocument.jsx';

export default function PrivacyverklaringPage({ navigate }) {
  return <JuridischDocument navigate={navigate} doc={doc} pad="/privacy" naam="Privacyverklaring" />;
}
