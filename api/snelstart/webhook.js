// SnelStart koppelsleutel-webhook op ons eigen domein:
//   https://www.bossbase.nl/api/snelstart/webhook
//
// Dit is de URL die bij SnelStart geregistreerd staat. Hij doet zelf niets
// anders dan doorsturen naar de edge function `snelstart-webhook`, die het
// eigenlijke werk doet (sleutel opslaan, log). Zie de kop van
// supabase/functions/snelstart-webhook/index.ts.
//
// Waarom een doorgeefluik en niet rechtstreeks de Supabase-URL: de edge function
// wil een geheim ?key=-token, en dat hoort niet in een URL die in een formulier
// bij een derde staat. Het secret staat hier als Vercel-env
// SNELSTART_WEBHOOK_SECRET (dezelfde waarde als het Supabase-secret met die
// naam) en gaat alleen server-naar-server mee.
//
// Wat dat WEL en NIET betekent: SnelStart signeert zijn berichten niet, en dit
// adres is openbaar. Het secret bewijst nu alleen dat een verzoek via dit
// doorgeefluik kwam, niet dat het van SnelStart kwam. De echte bescherming is de
// ReferenceKey: 192 willekeurige bits per bedrijf, alleen bekend bij de admins
// van dat bedrijf en bij SnelStart (migratie 20260918140000). Zonder geldige
// ReferenceKey verandert er niets.
//
// Status en body van de edge function gaan ongewijzigd terug naar SnelStart:
// 2xx = verwerkt, anders niet (en SnelStart probeert het dan niet opnieuw).

const EDGE_URL = 'https://mawzqpnsluljxpbarhng.supabase.co/functions/v1/snelstart-webhook';

// Een koppelbericht is drie korte velden. Alles wat veel groter is, is geen
// SnelStart en hoeft de database niet in.
const MAX_BYTES = 16 * 1024;

const json = (body, status) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export async function POST(request) {
  const secret = process.env.SNELSTART_WEBHOOK_SECRET || '';
  if (!secret) {
    console.error('[snelstart-webhook] SNELSTART_WEBHOOK_SECRET ontbreekt in Vercel');
    return json({ error: 'Webhook niet geconfigureerd' }, 503);
  }

  const body = await request.text();
  if (body.length > MAX_BYTES) return json({ error: 'Bericht te groot' }, 413);

  // Een eventuele ?key= van de aanroeper gaat NIET mee: alleen ons eigen secret.
  let res;
  try {
    res = await fetch(`${EDGE_URL}?key=${encodeURIComponent(secret)}`, {
      method: 'POST',
      headers: { 'Content-Type': request.headers.get('content-type') || 'application/json' },
      body,
    });
  } catch (err) {
    // De edge function is niet bereikt, dus daar is ook niets gelogd. Dit is dan
    // het enige spoor; de 502 vertelt SnelStart dat de koppeling niet rond is.
    console.error('[snelstart-webhook] edge function onbereikbaar:', err?.message);
    return json({ error: 'Webhook tijdelijk niet bereikbaar' }, 502);
  }

  return new Response(await res.text(), {
    status: res.status,
    headers: { 'Content-Type': res.headers.get('content-type') || 'application/json' },
  });
}

// Alles behalve POST: expliciet weigeren, en niet doorvallen naar de SPA.
const nietToegestaan = () => json({ error: 'Method not allowed' }, 405);
export { nietToegestaan as GET, nietToegestaan as PUT, nietToegestaan as PATCH, nietToegestaan as DELETE };
