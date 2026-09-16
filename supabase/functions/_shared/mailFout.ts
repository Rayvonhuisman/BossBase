// Eén plek om vast te leggen dat een mail NIET is aangekomen.
//
// We loggen bewust alleen mislukkingen. Elke verstuurde mail vastleggen zou een
// tweede archief naast sent_emails opleveren; wat ontbrak was het antwoord op
// "is er post blijven liggen?". Een rij hier betekent dus: hier is iets misgegaan.
//
// Deze functie gooit NOOIT. Een mislukte mail is al vervelend genoeg; dat het
// loggen daarvan ook nog een verzoek zou laten klappen is onacceptabel. Lukt het
// schrijven niet, dan blijft er een console.error over.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export type MailFout = {
  /** Wat voor mail het was: 'offerte', 'factuur', 'herinnering_1', 'trial_7',
   *  'ondertekenbevestiging_klant', 'toewijzing', 'ondertekende_pdf', enz. */
  soort: string
  /** Aan wie hij gericht was. Mag leeg zijn als er geen adres bekend was. */
  ontvanger?: string | null
  companyId?: string | null
  /** Momentopname: een bedrijf kan later vertrekken, de fout blijft leesbaar. */
  bedrijfNaam?: string | null
  /** De foutmelding zoals de provider of de code hem gaf. */
  fout: string
  /** Waar de mail vandaan kwam: 'send-email', 'stuurBossBaseMail', 'trial-mails', … */
  bron: string
  gerelateerdType?: string | null
  gerelateerdId?: string | null
}

export async function logMailFout(f: MailFout): Promise<void> {
  try {
    const url = Deno.env.get('SUPABASE_URL')
    const key = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
    if (!url || !key) { console.error('mailfout niet gelogd: geen service-role'); return }

    const admin = createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } })
    const { error } = await admin.from('mail_fouten').insert({
      soort: f.soort || 'onbekend',
      ontvanger: f.ontvanger ?? null,
      company_id: f.companyId ?? null,
      bedrijf_naam: f.bedrijfNaam ?? null,
      // Afkappen: een provider kan een lap tekst teruggeven en dit is een
      // signaallijst, geen logbestand.
      fout: String(f.fout ?? 'onbekende fout').slice(0, 2000),
      bron: f.bron || 'onbekend',
      gerelateerd_type: f.gerelateerdType ?? null,
      gerelateerd_id: f.gerelateerdId ?? null,
    })
    if (error) console.error('mailfout niet gelogd:', error.message)
  } catch (e) {
    console.error('mailfout niet gelogd:', (e as Error).message)
  }
}
