// Aanvragen die via een websiteformulier binnenkomen (tabel inquiries).
//
// Binnenkomen gebeurt uitsluitend via de Edge Function public-website-inquiry:
// die schrijft met de service-role en haalt het company_id uit het formulier.
// Vanuit het dashboard mag je lezen, de status wijzigen en koppelen aan een
// klant of deal — RLS en de kolomrechten laten ook niets anders toe (migratie
// 20260915150000). Zichtbaar met het recht 'verkoop', net als de pipeline.
import { supabase } from '../lib/supabase.js';
import { createCustomer, listCustomers } from './customerService.js';
import { createDeal } from './dealService.js';
import { AANVRAAG_STATUSSEN } from '../../supabase/functions/_shared/websiteAanvraag.ts';

const STATUS_INFO = {
  nieuw:          { label: 'Nieuw',          badge: 'b-new' },
  in_behandeling: { label: 'In behandeling', badge: 'b-blue' },
  gekwalificeerd: { label: 'Gekwalificeerd', badge: 'b-green' },
  afgewezen:      { label: 'Afgewezen',      badge: 'b-lost' },
  spam:           { label: 'Spam',           badge: 'b-orange' },
};

export const STATUSSEN = AANVRAAG_STATUSSEN.map(key => ({ key, ...STATUS_INFO[key] }));
export const statusInfo = key => STATUS_INFO[key] || { label: key, badge: 'b-gray' };

const BRON_LABELS = {
  bossbase_website: 'Website bossbase.nl',
  website: 'Website',
};
export const bronLabel = bron => BRON_LABELS[bron] || bron || 'Onbekend';

const toAanvraag = row => ({
  id: row.id,
  naam: row.name,
  bedrijf: row.company_name || '',
  email: row.email,
  telefoon: row.phone || '',
  onderwerp: row.subject || '',
  bericht: row.message,
  bron: row.source,
  bronUrl: row.source_url || '',
  status: row.status,
  isTest: Boolean(row.is_test),
  metadata: row.metadata || {},
  customerId: row.customer_id || null,
  dealId: row.deal_id || null,
  ontvangen: row.created_at,
});

export async function listAanvragen() {
  const { data, error } = await supabase
    .from('inquiries')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(500);
  if (error) throw error;
  return (data || []).map(toAanvraag);
}

// Voor de badge in de zijbalk: echte aanvragen die nog niemand heeft opgepakt.
export async function telNieuweAanvragen() {
  const { count, error } = await supabase
    .from('inquiries')
    .select('id', { count: 'exact', head: true })
    .eq('status', 'nieuw')
    .eq('is_test', false);
  if (error) return 0;
  return count || 0;
}

async function werkBij(id, velden) {
  const { data, error } = await supabase
    .from('inquiries')
    .update(velden)
    .eq('id', id)
    .select('*')
    .maybeSingle();
  if (error) throw error;
  // Geen rij terug = RLS hield de wijziging tegen (ander bedrijf of geen recht).
  if (!data) throw new Error('Deze aanvraag kon niet worden bijgewerkt. Mogelijk heb je er geen rechten op.');
  return toAanvraag(data);
}

export async function zetAanvraagStatus(id, status) {
  if (!AANVRAAG_STATUSSEN.includes(status)) throw new Error('Onbekende status');
  return werkBij(id, { status });
}

// Telefoonnummers staan in allerlei notaties (06-…, +31 6 …, 0031…). Vergelijk
// daarom op de laatste negen cijfers.
const telKern = v => {
  const cijfers = String(v || '').replace(/\D/g, '');
  return cijfers.length >= 9 ? cijfers.slice(-9) : '';
};

/**
 * Klanten van het eigen bedrijf met hetzelfde e-mailadres of telefoonnummer.
 * Vers opgehaald (niet uit de gedeelde cache), zodat een klant die net door een
 * collega is aangemaakt ook meetelt.
 */
export async function zoekBestaandeKlanten(aanvraag) {
  const mail = (aanvraag.email || '').trim().toLowerCase();
  const tel = telKern(aanvraag.telefoon);
  const klanten = await listCustomers();
  return klanten
    .map(k => {
      const opMail = Boolean(mail) && (k.email || '').trim().toLowerCase() === mail;
      const opTel = Boolean(tel) && telKern(k.phone) === tel;
      if (!opMail && !opTel) return null;
      return { id: k.id, naam: k.name, email: k.email, telefoon: k.phone, opMail, opTel };
    })
    .filter(Boolean);
}

/**
 * Zet een aanvraag om naar een klant, en desgewenst een lead (deal) in de
 * pipeline. Volgorde:
 *   1. klant aanmaken of een bestaande kiezen
 *   2. eventueel de deal aanmaken
 *   3. pas daarna de aanvraag koppelen en op 'gekwalificeerd' zetten
 * Mislukt de deal, dan wordt de klant wel gekoppeld maar blijft de status
 * staan — de aanvraag is dan nog niet af.
 */
export async function zetOmNaarKlant(aanvraag, { bestaandeKlant = null, maakLead = false, stageId = null } = {}) {
  let klant;
  if (bestaandeKlant) {
    klant = { id: bestaandeKlant.id, naam: bestaandeKlant.naam, nieuw: false };
  } else {
    const datum = new Date(aanvraag.ontvangen).toLocaleDateString('nl-NL');
    const nieuw = await createCustomer({
      name: aanvraag.bedrijf || aanvraag.naam,
      email: aanvraag.email,
      phone: aanvraag.telefoon || null,
      notes: `Aangemaakt uit een websiteaanvraag van ${datum}.`
        + (aanvraag.bedrijf ? ` Contactpersoon: ${aanvraag.naam}.` : ''),
    });
    klant = { id: nieuw.id, naam: nieuw.name, nieuw: true };
  }

  let deal = null;
  let dealFout = '';
  if (maakLead) {
    const wie = aanvraag.bedrijf || aanvraag.naam;
    try {
      deal = await createDeal({
        title: aanvraag.onderwerp ? `${aanvraag.onderwerp} — ${wie}` : `Websiteaanvraag ${wie}`,
        customer_id: klant.id,
        stage_id: stageId,
        description: aanvraag.bericht,
      });
    } catch (e) {
      dealFout = e?.message || 'Lead aanmaken is mislukt.';
    }
  }

  const velden = { customer_id: klant.id };
  if (deal) velden.deal_id = deal.id;
  if (!maakLead || deal) velden.status = 'gekwalificeerd';

  let bijgewerkt;
  try {
    bijgewerkt = await werkBij(aanvraag.id, velden);
  } catch (e) {
    const wat = klant.nieuw ? `Klant "${klant.naam}" is aangemaakt` : `Klant "${klant.naam}" is gekozen`;
    throw new Error(`${wat}, maar de aanvraag kon niet worden gekoppeld: ${e.message}`);
  }

  return { aanvraag: bijgewerkt, klant, deal, dealFout };
}
