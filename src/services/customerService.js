import { negeerBijImport } from './accountingService.js'
import { supabase } from "../lib/supabase"
import { alleRijen } from "../lib/alleRijen.js"
import { withCompanyId } from "../lib/currentCompany"
import { safeInsert } from "../lib/safeInsert"
import { logTijdlijnSafe } from "./klantTijdlijnService"

// Real DB columns: id, company_id, name, email, phone, address, postcode, city,
// kvk_number, btw_number, iban, logo_url, notes, type, source, created_at,
// updated_at. `company` is UI-only and is folded into `name`.

// De vaste keuzes voor het klanttype. De database dwingt dezelfde lijst af
// (customers_type_check); een andere waarde wordt hier weggelaten in plaats van
// de hele opslag te laten mislukken.
export const KLANT_TYPES = ['Particulier', 'Zakelijk', 'VvE', 'Aannemer'];

// Nette weergavenaam met fallback wanneer de naam leeg is.
export const sanitizeName = name => (name || '').trim() || 'Naamloos';

const toCustomer = (row, index = 0) => ({
  id: row.id,
  // The DB only stores `name`. We surface it as both customer name and company label
  // so the existing UI keeps working without a separate company column.
  name: sanitizeName(row.name),
  // Geen aparte bedrijfsnaam in de tabel; vroeger stond hier de naam nog eens,
  // waardoor overal "Priya Meijer · Priya Meijer" verscheen.
  company: '',
  email: row.email || "",
  phone: row.phone || "",
  city: row.city || "",
  address: row.address || "",
  postcode: row.postcode || "",
  kvkNumber: row.kvk_number || "",
  btwNumber: row.btw_number || "",
  iban: row.iban || "",
  notes: row.notes || "",
  notities: row.notities || "",
  logoUrl: row.logo_url || "",
  companyId: row.company_id || null,
  createdAt: row.created_at || null,
  moneybirdId: row.moneybird_id || null,
  snelstartId: row.snelstart_id || null,
  // De kolom bestond al (customers.contactpersoon) maar kwam nergens in de code
  // voor: niet in deze mapper, niet op de klantkaart. Het projectoverzicht toont
  // en bewerkt hem, dus hij moet hier langs.
  contactpersoon: row.contactpersoon || "",
  // Betaaltermijn van deze klant in dagen; leeg = de standaard van 14.
  betaaltermijnDagen: row.betaaltermijn_dagen ?? null,
  // UI helpers — synthesized, not stored:
  av: index,
  stage: "new_lead",
  // Let op: géén `total`/`paid` hier. Die stonden hier hardgecodeerd op 0,
  // waardoor de klantenlijst overal €0 toonde. De bedragen per klant komen uit
  // customerTotalsService (afgeleid van offertes + facturen).
  // Zonder gekozen type tonen we "Klant"; dat label wordt niet opgeslagen
  // (zie KLANT_TYPES in mapCustomerFormToPayload).
  type: row.type || "Klant",
  source: row.source || "",
  raw: row,
})

export function mapCustomerFormToPayload(form = {}) {
  // Prefer the explicit name; fall back to the company label so business contacts
  // entered via the "Bedrijfsnaam" field still land in `customers.name`.
  const trim = v => (typeof v === "string" ? v.trim() : "")
  const name = trim(form.name) || trim(form.company) || trim(form.company_name) || ""
  const payload = {
    name,
    email: form.email || null,
    phone: form.phone || null,
    address: form.address || null,
    postcode: form.postcode || null,
    city: form.city || null,
    kvk_number: form.kvkNumber || form.kvk_number || null,
    btw_number: form.btwNumber || form.btw_number || null,
    iban: form.iban || null,
    notes: form.notes || null,
    logo_url: form.logo_url || form.logoUrl || null,
    contactpersoon: form.contactpersoon || null,
    type: KLANT_TYPES.includes(form.type) ? form.type : null,
    source: trim(form.source) || null,
  }
  if (form.company_id || form.companyId) {
    payload.company_id = form.company_id || form.companyId
  }
  // Drop nulls so we don't overwrite values during partial updates.
  Object.keys(payload).forEach(k => payload[k] == null && delete payload[k])
  return payload
}

export async function listCustomers() {
  const rijen = await alleRijen(() => supabase
    .from("customers")
    .select("*", { count: "exact" })
    .order("created_at", { ascending: false })
    .order("id", { ascending: true }))
  return rijen.map((row, i) => toCustomer(row, i))
}

export async function getCustomer(id) {
  const { data, error } = await supabase.from("customers").select("*").eq("id", id).single()
  if (error) throw error
  return toCustomer(data)
}

export async function createCustomer(input) {
  const base = mapCustomerFormToPayload(input)
  if (!base.name) throw new Error("Naam of bedrijfsnaam is verplicht")
  const payload = await withCompanyId(base)
  const { data, error } = await safeInsert(supabase, "customers", payload)
  if (error) throw error
  const customer = toCustomer(data)
  supabase.functions.invoke('moneybird-update-contact', { body: { customer_id: customer.id } }).catch(() => {})
  logTijdlijnSafe(customer.id, 'klant_aangemaakt', 'Klant toegevoegd aan het systeem')
  return customer
}

export async function updateCustomer(id, input) {
  const payload = mapCustomerFormToPayload(input)
  const { data, error } = await supabase.from("customers").update(payload).eq("id", id).select().single()
  if (error) throw error
  const customer = toCustomer(data)
  if (customer.moneybirdId) {
    supabase.functions.invoke('moneybird-update-contact', { body: { customer_id: id } }).catch(() => {})
  }
  return customer
}

export async function deleteCustomer(id) {
  // Eerst opzoeken, daarna pas verwijderen: na de delete is de rij weg en is
  // niet meer te achterhalen of hij uit SnelStart kwam.
  const { data: bestaand } = await supabase
    .from("customers").select("snelstart_id").eq("id", id).maybeSingle()

  const { error } = await supabase.from("customers").delete().eq("id", id)
  if (error) throw error

    // Onthouden dat dit record hier bewust weg is, zodat de import het niet
  // terughaalt. Zonder deze regel komt alles wat je verwijdert bij de volgende
  // sync gewoon terug — de import kijkt naar wat er in SnelStart staat, niet naar
  // wat jij hebt besloten.
  //
  // Retourwaarde in plaats van een throw: de klant is echt weg, dus de lijst mag
  // bijgewerkt worden — maar een mislukte prullenbak moet de gebruiker wel zien.
  if (bestaand?.snelstart_id) {
    return await negeerBijImport('klant', bestaand.snelstart_id, 'verwijderd in BossBase')
  }
  return null
}
