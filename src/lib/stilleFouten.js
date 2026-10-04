// Bijwerk-acties die het hoofdwerk niet mogen tegenhouden (meldingen naar
// collega's, de agenda bijwerken na het inplannen) verdwenen vroeger in een lege
// `.catch(() => {})`. Dan zag niemand dat de agenda niet meer klopte met de
// werkbon. Audit 2026-10-01, M23 / C-4.
//
// Twee soorten:
//   logFout(wat)               — echt best-effort (een melding aan een collega):
//                                vastleggen in de console, de gebruiker niet storen.
//   meldFout(toast, tekst)     — raakt gegevens die de gebruiker ziet (agenda,
//                                koppelingen): ook een Nederlandse melding.

export function logFout(wat) {
  return fout => { console.warn(`[bb] ${wat} mislukt:`, fout?.message || fout); };
}

export function meldFout(toast, tekst) {
  return fout => {
    console.warn('[bb]', tekst, fout?.message || fout);
    toast?.error?.(tekst);
  };
}

export const AGENDA_NIET_BIJGEWERKT =
  'Opgeslagen, maar de agenda kon niet worden bijgewerkt. Open de werkbon opnieuw of plan hem nog een keer in om de agenda gelijk te trekken.';
