// Standaardteksten van de mails die de cron (check-herinneringen) automatisch
// verstuurt. Dit is de terugval voor een bedrijf zonder templaterij: een
// ontbrekend template mag nooit betekenen dat de mail niet uitgaat.
//
// Heeft een bedrijf wél een rij, dan geldt die, ook als de ondernemer hem uit
// heeft gezet (actief/auto_versturen) — dat is een keuze, geen ontbrekend
// template.
//
// Gelijk houden met public.seed_default_email_templates (laatste versie in
// supabase/migrations/20260919100000_mailtemplates_altijd_aanwezig.sql).

export type StandaardTemplate = {
  onderwerp: string
  body: string
  body_html: string
  auto_dagen: number
}

export const STANDAARD_MAIL_TEMPLATES: Record<string, StandaardTemplate> = {
  herinnering_1: {
    onderwerp: 'Vriendelijke herinnering: factuur {{factuur_nummer}}',
    body: 'Beste {{klant_naam}},\n\nWij willen u vriendelijk herinneren dat factuur {{factuur_nummer}} nog openstaat.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nMocht u dit bedrag reeds hebben overgemaakt, dan kunt u deze herinnering als niet verzonden beschouwen.\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
    body_html: '',
    auto_dagen: 7,
  },
  herinnering_2: {
    onderwerp: 'Tweede herinnering: factuur {{factuur_nummer}} nog openstaand',
    body: 'Beste {{klant_naam}},\n\nDit is een tweede herinnering voor factuur {{factuur_nummer}}, welke reeds is vervallen.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nWij verzoeken u dringend dit bedrag zo spoedig mogelijk te voldoen. Bij uitblijven van betaling zien wij ons genoodzaakt verdere stappen te ondernemen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
    body_html: '',
    auto_dagen: 14,
  },
  afspraak_herinnering: {
    onderwerp: 'Herinnering: uw afspraak op {{afspraak_datum}}',
    body: 'Beste {{klant_naam}},\n\nGraag herinneren wij u aan uw afspraak met {{bedrijfsnaam}}.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nKomt het onverhoopt niet uit? Laat het ons dan zo snel mogelijk weten, dan zoeken we samen een ander moment.\n\nWij zien u graag tegemoet!\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
    body_html: '',
    auto_dagen: 1,
  },
}

// Welk template geldt voor dit bedrijf? `rij` is wat er in email_templates staat
// (of undefined). Geen rij → de standaard. Wel een rij maar uitgezet → null.
export function kiesTemplate<T extends { actief?: boolean; auto_versturen?: boolean }>(
  type: string,
  rij: T | undefined | null,
): T | StandaardTemplate | null {
  if (!rij) return STANDAARD_MAIL_TEMPLATES[type] ?? null
  return rij.actief && rij.auto_versturen ? rij : null
}
