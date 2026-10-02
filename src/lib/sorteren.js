// Lijsten op naam, zoals een mens zoekt: alfabetisch, zonder onderscheid tussen
// hoofd- en kleine letters ("de Vries" naast "De Vries"). Gebruikt in de
// klantkeuze van offertes en facturen; een native <select> springt dan bij het
// typen van de eerste letters naar de juiste klant.
export function opNaam(lijst = []) {
  return [...lijst].sort((a, b) => String(a?.name || '').localeCompare(String(b?.name || ''), 'nl', { sensitivity: 'base' }))
}
