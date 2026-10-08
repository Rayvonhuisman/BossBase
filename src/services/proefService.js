// Modules gratis proberen en van pakket wisselen tijdens de proefperiode.
// De database bewaakt alles (alleen in de proef, alleen de eigenaar,
// afhankelijkheden): bb_proef_module_starten en bb_proef_pakket_wisselen.
import { supabase } from '../lib/supabase.js';
import { getModule } from '../lib/features.js';
import { proefDemo, proefDemoModules, zetProefDemo } from './planService.js';

/** Zet een module aan tot het einde van de proef. Geeft de keys terug die nu aan staan. */
export async function startProefModule(moduleKey) {
  if (proefDemo()) {
    const vereist = getModule(moduleKey)?.vereist;
    const keys = [vereist, moduleKey].filter(Boolean);
    zetProefDemo(null, [...new Set([...proefDemoModules(), ...keys])]);
    return keys;
  }
  const { data, error } = await supabase.rpc('bb_proef_module_starten', { p_module: moduleKey });
  if (error) throw new Error(error.message);
  return data?.modules || [];
}

/** Wissel in de proef van pakket: 'groei' of 'team'. */
export async function wisselProefPakket(plan) {
  if (proefDemo()) { zetProefDemo(plan); return plan; }
  const { data, error } = await supabase.rpc('bb_proef_pakket_wisselen', { p_plan: plan });
  if (error) throw new Error(error.message);
  return data;
}
