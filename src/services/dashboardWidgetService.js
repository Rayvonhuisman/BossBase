import { supabase } from '../lib/supabase.js';
import { withCompanyId } from '../lib/currentCompany.js';

async function currentUserId() {
  const { data: { user } } = await supabase.auth.getUser();
  return user?.id || null;
}

export async function loadUserWidgets() {
  const uid = await currentUserId();
  if (!uid) return null;

  const { data, error } = await supabase
    .from('dashboard_widgets')
    .select('*')
    .eq('user_id', uid)
    .order('position', { ascending: true });

  if (error) {
    console.warn('[bb:dashboard] loadUserWidgets error:', error.message, error.code);
    throw error;
  }
  return data || [];
}

export async function saveUserWidgets(widgets) {
  const uid = await currentUserId();
  if (!uid) throw new Error('Niet ingelogd');

  const base = await withCompanyId({ user_id: uid });
  if (!base.company_id) throw new Error('Bedrijf niet gevonden — herlaad de pagina en probeer opnieuw.');

  const { error: delErr } = await supabase
    .from('dashboard_widgets')
    .delete()
    .eq('user_id', uid);

  if (delErr) {
    console.warn('[bb:dashboard] delete error:', delErr.message);
    throw delErr;
  }

  if (widgets.length === 0) return [];

  const rows = widgets.map((w, i) => ({
    ...base,
    widget_type: w.widget_type,
    title: w.title || null,
    position: i,
    size: w.size || 'medium',
    settings: w.settings || {},
    is_visible: true,
  }));

  const { data, error } = await supabase
    .from('dashboard_widgets')
    .insert(rows)
    .select();

  if (error) {
    console.warn('[bb:dashboard] insert error:', error.message, error.code);
    throw error;
  }
  return data || [];
}

export async function updateWidgetSettings(widgetId, settings) {
  const uid = await currentUserId();
  if (!uid) return;

  const { error } = await supabase
    .from('dashboard_widgets')
    .update({ settings, updated_at: new Date().toISOString() })
    .eq('id', widgetId)
    .eq('user_id', uid);

  if (error) console.warn('[bb:dashboard] updateWidgetSettings error:', error.message);
}
