// Bedragen op de dashboardtegels: kort in beeld, volledig bij hover.
//
// Eén plek voor beide vormen, zodat de tegels niet uit elkaar lopen. De gewone
// pagina's (facturen, kosten, project, klantkaart) gebruiken dit NIET — daar
// hoort het hele bedrag gewoon te staan.

const nl = (n, max = 0) => Number(n || 0).toLocaleString('nl-NL', { minimumFractionDigits: 0, maximumFractionDigits: max });

// Vanaf vijf cijfers afkorten: tot en met € 9.999 blijft het bedrag staan.
export const AFKORT_VANAF = 10000;

/**
 * Kort bedrag voor in een tegel: €9.999, €12,3k, €1,2 mln.
 * Een nul achter de komma valt weg (€10k, niet €10,0k).
 */
export function kortBedrag(waarde) {
  const n = Number(waarde) || 0;
  const abs = Math.abs(n);
  if (abs < AFKORT_VANAF) return `€${nl(Math.round(n))}`;
  // 999.950 zou als "1.000k" in beeld komen; dat leest als een miljoen, dus
  // gaat hij over de streep naar mln.
  if (abs >= 1e6 || Math.round(abs / 100) / 10 >= 1000) return `€${nl(n / 1e6, 1)} mln`;
  return `€${nl(n / 1000, 1)}k`;
}

/** Het hele bedrag met centen, voor de tooltip: €12.345,67. */
export function voluitBedrag(waarde) {
  return `€${Number(waarde || 0).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}
