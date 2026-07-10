import { supabase } from '../lib/supabase.js';
import { getCompanyId } from '../lib/currentCompany.js';
import { mailTemplate } from '../utils/mailTemplate.js';

const toNotification = row => ({
  id: row.id,
  userId: row.user_id,
  type: row.type,
  title: row.title,
  body: row.body || '',
  link: row.link || '',
  relatedType: row.related_type || '',
  relatedId: row.related_id || null,
  createdBy: row.created_by || null,
  createdByName: row.creator?.full_name || '',
  readAt: row.read_at || null,
  createdAt: row.created_at,
});

// Collega-notificaties worden aangemaakt via de create-notification edge
// function (service-role). De RLS INSERT-policy op notifications staat clients
// alleen self-insert toe; meldingen voor collega's lopen daarom via deze edge
// function, die valideert dat de doelgebruiker in hetzelfde bedrijf zit.
async function pushNotifications(notifications) {
  const list = (notifications || []).filter(Boolean);
  if (!list.length) return;
  try {
    await supabase.functions.invoke('create-notification', { body: { notifications: list } });
  } catch (e) {
    if (import.meta.env.DEV) console.warn('[notificatie] edge insert mislukt', e?.message);
  }
}

export async function createNotification(input) {
  await pushNotifications([{
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body || null,
    link: input.link || null,
    related_type: input.relatedType || null,
    related_id: input.relatedId || null,
  }]);
}

export async function listNotifications() {
  const { data, error } = await supabase
    .from('notifications')
    .select('*, creator:created_by(full_name)')
    .order('created_at', { ascending: false })
    .limit(50);
  if (error) return [];
  return (data || []).map(toNotification);
}

export async function markNotificationRead(id) {
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', id);
}

export async function markAllNotificationsRead() {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('user_id', user.id)
    .is('read_at', null);
}

// ── HELPERS ──────────────────────────────────────────────────────────────────

function toAbsoluteUrl(link) {
  if (!link) return undefined
  if (link.startsWith('http')) return link
  return `https://www.bossbase.nl/${link.replace(/^\//, '')}`
}

// ── MENTION HELPERS ──────────────────────────────────────────────────────────

// Parse mentions from text → [{ name, userId }]. Herkent ZOWEL de legacy
// platte-tekst markup @[Naam](id) ALS de nieuwe mention-spans uit NoteEditor:
//   <span class="bb-mention" data-id="u123" data-name="Jan">@Jan</span>
// Dubbele user-ids worden ontdubbeld zodat iemand niet twee notificaties krijgt.
export function extractMentions(text) {
  if (!text) return [];
  const results = [];

  // 1. Legacy markup @[Naam](id)
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    results.push({ name: m[1], userId: m[2] });
  }

  // 2. Mention-spans (attribuut-volgorde maakt niet uit)
  const reSpan = /<span\b[^>]*\bclass="[^"]*\bbb-mention\b[^"]*"[^>]*>/gi;
  let s;
  while ((s = reSpan.exec(text)) !== null) {
    const tag = s[0];
    const id = (tag.match(/\bdata-id="([^"]*)"/) || [])[1];
    const name = (tag.match(/\bdata-name="([^"]*)"/) || [])[1];
    if (id) results.push({ name: name || '', userId: id });
  }

  // Ontdubbel op userId
  const seen = new Set();
  return results.filter(r => r.userId && !seen.has(r.userId) && seen.add(r.userId));
}

// Strip mentions + HTML-opmaak naar leesbare platte tekst (voor notificatie-body).
export function stripMentions(text) {
  if (!text) return '';
  return text
    .replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1') // legacy markup → @Naam
    .replace(/<[^>]*>/g, ' ')                  // alle HTML-tags weg (mention-span laat @Naam-tekst staan)
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

// Create in-app notifications + optional email for all @mentions in a text
export async function createMentionNotifications({ text, relatedType, relatedId, link, creatorId, creatorName, contextName }) {
  const mentions = extractMentions(text);
  if (!mentions.length) return;

  const companyId = await getCompanyId();
  if (!companyId) return;

  const plain = stripMentions(text).slice(0, 120);

  const notifRows = [];
  for (const { name, userId } of mentions) {
    if (userId === creatorId) continue;
    // De e-mail-HTML wordt hier gebouwd, maar het e-mailADRES wordt NIET hier
    // opgehaald: dat gebeurt server-side in de create-notification edge function
    // (auth.users → company_members), zodat adressen nooit naar de client lekken.
    const html = mailTemplate({
      title: `${creatorName || 'Collega'} heeft je getagd`,
      preheader: contextName ? `Getagd bij ${contextName}` : 'Je bent getagd in een notitie',
      body: `<p>Hoi ${name},</p>
             <p><strong>${creatorName || 'Een collega'}</strong> heeft je getagd${contextName ? ` bij <strong>${contextName}</strong>` : ''} in een notitie:</p>
             <blockquote style="margin:12px 0;padding:12px 16px;background:#f9fafb;border-left:3px solid #1DDB62;border-radius:4px;color:#374151;">
               ${plain}
             </blockquote>`,
      buttonText: link ? 'Bekijk notitie' : undefined,
      buttonUrl: toAbsoluteUrl(link),
    });
    notifRows.push({
      user_id: userId,
      type: 'mention',
      title: `${creatorName || 'Iemand'} heeft je getagd${contextName ? ` bij ${contextName}` : ''}`,
      body: plain || null,
      link: link || null,
      related_type: relatedType || null,
      related_id: relatedId || null,
      email: { subject: `${creatorName || 'Collega'} heeft je getagd in een notitie`, html },
    });
  }

  await pushNotifications(notifRows);
}

// Create an assignment notification + optional email.
// sendMail=false → alléén de in-app melding (het "Stuur medewerker een e-mail"
// vinkje op de inplan-/toewijs-schermen stuurt dit aan). Het e-mailADRES wordt
// nooit hier opgehaald: de create-notification edge function lost dat server-
// side op (auth.users → company_members), zodat adressen niet naar de client
// lekken.
export async function createAssignmentNotification({ assignedToUserId, assignedToName, type, title, body, link, relatedType, relatedId, creatorId, creatorName, sendMail = true }) {
  if (!assignedToUserId || assignedToUserId === creatorId) return;

  const companyId = await getCompanyId();
  if (!companyId) return;

  const notif = {
    user_id: assignedToUserId,
    type,
    title,
    body: body || null,
    link: link || null,
    related_type: relatedType || null,
    related_id: relatedId || null,
  };

  if (sendMail) {
    const itemName = title.replace('Je bent toegewezen aan ', '');
    const html = mailTemplate({
      title: 'Nieuwe toewijzing',
      preheader: `Je bent toegewezen aan ${itemName}`,
      body: `<p>Hoi ${assignedToName || 'collega'},</p>
             <p><strong>${creatorName || 'Een collega'}</strong> heeft je toegewezen aan: <strong>${itemName}</strong></p>
             ${body ? `<p style="color:#555;">${body}</p>` : ''}`,
      buttonText: link ? 'Bekijk details' : undefined,
      buttonUrl: toAbsoluteUrl(link),
    });
    notif.email = { subject: `Nieuwe toewijzing: ${itemName}`, html };
  }

  await pushNotifications([notif]);
}

// Notificeer alle NIEUW toegewezen medewerkers uit een assigned_to_ids-lijst:
// alleen ids die niet in prevUserIds zaten, jezelf overgeslagen. Eén ingang voor
// alle inplan-/toewijs-schermen die met een lijst werken (activiteit, werkbon,
// planning). members = teamleden-lijst ({ id, fullName }) voor de mail-aanhef.
export async function notifyNewAssignees({ userIds = [], prevUserIds = [], members = [], sendMail = true, type, title, body, link, relatedType, relatedId, creatorId, creatorName }) {
  const prev = new Set((prevUserIds || []).filter(Boolean));
  const fresh = [...new Set((userIds || []).filter(Boolean))].filter(id => !prev.has(id) && id !== creatorId);
  if (!fresh.length) return;
  await Promise.all(fresh.map(uid => {
    const name = (members || []).find(m => m.id === uid)?.fullName;
    return createAssignmentNotification({
      assignedToUserId: uid, assignedToName: name, type, title, body, link,
      relatedType, relatedId, creatorId, creatorName, sendMail,
    }).catch(() => {});
  }));
}

// ── TEAM MEMBERS HELPER ──────────────────────────────────────────────────────
// Eén bron voor "actieve teamleden": dropdowns, @mentions, planning-rijen,
// toewijzingen. Gedeactiveerde (actief=false) én verwijderde (rij weg) profielen
// vallen hier automatisch buiten, zodat ze nergens meer opduiken.

export async function getActiveTeamMembers({ includeSelf = false } = {}) {
  const companyId = await getCompanyId();
  if (!companyId) return [];

  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  let query = supabase
    .from('profiles')
    .select('id, full_name')
    .eq('company_id', companyId)
    .eq('actief', true)
    .order('full_name', { ascending: true });

  if (!includeSelf && currentUserId) query = query.neq('id', currentUserId);

  const { data, error } = await query;
  if (import.meta.env.DEV) console.log('[getActiveTeamMembers] rows:', data?.length ?? 0, 'error:', error?.message ?? null);
  return (data || []).map(r => ({ id: r.id, fullName: r.full_name || '' })).filter(m => m.fullName);
}

// Backwards-compatibele naam — levert ALLE actieve teamleden, inclusief jezelf,
// zodat je in "Toegewezen aan"-dropdowns (activiteit, werkbon, agenda) ook
// jezelf kunt kiezen. @-tagging toont zo ook jezelf (zelf-notificatie wordt
// elders al uitgefilterd).
export async function getTeamMembers() {
  return getActiveTeamMembers({ includeSelf: true });
}
