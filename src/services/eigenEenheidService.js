import { supabase } from "../lib/supabase"
import { withCompanyId } from "../lib/currentCompany"

// Eigen prijzen / eenheden: zelf aangemaakte regeltypes met een standaardprijs
// (en optioneel eigen eenheid-label + BTW). Verschijnen naast Uren/Km/Overig in
// de offerte/factuur-regelkeuze.

const toEigenEenheid = row => ({
  id: row.id,
  companyId: row.company_id,
  naam: row.naam || "",
  standaardPrijs: Number(row.standaard_prijs || 0),
  eenheidLabel: row.eenheid_label || "",
  // null = geen eigen BTW → val terug op bedrijfsstandaard bij gebruik.
  btwPct: row.btw_pct != null ? Number(row.btw_pct) : null,
  createdAt: row.created_at,
})

export async function getEigenEenheden() {
  const { data, error } = await supabase
    .from("eigen_eenheden")
    .select("*")
    .order("naam", { ascending: true })
  if (error) throw error
  return (data || []).map(toEigenEenheid)
}

export async function createEigenEenheid(input) {
  const base = {
    naam: (input.naam || "").trim(),
    standaard_prijs: Number(input.standaard_prijs ?? input.standaardPrijs ?? 0),
    eenheid_label: (input.eenheid_label ?? input.eenheidLabel ?? "").trim() || null,
    btw_pct: input.btw_pct ?? input.btwPct,
  }
  if (!base.naam) throw new Error("Naam is verplicht")
  base.btw_pct = base.btw_pct != null && base.btw_pct !== "" ? Number(base.btw_pct) : null

  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from("eigen_eenheden")
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toEigenEenheid(data)
}

export async function updateEigenEenheid(id, input) {
  const updates = {
    naam: input.naam != null ? (input.naam || "").trim() : undefined,
    standaard_prijs: (input.standaard_prijs ?? input.standaardPrijs) != null
      ? Number(input.standaard_prijs ?? input.standaardPrijs)
      : undefined,
    eenheid_label: (input.eenheid_label ?? input.eenheidLabel) != null
      ? ((input.eenheid_label ?? input.eenheidLabel) || "").trim() || null
      : undefined,
    btw_pct: input.btw_pct !== undefined || input.btwPct !== undefined
      ? ((input.btw_pct ?? input.btwPct) != null && (input.btw_pct ?? input.btwPct) !== "" ? Number(input.btw_pct ?? input.btwPct) : null)
      : undefined,
    updated_at: new Date().toISOString(),
  }
  Object.keys(updates).forEach(k => updates[k] === undefined && delete updates[k])

  const { data, error } = await supabase
    .from("eigen_eenheden")
    .update(updates)
    .eq("id", id)
    .select()
    .single()
  if (error) throw error
  return toEigenEenheid(data)
}

export async function deleteEigenEenheid(id) {
  const { error } = await supabase.from("eigen_eenheden").delete().eq("id", id)
  if (error) throw error
}
