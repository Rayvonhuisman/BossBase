import { supabase } from '../lib/supabase.js';
import { getCompanyId } from '../lib/currentCompany.js';
import { mailTemplate } from '../utils/mailTemplate.js';

// HTML-escape voor door gebruikers ingevoerde waarden die in de rauwe `body`-HTML
// van collega-mails terechtkomen (naam, notitietekst, deal-/werkbon-titel). De
// mailTemplate escapet zelf al title/preheader/knop; `body` is rauwe HTML en
// moet dus hier ge-escaped worden.
const esc = (s) => String(s ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

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

  let fout = null;
  try {
    // LET OP: invoke gooit NIET bij een 4xx/5xx. Een stukgelopen edge function
    // komt terug in `error`; wie alleen een try/catch zet, mist precies dat
    // geval en denkt dat de melding is aangekomen.
    const { error } = await supabase.functions.invoke('create-notification', { body: { notifications: list } });
    if (error) fout = error.message || String(error);
  } catch (e) {
    fout = e?.message || String(e);
  }
  if (!fout) return;

  console.warn('[notificatie] create-notification mislukt:', fout);
  // Een melding die niet aankomt is post die blijft liggen; die hoort in
  // mail_fouten, niet alleen in een console die niemand openheeft staan. De
  // RPC loopt over PostgREST — juist als de edge functions het laten afweten.
  try {
    await supabase.rpc('meld_mail_fout', {
      p_soort: `notificatie_${list[0]?.type || 'onbekend'}`,
      p_fout: `create-notification mislukt voor ${list.length} melding(en): ${fout}`,
      p_bron: 'pushNotifications',
      p_gerelateerd_type: list[0]?.related_type || null,
      p_gerelateerd_id: list[0]?.related_id || null,
    });
  } catch (e) {
    // Laatste redmiddel: lukt ook dit niet, dan is er niets meer over om het in
    // te schrijven. Wel luid in de console, niet stil zoals voorheen.
    console.error('[notificatie] fout kon niet worden vastgelegd:', e?.message);
  }
}

// (createNotification stond hier: nergens aangeroepen sinds hij is toegevoegd.
// Alle schermen gebruiken createMentionNotifications of notifyNewAssignees.)

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
  // De app luistert uitsluitend op /dashboard/<pagina>. Een pad zonder dat
  // voorvoegsel valt in App.jsx door naar de marketingsite
  // (`if (!route.startsWith('/dashboard')) navigate('/')`), dus knoppen in
  // collega-mails kwamen op de landingspagina uit in plaats van bij het item.
  //
  // `link` is 'werkbonnen' of 'werkbonnen/<id>'. Het id wordt ?open=<id>, dat
  // App.jsx omzet in een navigatie-intentie waarmee de pagina zijn eigen
  // detailvenster opent (preOpenWerkbonId en verwanten).
  const schoon = link.replace(/^\//, '')
  const [pagina, id] = schoon.split('/')
  const basis = `https://www.bossbase.nl/dashboard/${pagina}`
  return id ? `${basis}?open=${encodeURIComponent(id)}` : basis
}

// Welke pagina's kunnen één item openen? Alleen deze hebben in App.jsx een
// preOpen…Id dat op de navigatie-intentie luistert. Voor de rest — customers,
// leveranciers, materialen, planning — heeft een id in de link geen zin: de
// pagina doet er niets mee, en dan beloven we iets wat niet gebeurt.
const DETAILPAGINA = {
  werkbon:    'werkbonnen',
  activiteit: 'activities',
  project:    'projecten',
  offerte:    'offertes',
  factuur:    'facturen',
}

// Bouwt 'werkbonnen/<id>' uit het SOORT item, niet uit `link`. Een toewijzing
// die vanuit de planning wordt gemaakt heeft link 'planning', maar gaat over een
// werkbon; zonder deze vertaling kwam je op de planning uit in plaats van bij de
// werkbon zelf. Kan de doelpagina geen item openen, dan blijft de link staan.
function diepeLinkVoor(link, relatedType, relatedId) {
  if (!relatedId) return link
  const pagina = DETAILPAGINA[relatedType]
  if (!pagina) return link
  return `${pagina}/${relatedId}`
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

  // Met een id opent de knop (en de melding in de belbalk) het item zelf, zodat
  // je meteen bij de notitie uitkomt in plaats van op een lijstpagina.
  const diepeLink = diepeLinkVoor(link, relatedType, relatedId);

  const notifRows = [];
  for (const { name, userId } of mentions) {
    // Bewust GEEN self-skip: wie zichzelf tagt krijgt óók een melding + mail.
    // De e-mail-HTML wordt hier gebouwd, maar het e-mailADRES wordt NIET hier
    // opgehaald: dat gebeurt server-side in de create-notification edge function
    // (auth.users → company_members), zodat adressen nooit naar de client lekken.
    const html = mailTemplate({
      title: `${creatorName || 'Collega'} heeft je getagd`,
      preheader: contextName ? `Getagd bij ${contextName}` : 'Je bent getagd in een notitie',
      body: `<p>Hoi ${esc(name)},</p>
             <p><strong>${esc(creatorName || 'Een collega')}</strong> heeft je getagd${contextName ? ` bij <strong>${esc(contextName)}</strong>` : ''} in een notitie:</p>
             <blockquote style="margin:12px 0;padding:12px 16px;background:#f9fafb;border-left:3px solid #1DDB62;border-radius:4px;color:#374151;">
               ${esc(plain)}
             </blockquote>`,
      // Antwoorden per mail kan niet: de reply-to is de bedrijfsmailbox, omdat
      // het adres van de collega die tagde nergens in de app te zien is. De knop
      // brengt je daarom naar de notitie zelf, waar je wél kunt reageren.
      buttonText: link ? 'Reageer in BossBase' : undefined,
      buttonUrl: toAbsoluteUrl(diepeLink),
    });
    notifRows.push({
      user_id: userId,
      type: 'mention',
      title: `${creatorName || 'Iemand'} heeft je getagd${contextName ? ` bij ${contextName}` : ''}`,
      body: plain || null,
      link: diepeLink || null,
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

  // Een toewijzing gaat altijd over één item; met het id erbij opent de knop dat
  // item meteen, in plaats van de lijstpagina waar je het nog moest opzoeken.
  const diepeLink = diepeLinkVoor(link, relatedType, relatedId);

  const notif = {
    user_id: assignedToUserId,
    type,
    title,
    body: body || null,
    link: diepeLink || null,
    related_type: relatedType || null,
    related_id: relatedId || null,
  };

  if (sendMail) {
    const itemName = title.replace('Je bent toegewezen aan ', '');
    const html = mailTemplate({
      title: 'Nieuwe toewijzing',
      preheader: `Je bent toegewezen aan ${itemName}`,
      body: `<p>Hoi ${esc(assignedToName || 'collega')},</p>
             <p><strong>${esc(creatorName || 'Een collega')}</strong> heeft je toegewezen aan: <strong>${esc(itemName)}</strong></p>
             ${body ? `<p style="color:#555;">${esc(body)}</p>` : ''}`,
      buttonText: link ? 'Bekijk details' : undefined,
      buttonUrl: toAbsoluteUrl(diepeLink),
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

// ── VERANTWOORDELIJK GEMAAKT ─────────────────────────────────────────────────
// Apart van "gekoppeld": de verantwoordelijke draagt de werkbon. Wie al gekoppeld
// was en daarna verantwoordelijk wordt, viel door de diff van notifyNewAssignees
// en kreeg dus niets — precies de persoon die het moet weten.
export async function notifyNieuweVerantwoordelijken({
  userIds = [], prevUserIds = [], members = [], sendMail = true,
  titel, link = 'werkbonnen', relatedType = 'werkbon', relatedId, creatorId, creatorName,
}) {
  const prev = new Set((prevUserIds || []).filter(Boolean));
  const fresh = [...new Set((userIds || []).filter(Boolean))].filter(id => !prev.has(id) && id !== creatorId);
  if (!fresh.length) return;

  // Ook hier het id mee: verantwoordelijk worden gaat over één werkbon, dus de
  // knop hoort die werkbon te openen en niet de lijst.
  const diepeLink = diepeLinkVoor(link, relatedType, relatedId);

  const rows = fresh.map(uid => {
    const naam = (members || []).find(m => m.id === uid)?.fullName;
    const rij = {
      user_id: uid,
      type: 'verantwoordelijke_werkbon',
      title: `Je bent verantwoordelijk voor ${titel}`,
      body: 'Jij bent het aanspreekpunt voor deze werkbon.',
      link: diepeLink,
      related_type: relatedType,
      related_id: relatedId || null,
    };
    if (sendMail) {
      rij.email = {
        subject: `Je bent verantwoordelijk voor ${titel}`,
        html: mailTemplate({
          title: 'Je bent verantwoordelijk gemaakt',
          preheader: `${titel}: jij bent het aanspreekpunt`,
          body: `<p>Hoi ${esc(naam || 'collega')},</p>
                 <p><strong>${esc(creatorName || 'Een collega')}</strong> heeft jou verantwoordelijk gemaakt voor <strong>${esc(titel)}</strong>.</p>
                 <p>Dat betekent dat jij deze werkbon mag bewerken en er het aanspreekpunt voor bent.</p>`,
          buttonText: 'Bekijk de werkbon',
          buttonUrl: toAbsoluteUrl(diepeLink),
        }),
      };
    }
    return rij;
  });

  await pushNotifications(rows);
}

// ── PLANNING GEWIJZIGD ───────────────────────────────────────────────────────
// De melding in de app gaat meteen; de MAIL gaat bewust niet direct de deur uit.
// Tijdens het puzzelen schuift een planner een blok soms drie keer heen en weer,
// en dan wil je geen drie mails. De wijziging wordt hier verzameld; een cron
// stuurt 's avonds één samenvatting per medewerker (planning-samenvatting).
export async function meldPlanningWijziging({
  userIds = [], soort, werkbon = {}, oud = {}, nieuw = {}, creatorId,
}) {
  const ontvangers = [...new Set((userIds || []).filter(Boolean))].filter(id => id !== creatorId);
  if (!ontvangers.length) return;

  const companyId = await getCompanyId();
  if (!companyId) return;

  const omschrijf = (d, s) => (d ? `${d}${s ? ` om ${String(s).slice(0, 5)}` : ''}` : 'niet ingepland');
  const titelTekst = soort === 'afgehaald'
    ? `Je staat niet meer op ${werkbon.titel || 'een klus'}`
    : soort === 'ingepland'
      ? `Ingepland: ${werkbon.titel || 'een klus'}`
      : `Planning gewijzigd: ${werkbon.titel || 'een klus'}`;
  const bodyTekst = soort === 'afgehaald'
    ? `Was: ${omschrijf(oud.datum, oud.start)}`
    : `Was ${omschrijf(oud.datum, oud.start)}, wordt ${omschrijf(nieuw.datum, nieuw.start)}`;

  await pushNotifications(ontvangers.map(uid => ({
    user_id: uid,
    type: 'planning_wijziging',
    title: titelTekst,
    body: bodyTekst,
    link: 'planning',
    related_type: 'werkbon',
    related_id: werkbon.id || null,
    // Geen `email`: die gaat gebundeld mee in de dagelijkse samenvatting.
  })));

  const { error } = await supabase.from('planning_wijzigingen').insert(ontvangers.map(uid => ({
    company_id: companyId,
    user_id: uid,
    werkbon_id: werkbon.id || null,
    werkbon_nummer: werkbon.nummer || null,
    titel: werkbon.titel || null,
    klant: werkbon.customerName || null,
    soort,
    oude_datum: oud.datum || null,
    oude_start: oud.start || null,
    oude_eind: oud.eind || null,
    nieuwe_datum: nieuw.datum || null,
    nieuwe_start: nieuw.start || null,
    nieuwe_eind: nieuw.eind || null,
  })));
  if (error) console.warn('[planning] wijziging niet vastgelegd voor de samenvatting:', error.message);
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
    .select('id, full_name, avatar_url')
    .eq('company_id', companyId)
    .eq('actief', true)
    .order('full_name', { ascending: true });

  if (!includeSelf && currentUserId) query = query.neq('id', currentUserId);

  const { data, error } = await query;
  if (import.meta.env.DEV) console.log('[getActiveTeamMembers] rows:', data?.length ?? 0, 'error:', error?.message ?? null);
  // `profileId` staat er als alias naast `id` omdat de urenschermen, de
  // urenherinnering en de uitvoerdersnamen op de werkbon-PDF op die naam
  // filteren. Zonder dit veld filterden ze de hele lijst weg en kon een admin
  // geen uren meer boeken op naam van een collega — zonder foutmelding, want een
  // lege dropdown ziet eruit als "er zijn geen collega's".
  return (data || [])
    // avatarUrl: dezelfde foto als linksonder in de zijbalk (leeg = initialen).
    .map(r => ({ id: r.id, profileId: r.id, fullName: r.full_name || '', avatarUrl: r.avatar_url || '' }))
    .filter(m => m.fullName);
}

// Backwards-compatibele naam — levert ALLE actieve teamleden, inclusief jezelf,
// zodat je in "Toegewezen aan"-dropdowns (activiteit, werkbon, agenda) ook
// jezelf kunt kiezen. @-tagging toont zo ook jezelf (zelf-notificatie wordt
// elders al uitgefilterd).
export async function getTeamMembers() {
  return getActiveTeamMembers({ includeSelf: true });
}
