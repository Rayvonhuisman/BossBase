import { supabase } from '../lib/supabase.js';
import { getCompanyId } from '../lib/currentCompany.js';
import { sendEmail } from './emailService.js';

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

export async function createNotification(input) {
  const companyId = await getCompanyId();
  if (!companyId) return;
  const { error } = await supabase.from('notifications').insert({
    company_id: companyId,
    user_id: input.userId,
    type: input.type,
    title: input.title,
    body: input.body || null,
    link: input.link || null,
    related_type: input.relatedType || null,
    related_id: input.relatedId || null,
    created_by: input.createdBy || null,
  });
  if (error) console.warn('[notificatie] insert mislukt', error.message);
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

  for (const { name, userId } of mentions) {
    if (userId === creatorId) continue;
    try {
      await supabase.from('notifications').insert({
        company_id: companyId,
        user_id: userId,
        type: 'mention',
        title: `${creatorName || 'Iemand'} heeft je getagd${contextName ? ` bij ${contextName}` : ''}`,
        body: plain || null,
        link: link || null,
        related_type: relatedType || null,
        related_id: relatedId || null,
        created_by: creatorId || null,
      });
    } catch { /* best-effort */ }

    // Email notification (best-effort, non-blocking)
    try {
      const { data: prof } = await supabase.from('profiles').select('id').eq('id', userId).maybeSingle();
      if (prof) {
        const { data: authUser } = await supabase.auth.admin?.getUserById?.(userId).catch?.(() => ({ data: null })) || { data: null };
        const toEmail = authUser?.user?.email;
        if (toEmail) {
          const html = `<p>Hoi ${name},</p>
<p><strong>${creatorName || 'Een collega'}</strong> heeft je getagd${contextName ? ` bij <em>${contextName}</em>` : ''} in een notitie:</p>
<blockquote style="border-left:3px solid #1DDB62;margin:12px 0;padding:8px 14px;color:#444;">${plain}</blockquote>
${link ? `<p><a href="${link}" style="color:#1DDB62;font-weight:600;">Bekijk notitie</a></p>` : ''}`;
          await sendEmail({ to: toEmail, subject: `${creatorName || 'Collega'} heeft je getagd in een notitie`, html }).catch(() => {});
        }
      }
    } catch { /* email is non-blocking */ }
  }
}

// Create an assignment notification + optional email
export async function createAssignmentNotification({ assignedToUserId, assignedToName, type, title, body, link, relatedType, relatedId, creatorId, creatorName }) {
  if (!assignedToUserId || assignedToUserId === creatorId) return;

  const companyId = await getCompanyId();
  if (!companyId) return;

  try {
    await supabase.from('notifications').insert({
      company_id: companyId,
      user_id: assignedToUserId,
      type,
      title,
      body: body || null,
      link: link || null,
      related_type: relatedType || null,
      related_id: relatedId || null,
      created_by: creatorId || null,
    });
  } catch { /* best-effort */ }

  // Email notification (best-effort)
  try {
    const { data: authUser } = await supabase.auth.admin?.getUserById?.(assignedToUserId).catch?.(() => ({ data: null })) || { data: null };
    const toEmail = authUser?.user?.email;
    if (toEmail) {
      const html = `<p>Hoi ${assignedToName || 'collega'},</p>
<p><strong>${creatorName || 'Een collega'}</strong> heeft je toegewezen aan: <strong>${title.replace('Je bent toegewezen aan ', '')}</strong></p>
${body ? `<p style="color:#555;">${body}</p>` : ''}
${link ? `<p><a href="${link}" style="color:#1DDB62;font-weight:600;">Bekijk details</a></p>` : ''}`;
      await sendEmail({ to: toEmail, subject: `Nieuwe toewijzing: ${title.replace('Je bent toegewezen aan ', '')}`, html }).catch(() => {});
    }
  } catch { /* email is non-blocking */ }
}

// ── TEAM MEMBERS HELPER ──────────────────────────────────────────────────────

export async function getTeamMembers() {
  const companyId = await getCompanyId();
  console.log('[getTeamMembers] companyId:', companyId);
  if (!companyId) return [];
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name')
    .eq('company_id', companyId)
    .order('full_name', { ascending: true });
  console.log('[getTeamMembers] rows:', data?.length ?? 0, 'error:', error?.message ?? null);
  return (data || []).map(r => ({ id: r.id, fullName: r.full_name || '' })).filter(m => m.fullName);
}
