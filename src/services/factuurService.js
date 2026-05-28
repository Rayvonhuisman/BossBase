import { supabase } from '../lib/supabase'
import { withCompanyId } from '../lib/currentCompany'
import { syncFactuurNaarMoneybird } from './accountingService'

const toFactuur = row => ({
  id: row.id,
  companyId: row.company_id,
  customerId: row.customer_id,
  projectId: row.project_id || null,
  nummer: row.nummer || '',
  factuurdatum: row.factuurdatum || null,
  vervaldatum: row.vervaldatum || null,
  betalingskenmerk: row.betalingskenmerk || '',
  status: row.status || 'concept',
  notities: row.notities || '',
  totaalExcl: Number(row.totaal_excl || 0),
  totaalIncl: Number(row.totaal_incl || 0),
  betaaldOp: row.betaald_op || null,
  createdAt: row.created_at,
  customerName: row.customers?.name || '',
  isCredit: row.is_credit || false,
  creditVanFactuurId: row.credit_van_factuur_id || null,
  gecrediteerd: row.gecrediteerd || false,
})

const toRegel = row => ({
  id: row.id,
  factuurId: row.factuur_id,
  type: row.type || 'stuks',
  omschrijving: row.omschrijving || '',
  aantal: Number(row.aantal || 1),
  eenheidsprijs: Number(row.eenheidsprijs || 0),
  btwPct: Number(row.btw_pct || 21),
  regelprijs: Number(row.regelprijs || 0),
  volgorde: Number(row.volgorde || 0),
})

export async function generateFactuurNummer() {
  const { count, error } = await supabase
    .from('facturen')
    .select('id', { count: 'exact', head: true })
  if (error) return 'BB-F000'
  return `BB-F${String((count || 0) + 1).padStart(3, '0')}`
}

export async function generateCreditFactuurNummer() {
  const { count, error } = await supabase
    .from('facturen')
    .select('id', { count: 'exact', head: true })
    .eq('is_credit', true)
  if (error) return 'BB-CF001'
  return `BB-CF${String((count || 0) + 1).padStart(3, '0')}`
}

export async function getFacturen() {
  const { data, error } = await supabase
    .from('facturen')
    .select('*, customers(name)')
    .order('created_at', { ascending: false })
  if (error) throw error
  return (data || []).map(toFactuur)
}

export async function createFactuur(input) {
  const nummer = input.nummer || (await generateFactuurNummer())
  const base = {
    customer_id: input.customer_id || null,
    project_id: input.project_id || input.projectId || null,
    nummer,
    factuurdatum: input.factuurdatum || new Date().toISOString().slice(0, 10),
    vervaldatum: input.vervaldatum || null,
    betalingskenmerk: input.betalingskenmerk || nummer,
    status: 'concept',
    notities: input.notities || null,
    totaal_excl: Number(input.totaal_excl || 0),
    totaal_incl: Number(input.totaal_incl || 0),
  }
  Object.keys(base).forEach(k => base[k] === null && delete base[k])
  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('facturen')
    .insert(payload)
    .select('*, customers(name)')
    .single()
  if (error) throw error
  return toFactuur(data)
}

export async function updateFactuur(id, input) {
  const updates = {}
  if ('status' in input)           updates.status = input.status
  if ('vervaldatum' in input)      updates.vervaldatum = input.vervaldatum
  if ('betalingskenmerk' in input) updates.betalingskenmerk = input.betalingskenmerk
  if ('notities' in input)         updates.notities = input.notities
  if ('totaal_excl' in input)      updates.totaal_excl = input.totaal_excl
  if ('totaal_incl' in input)      updates.totaal_incl = input.totaal_incl
  if (input.status === 'betaald' && !input.betaald_op) {
    updates.betaald_op = new Date().toISOString().slice(0, 10)
  }
  updates.updated_at = new Date().toISOString()
  const { data, error } = await supabase
    .from('facturen')
    .update(updates)
    .eq('id', id)
    .select('*, customers(name)')
    .single()
  if (error) throw error
  const result = toFactuur(data)
  if (input.status === 'betaald') {
    syncFactuurNaarMoneybird(id).catch(() => {})
  }
  return result
}

export async function deleteFactuur(id) {
  const { error } = await supabase.from('facturen').delete().eq('id', id)
  if (error) throw error
}

export async function getFactuurRegels(factuurId) {
  const { data, error } = await supabase
    .from('factuur_regels')
    .select('*')
    .eq('factuur_id', factuurId)
    .order('volgorde', { ascending: true })
  if (error) throw error
  return (data || []).map(toRegel)
}

export async function getAllFactuurRegels() {
  const { data, error } = await supabase
    .from('factuur_regels')
    .select('*')
  if (error) throw error
  return (data || []).map(toRegel)
}

export async function createCreditFactuur(origineleFactuurId, regels, origineleFactuur) {
  const nummer = await generateCreditFactuurNummer()
  const totaalExcl = -Math.abs(Math.round(regels.reduce((s, r) => s + Math.abs(Number(r.regelprijs || 0)), 0) * 100) / 100)
  const totaalBtw = Math.round(regels.reduce((s, r) => s + Math.abs(Number(r.regelprijs || 0)) * Number(r.btwPct || 21) / 100, 0) * 100) / 100
  const totaalIncl = -(Math.abs(totaalExcl) + totaalBtw)
  const base = {
    customer_id: origineleFactuur.customerId,
    nummer,
    factuurdatum: new Date().toISOString().slice(0, 10),
    status: 'verzonden',
    notities: `Creditering van factuur ${origineleFactuur.nummer}`,
    is_credit: true,
    credit_van_factuur_id: origineleFactuurId,
    totaal_excl: Math.round(totaalExcl * 100) / 100,
    totaal_incl: Math.round(totaalIncl * 100) / 100,
  }
  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('facturen')
    .insert(payload)
    .select('*, customers(name)')
    .single()
  if (error) throw error
  const creditFactuur = toFactuur(data)
  for (let i = 0; i < regels.length; i++) {
    const r = regels[i]
    await createFactuurRegel({
      factuur_id: creditFactuur.id,
      type: r.type,
      omschrijving: r.omschrijving,
      aantal: r.type === 'vast' ? 1 : Number(r.aantal || 1),
      eenheidsprijs: -Math.abs(Number(r.eenheidsprijs || 0)),
      btw_pct: Number(r.btwPct || 21),
      volgorde: i,
    })
  }
  await supabase
    .from('facturen')
    .update({ gecrediteerd: true, updated_at: new Date().toISOString() })
    .eq('id', origineleFactuurId)
  return creditFactuur
}

export async function createFactuurRegel(input) {
  const regelprijs = input.type === 'vast'
    ? Math.round(Number(input.eenheidsprijs || 0) * 100) / 100
    : Math.round(Number(input.aantal || 1) * Number(input.eenheidsprijs || 0) * 100) / 100
  const base = {
    factuur_id: input.factuur_id,
    type: input.type || 'stuks',
    omschrijving: input.omschrijving,
    aantal: input.type === 'vast' ? 1 : Number(input.aantal || 1),
    eenheidsprijs: Number(input.eenheidsprijs || 0),
    btw_pct: Number(input.btw_pct || 21),
    regelprijs,
    volgorde: Number(input.volgorde || 0),
  }
  if (!base.factuur_id) throw new Error('factuur_id is verplicht')
  if (!base.omschrijving) throw new Error('omschrijving is verplicht')
  const payload = await withCompanyId(base)
  const { data, error } = await supabase
    .from('factuur_regels')
    .insert(payload)
    .select()
    .single()
  if (error) throw error
  return toRegel(data)
}
