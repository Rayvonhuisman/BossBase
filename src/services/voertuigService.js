import { supabase } from '../lib/supabase.js';
import { withCompanyId } from '../lib/currentCompany.js';

const toVoertuig = row => ({
  id: row.id,
  companyId: row.company_id,
  naam: row.naam,
  kenteken: row.kenteken || '',
  kleur: row.kleur || '#1DDB62',
  actief: row.actief !== false,
  // Plekken inclusief de bestuurder. null = geen limiet.
  zitplaatsen: row.zitplaatsen ?? null,
  createdAt: row.created_at,
});

const metZitplaatsenUitleg = error =>
  (/zitplaatsen/i.test(error?.message || '')
    ? new Error('Zitplaatsen instellen werkt pas na de database-update (migratie voertuigen_per_dag).')
    : error);

// Leeg of ongeldig = geen limiet. De database staat 1 t/m 99 toe.
function naarZitplaatsen(waarde) {
  const n = parseInt(waarde, 10);
  return Number.isFinite(n) && n >= 1 ? Math.min(n, 99) : null;
}

export async function getVoertuigen({ inclusiefInactief = false } = {}) {
  let q = supabase.from('voertuigen').select('*').order('naam');
  if (!inclusiefInactief) q = q.eq('actief', true);
  const { data, error } = await q;
  if (error) throw error;
  return (data || []).map(toVoertuig);
}

export async function createVoertuig(input) {
  const base = {
    naam: input.naam,
    kenteken: input.kenteken || null,
    kleur: input.kleur || '#1DDB62',
    actief: true,
  };
  const plekken = naarZitplaatsen(input.zitplaatsen);
  if (plekken != null) base.zitplaatsen = plekken;
  if (!base.naam) throw new Error('naam is verplicht');
  const payload = await withCompanyId(base);
  const { data, error } = await supabase.from('voertuigen').insert(payload).select().single();
  if (error) throw metZitplaatsenUitleg(error);
  return toVoertuig(data);
}

export async function updateVoertuig(id, input) {
  const updates = { naam: input.naam, kenteken: input.kenteken || null, kleur: input.kleur, actief: input.actief };
  if ('zitplaatsen' in input) updates.zitplaatsen = naarZitplaatsen(input.zitplaatsen);
  let { data, error } = await supabase.from('voertuigen').update(updates).eq('id', id).select().single();
  // Vóór de database-update bestaat de kolom niet. Leeg laten is dan gewoon de
  // oude situatie, dus opnieuw zonder; een ingevuld aantal niet stil weggooien.
  if (error && /zitplaatsen/i.test(error.message || '') && updates.zitplaatsen == null) {
    delete updates.zitplaatsen;
    ({ data, error } = await supabase.from('voertuigen').update(updates).eq('id', id).select().single());
  }
  if (error) throw metZitplaatsenUitleg(error);
  return toVoertuig(data);
}

export async function deleteVoertuig(id) {
  const { error } = await supabase.from('voertuigen').delete().eq('id', id);
  if (error) throw error;
}

export async function deactiveerVoertuig(id) {
  return updateVoertuig(id, { actief: false });
}
