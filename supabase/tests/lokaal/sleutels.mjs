import { jwt } from './gateway.mjs';
// Alleen voor de lokale omgeving (eigen geheim in ../jwt_secret); 10 jaar geldig.
const exp = Math.floor(Date.now() / 1000) + 10 * 365 * 86400;
console.log(`ANON=${jwt({ role: 'anon', iss: 'lokaal', exp })}`);
console.log(`SERVICE=${jwt({ role: 'service_role', iss: 'lokaal', exp })}`);
