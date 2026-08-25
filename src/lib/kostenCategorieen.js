// ─────────────────────────────────────────────────────────────────────────────
// Enige bron voor de kostencategorieën.
//
// Er waren drie losse keuzelijsten (kostenmodal, kostendetail, projectdrawer)
// die uit elkaar liepen. Sinds de categorie het inkoopgrootboek in SnelStart
// bepaalt is dat niet vrijblijvend meer: een categorie die in één lijst wel en
// in een andere niet voorkomt, boekt straks ergens anders.
//
// "Arbeid" is bewust GEEN keuze meer: uren horen in de urenregistratie, niet in
// de kosten. De waarde blijft geldig — bestaande rijen behouden hun categorie en
// blijven leesbaar via categorieOptiesMet().
// ─────────────────────────────────────────────────────────────────────────────

export const KOSTEN_CATEGORIEEN = [
  { value: 'Materiaal',       label: 'Materiaal' },
  { value: 'Reiskosten',      label: 'Reiskosten' },
  { value: 'Gereedschap',     label: 'Gereedschap' },
  { value: 'Inkoopfactuur',   label: 'Inkoopfactuur' },
  { value: 'Algemene kosten', label: 'Algemene kosten' },
  { value: 'Overig',          label: 'Overig' },
];

export const STANDAARD_CATEGORIE = 'Materiaal';

// Categorieën die niet (meer) gekozen kunnen worden maar wel in de data staan.
// Puur voor weergave, zodat een bestaande rij zijn eigen waarde houdt in plaats
// van stil om te klappen naar de eerste optie in de lijst.
const VERVALLEN = ['Arbeid', 'Brandstof'];

export const isGeldigeCategorie = cat =>
  KOSTEN_CATEGORIEEN.some(c => c.value === cat) || VERVALLEN.includes(cat);

// Categorieën waarbij géén inkoopfactuur bestaat om te bewaren. Reiskosten is
// meestal een kilometervergoeding: daar is geen bon van, en er een verzinnen is
// erger dan hem missen. Bij alle andere categorieën koop je iets van een
// leverancier en hoort de factuur bij de boeking — zonder bon kun je de btw niet
// terugvorderen en heb je bij een controle niets te laten zien.
const ZONDER_BON = ['Reiskosten', 'Arbeid'];

export const bonVerplicht = categorie => !ZONDER_BON.includes(categorie);

export const BON_VERPLICHT_MELDING =
  'Voeg de factuur of bon toe. Zonder bewijsstuk kun je de btw niet terugvorderen '
  + 'en staat de kostenpost straks zonder document in je boekhouding.';

// Keuzelijst die de huidige waarde altijd bevat, ook als die vervallen is.
export function categorieOptiesMet(huidige) {
  const opts = [...KOSTEN_CATEGORIEEN];
  if (huidige && !opts.some(o => o.value === huidige)) {
    opts.push({ value: huidige, label: huidige });
  }
  return opts;
}
