// Caches the company_id of the logged-in user so service-layer inserts can
// satisfy RLS policies that require `company_id = my_company_id()`.
//
// App.jsx primes the cache after every successful profile load and clears it
// on logout. If a service runs before priming, `getCompanyId()` falls back to
// looking up the current profile via Supabase.

import { supabase } from "./supabase"

let cachedCompanyId = null

const STORAGE_KEY = "bb.currentCompanyId"

// Restore from sessionStorage on module load so a page refresh inside a tab
// doesn't briefly insert without company_id.
try {
  const stored = sessionStorage.getItem(STORAGE_KEY)
  if (stored) cachedCompanyId = stored
} catch { /* SSR / privacy mode */ }

export function setCompanyId(id) {
  cachedCompanyId = id || null
  try {
    if (id) sessionStorage.setItem(STORAGE_KEY, id)
    else sessionStorage.removeItem(STORAGE_KEY)
  } catch { /* ignore */ }
}

export function clearCompanyId() {
  setCompanyId(null)
}

export async function getCompanyId() {
  if (cachedCompanyId) return cachedCompanyId
  const { data } = await supabase.auth.getUser()
  const user = data?.user
  if (!user) return null
  const { data: row } = await supabase
    .from("profiles")
    .select("company_id")
    .eq("id", user.id)
    .maybeSingle()
  if (row?.company_id) {
    setCompanyId(row.company_id)
    return row.company_id
  }
  return null
}

// Convenience: merges company_id into a service payload if it isn't already
// set. Used by createCustomer, createDeal, createActivity, etc.
export async function withCompanyId(payload) {
  if (payload?.company_id) return payload
  const id = await getCompanyId()
  if (!id) return payload
  return { ...payload, company_id: id }
}
