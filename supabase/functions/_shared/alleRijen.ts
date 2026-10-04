// Alle rijen van een query, in pagina's van 1000.
//
// PostgREST geeft per verzoek hooguit 1000 rijen terug — ook aan de service-rol.
// De importfuncties bouwden hun "al geïmporteerd"-lijst met één query; boven
// 1000 posten zag de import de rest als nieuw en importeerde hij die bij elke
// sync opnieuw (audit 2026-10-01, H16). Zelfde aanpak als src/lib/alleRijen.js.
//
// `maak` moet elke keer een NIEUWE query teruggeven (een builder is na await
// verbruikt). Gesorteerd op id, zodat pagina's niet overlappen of iets missen.
// Een fout gooit: met een halve lijst verder gaan zou juist dubbelen opleveren.
export async function alleRijen<T = any>(maak: () => any, stap = 1000): Promise<T[]> {
  const uit: T[] = []
  for (let van = 0; ; van += stap) {
    const { data, error } = await maak().order('id', { ascending: true }).range(van, van + stap - 1)
    if (error) throw new Error(`ophalen mislukt: ${error.message}`)
    uit.push(...((data ?? []) as T[]))
    if (!data || data.length < stap) return uit
  }
}
