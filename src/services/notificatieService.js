import { supabase } from '../lib/supabase.js';
import { getCompanyId } from '../lib/currentCompany.js';
import { sendEmail } from './emailService.js';
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

// Parse @[Name](userId) from text → [{ name, userId }]
export function extractMentions(text) {
  if (!text) return [];
  const results = [];
  const re = /@\[([^\]]+)\]\(([^)]+)\)/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    results.push({ name: m[1], userId: m[2] });
  }
  return results;
}

// Strip mention markup to plain text for display/body
export function stripMentions(text) {
  if (!text) return '';
  return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
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
    notifRows.push({
      user_id: userId,
      type: 'mention',
      title: `${creatorName || 'Iemand'} heeft je getagd${contextName ? ` bij ${contextName}` : ''}`,
      body: plain || null,
      link: link || null,
      related_type: relatedType || null,
      related_id: relatedId || null,
    });

    // Email notification (best-effort, non-blocking)
    try {
      const { data: member } = await supabase
        .from('company_members')
        .select('email')
        .eq('profile_id', userId)
        .eq('company_id', companyId)
        .maybeSingle();
      const toEmail = member?.email;
      if (toEmail) {
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
        await sendEmail({ to: toEmail, subject: `${creatorName || 'Collega'} heeft je getagd in een notitie`, html }).catch(() => {});
      }
    } catch { /* email is non-blocking */ }
  }

  await pushNotifications(notifRows);
}

// Create an assignment notification + optional email
export async function createAssignmentNotification({ assignedToUserId, assignedToName, type, title, body, link, relatedType, relatedId, creatorId, creatorName }) {
  if (!assignedToUserId || assignedToUserId === creatorId) return;

  const companyId = await getCompanyId();
  if (!companyId) return;

  await pushNotifications([{
    user_id: assignedToUserId,
    type,
    title,
    body: body || null,
    link: link || null,
    related_type: relatedType || null,
    related_id: relatedId || null,
  }]);

  // Email notification (best-effort)
  try {
    const { data: member } = await supabase
      .from('company_members')
      .select('email')
      .eq('profile_id', assignedToUserId)
      .eq('company_id', companyId)
      .maybeSingle();
    const toEmail = member?.email;
    if (toEmail) {
      const itemName = title.replace('Je bent toegewezen aan ', '')
      const html = mailTemplate({
        title: 'Nieuwe toewijzing',
        preheader: `Je bent toegewezen aan ${itemName}`,
        body: `<p>Hoi ${assignedToName || 'collega'},</p>
               <p><strong>${creatorName || 'Een collega'}</strong> heeft je toegewezen aan: <strong>${itemName}</strong></p>
               ${body ? `<p style="color:#555;">${body}</p>` : ''}`,
        buttonText: link ? 'Bekijk details' : undefined,
        buttonUrl: toAbsoluteUrl(link),
      });
      await sendEmail({ to: toEmail, subject: `Nieuwe toewijzing: ${itemName}`, html }).catch(() => {});
    }
  } catch { /* email is non-blocking */ }
}

// ── TEAM MEMBERS HELPER ──────────────────────────────────────────────────────

export async function getTeamMembers() {
  const companyId = await getCompanyId();
  if (import.meta.env.DEV) console.log('[getTeamMembers] companyId:', companyId);
  if (!companyId) return [];

  const { data: { user } } = await supabase.auth.getUser();
  const currentUserId = user?.id;

  let query = supabase
    .from('profiles')
    .select('id, full_name')
    .eq('company_id', companyId)
    .order('full_name', { ascending: true });

  if (currentUserId) query = query.neq('id', currentUserId);

  const { data, error } = await query;
  if (import.meta.env.DEV) console.log('[getTeamMembers] rows:', data?.length ?? 0, 'error:', error?.message ?? null);
  return (data || []).map(r => ({ id: r.id, fullName: r.full_name || '' })).filter(m => m.fullName);
}
