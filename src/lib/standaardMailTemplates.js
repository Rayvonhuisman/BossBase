// Standaardteksten van de mails die de app zelf automatisch verstuurt
// (triggerAutoEmail). Dit is de terugval voor een bedrijf zonder templaterij:
// een ontbrekend template mag nooit betekenen dat de mail niet uitgaat.
//
// Heeft een bedrijf wél een rij, dan geldt die, ook als de ondernemer hem uit
// heeft gezet (actief/auto_versturen) — dat is een keuze, geen ontbrekend
// template.
//
// Gelijk houden met public.seed_default_email_templates (laatste versie in
// supabase/migrations/20260919100000_mailtemplates_altijd_aanwezig.sql). De
// afspraakherinnering gaat vanuit de cron; die heeft zijn eigen kopie in
// supabase/functions/_shared/standaardMailTemplates.ts.

export const STANDAARD_MAIL_TEMPLATES = {
  aanvraag_ontvangen: {
    onderwerp: 'Bedankt voor uw aanvraag, {{klant_naam}}',
    body: 'Beste {{klant_naam}},\n\nBedankt voor uw aanvraag! Wij hebben uw bericht ontvangen en nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
    body_html: '',
  },
  afspraak_bevestiging: {
    onderwerp: 'Bevestiging afspraak op {{afspraak_datum}}',
    body: 'Beste {{klant_naam}},\n\nHierbij bevestigen wij uw afspraak.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nMocht u de afspraak willen verzetten, neem dan tijdig contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
    body_html: '',
  },
}

// Welk template geldt voor dit bedrijf? `rij` is wat er in email_templates staat
// (of undefined). Geen rij → de standaard. Wel een rij maar uitgezet → null.
export function kiesTemplate(type, rij) {
  if (!rij) return STANDAARD_MAIL_TEMPLATES[type] ?? null
  return rij.actief && rij.auto_versturen ? rij : null
}
