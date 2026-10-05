import { mbFetch, type MbKoppeling } from "./moneybird.ts"

// Webhooks van Moneybird aanmelden en afmelden.
//
// Moneybird eist dat de URL bij het aanmelden met 200 antwoordt; dat kan pas
// zodra de edge function moneybird-webhook bestaat (stap 6 van de herbouw).
// Tot die tijd meldt zorgVoorWebhook niets aan en werkt de koppeling via de
// handmatige en nachtelijke synchronisatie.

export async function zorgVoorWebhook(_k: MbKoppeling): Promise<{ actief: boolean; fout?: string }> {
  return { actief: false }
}

/** Meldt een webhook af (best-effort: een verdwenen webhook is geen fout). */
export async function verwijderWebhook(k: MbKoppeling, webhookId: string): Promise<void> {
  try {
    await mbFetch(k, `/webhooks/${webhookId}`, { method: 'DELETE' })
  } catch (e: any) {
    console.warn('Webhook afmelden mislukt:', e?.message)
  }
}
