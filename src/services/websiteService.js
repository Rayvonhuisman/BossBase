// De pagina Website: lezen via de RPC, alles wat iets verandert, mailt of
// afrekent via de edge function `website`.
import { supabase } from '../lib/supabase.js';

async function edgeFout(error) {
  let bericht = error?.message || 'Er ging iets mis';
  let payload = null;
  try { payload = await error?.context?.json(); } catch { /* geen JSON-body */ }
  if (payload?.error) bericht = payload.error;
  const err = new Error(bericht);
  if (payload?.code) err.code = payload.code;
  return err;
}

async function actie(body) {
  const { data, error } = await supabase.functions.invoke('website', { body });
  if (error) throw await edgeFout(error);
  if (data?.error) throw new Error(data.error);
  return data;
}

export async function getMijnWebsite() {
  const { data, error } = await supabase.rpc('get_mijn_website');
  if (error) throw error;
  return data;
}

export const maakIntakeLink   = ()                 => actie({ actie: 'intake-link' });
export const upgradeWebsite   = ({ pakket, wijze }) => actie({ actie: 'upgrade', pakket, wijze });
export const opnieuwBetalen   = betalingId         => actie({ actie: 'opnieuw-betalen', betalingId });
export const vraagWijzigingAan = ({ soort, omschrijving }) => actie({ actie: 'verzoek', soort, omschrijving });
export const vraagDomeinAan   = domein             => actie({ actie: 'domein', domein });
export const geefFeedback     = tekst              => actie({ actie: 'feedback', tekst });
export const bestelExtra      = ({ extra, aantal, wijze }) => actie({ actie: 'extra', extra, aantal, wijze });
export const vraagEmailAan    = adres              => actie({ actie: 'email', adres });
