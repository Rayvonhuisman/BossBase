// Insert helper that automatically retries while dropping columns the
// Supabase schema doesn't recognise. Lets us tolerate small schema drift
// (missing optional columns like `priority`, `kvk`, etc.) without crashing.
//
// Usage:
//   const { data, error } = await safeInsert(supabase, "deals", payload, "*, customers(*)")

const SCHEMA_MISS = /could not find the '([^']+)' column|column "([^"]+)"/i

export async function safeInsert(client, table, payload, select = "*") {
  let attempt = { ...payload }
  for (let i = 0; i < 8; i++) {
    const { data, error } = await client.from(table).insert(attempt).select(select).single()
    if (!error) return { data, error: null, payload: attempt }
    const match = (error.message || "").match(SCHEMA_MISS)
    const droppedKey = match ? (match[1] || match[2]) : null
    if (!droppedKey || !(droppedKey in attempt)) return { data: null, error, payload: attempt }
    delete attempt[droppedKey]
  }
  return { data: null, error: new Error("safeInsert: te veel onbekende kolommen"), payload: attempt }
}
