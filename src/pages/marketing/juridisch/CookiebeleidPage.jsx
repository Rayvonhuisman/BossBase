import doc from '../../../../docs/juridisch/cookiebeleid.md?juridisch';
import JuridischDocument from './JuridischDocument.jsx';

export default function CookiebeleidPage({ navigate }) {
  return <JuridischDocument navigate={navigate} doc={doc} pad="/cookieverklaring" naam="Cookiebeleid" />;
}
