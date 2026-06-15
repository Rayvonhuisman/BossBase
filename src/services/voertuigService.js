import { supabase } from '../lib/supabase.js';
import { withCompanyId } from '../lib/currentCompany.js';

const toVoertuig = row => ({
  id: row.id,
  companyId: row.company_id,
  naam: row.naam,
  kenteken: row.kenteken || '',
  kleur: row.kleur || '#1DDB62',
  actief: row.actief !== false,
  createdAt: row.created_at,
});

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
  if (!base.naam) throw new Error('naam is verplicht');
  const payload = await withCompanyId(base);
  const { data, error } = await supabase.from('voertuigen').insert(payload).select().single();
  if (error) throw error;
  return toVoertuig(data);
}

export async function updateVoertuig(id, input) {
  const updates = { naam: input.naam, kenteken: input.kenteken || null, kleur: input.kleur, actief: input.actief };
  const { data, error } = await supabase.from('voertuigen').update(updates).eq('id', id).select().single();
  if (error) throw error;
  return toVoertuig(data);
}

export async function deleteVoertuig(id) {
  const { error } = await supabase.from('voertuigen').delete().eq('id', id);
  if (error) throw error;
}

export async function deactiveerVoertuig(id) {
  return updateVoertuig(id, { actief: false });
}
