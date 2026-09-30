// Toegang tot gevoelige documenten (handtekeningen, ondertekende PDF's).
//
// Vroeger werd per document een ondertekende URL van 10 jaar in de database
// gezet. Zo'n link controleert geen gebruiker: wie hem heeft, kan het bestand
// tien jaar openen, ook na deactivatie. Nu wordt een link voor gebruik pas op het
// moment van openen gemaakt, na controle, en is kort geldig (KORT_GELDIG). Wat in
// de database staat, is tijdelijk een link van 24 uur (zie OPSLAG_GELDIG).
//
// Oude rijen bevatten nog de lange URL. padUit() haalt daar het pad uit, zodat
// ook die documenten via de korte route werken. De oude URL zelf blijft wel
// geldig tot zijn vervaltijd: dit trekt niets in.
export const KORT_GELDIG = 60 * 10

export const verwijzing = (bucket: string, pad: string) => `${bucket}/${pad}`

// Overgang: wat de sign-functies in de database zetten. Een app-tabblad dat
// nog van vóór de nieuwe frontend openstaat, gebruikt de opgeslagen waarde
// rechtstreeks als link; een kaal pad zou daar breken. Daarom een ondertekende
// URL die 24 uur geldig is (niet 10 jaar). De nieuwe app en document-url halen
// er het pad uit en maken zelf een link van 10 minuten. Lukt ondertekenen niet,
// dan de kale verwijzing (die werkt met de nieuwe app).
export const OPSLAG_GELDIG = 60 * 60 * 24

export async function opslagWaarde(admin: any, bucket: string, pad: string): Promise<string> {
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(pad, OPSLAG_GELDIG)
  return !error && data?.signedUrl ? data.signedUrl : verwijzing(bucket, pad)
}

/** Pad in de bucket uit een opgeslagen waarde: verwijzing, oude URL of kaal pad. */
export function padUit(bucket: string, waarde: string | null | undefined): string | null {
  if (!waarde) return null
  const s = String(waarde)
  if (s.startsWith(`${bucket}/`)) return s.slice(bucket.length + 1) || null
  const zonderQuery = s.split('?')[0]
  const merk = `/${bucket}/`
  const i = zonderQuery.indexOf(merk)
  if (i !== -1) return decodeURIComponent(zonderQuery.slice(i + merk.length)) || null
  if (!/^https?:\/\//.test(s)) return s
  return null
}

export async function kortLink(admin: any, bucket: string, waarde: string | null | undefined): Promise<string | null> {
  const pad = padUit(bucket, waarde)
  if (!pad) return null
  const { data, error } = await admin.storage.from(bucket).createSignedUrl(pad, KORT_GELDIG)
  return error ? null : data?.signedUrl ?? null
}
