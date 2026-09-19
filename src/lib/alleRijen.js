// Alle rijen van een query ophalen, niet alleen de eerste duizend.
//
// PostgREST geeft per verzoek hooguit een vast aantal rijen terug (standaard
// 1000) en meldt NIET dat er meer waren. Dat gaf stille fouten: een lijst die
// in de UI wordt opgeteld kwam te laag uit, zonder foutmelding en zonder dat er
// iets opviel — tot iemand het bedrag naast de database legde. Op de
// Kosten-pagina scheelde dat €161.326 aan boekingen die buiten beeld vielen.
//
// Deze helper vraagt door tot het aantal binnen is dat de database zelf opgeeft.
//
// Twee eisen aan `maakQuery`:
//  1. Hij moet ELKE aanroep een VERSE query teruggeven. Een Supabase-query is
//     eenmalig: dezelfde builder opnieuw uitvoeren met een andere .range()
//     werkt niet.
//  2. De select moet { count: 'exact' } meegeven en een VASTE sortering hebben,
//     met een unieke laatste sleutel (meestal id). Zonder stabiele volgorde mag
//     Postgres tussen twee verzoeken van volgorde wisselen, en dan mis je rijen
//     of krijg je ze dubbel.
//
// @param {() => object} maakQuery
// @returns {Promise<Array>} alle rijen
export async function alleRijen(maakQuery) {
  const rijen = []
  let totaal = Infinity
  while (rijen.length < totaal) {
    const { data, error, count } = await maakQuery().range(rijen.length, rijen.length + 999)
    if (error) throw error
    if (count != null) totaal = count
    if (!data?.length) break
    rijen.push(...data)
  }
  return rijen
}
