import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"
import { safeInsert } from "../lib/safeInsert"
import { logTijdlijnSafe } from "./klantTijdlijnService"

// Real DB columns: id, company_id, name, email, phone, address, postcode, city,
// kvk_number, btw_number, iban, logo_url, notes, created_at, updated_at.
// UI may carry richer fields (company, source, type) — those are
// kept as local UI state and stripped here before talking to Supabase.

// TODO: remove inappropriate demo customer data from Supabase (customer named "Niels is gay")
const BLOCKED_NAMES = new Set(['niels is gay']);
export const sanitizeName = name =>
  BLOCKED_NAMES.has((name || '').toLowerCase().trim()) ? 'Demo klant' : (name || 'Naamloos');

const toCustomer = (row, index = 0) => ({
  id: row.id,
  // The DB only stores `name`. We surface it as both customer name and company label
  // so the existing UI keeps working without a separate company column.
  name: sanitizeName(row.name),
  company: sanitizeName(row.name),
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
  moneybirdId: row.moneybird_id || null,
  // UI helpers — synthesized, not stored:
  av: index,
  stage: "new_lead",
  total: 0,
  paid: 0,
  // UI-only display defaults (no DB columns for these):
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
  }
  if (form.company_id || form.companyId) {
    payload.company_id = form.company_id || form.companyId
  }
  // Drop nulls so we don't overwrite values during partial updates.
  Object.keys(payload).forEach(k => payload[k] == null && delete payload[k])
  return payload
}

export async function listCustomers() {
  const { data, error } = await supabase.from("customers").select("*").order("created_at", { ascending: false })
  if (error) throw error
  return (data || []).map((row, i) => toCustomer(row, i))
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

export async function updateCustomerNotities(id, notities) {
  const { data, error } = await supabase
    .from("customers")
    .update({ notities: notities || null })
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toCustomer(data)
}

export async function deleteCustomer(id) {
  const { error } = await supabase.from("customers").delete().eq("id", id)
  if (error) throw error
}
