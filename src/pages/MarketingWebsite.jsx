// Marketing entry point — keeps the existing `MarketingWebsite` import path
// stable for App.jsx while the actual layout lives in pages/marketing/.
import HomePage from './marketing/HomePage.jsx';

export default function MarketingWebsite({ navigate, isAuthenticated = false }) {
  return <HomePage navigate={navigate} isAuthenticated={isAuthenticated} />;
}
