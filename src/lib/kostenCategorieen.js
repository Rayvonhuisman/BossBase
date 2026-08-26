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

// ─────────────────────────────────────────────────────────────────────────────
// Sinds kostencategorieën per bedrijf instelbaar zijn komt de lijst uit de
// database (zie useKostenCategorieen). De constanten hierboven blijven staan als
// terugval en als bron voor de standaardrijen die bij een nieuw bedrijf worden
// aangemaakt.
//
// De functies hieronder werken op die geladen lijst. Ze verwachten rijen in de
// vorm { naam, standaard, actief, bonVerplicht }.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Keuzelijst uit de geladen categorieën, met de huidige waarde er altijd bij.
 *
 * Dat laatste is essentieel: een kostenpost kan een categorie dragen die
 * inmiddels op inactief staat of nooit in de lijst zat. Zonder deze toevoeging
 * klapt zo'n rij bij openen-en-opslaan stilzwijgend om naar de eerste optie, en
 * verandert daarmee zijn grootboekrekening.
 */
export function categorieOptiesUit(lijst = [], huidige) {
  const opts = (lijst || [])
    .filter(c => c.actief !== false)
    .map(c => ({ value: c.naam, label: c.naam }));
  if (huidige && !opts.some(o => o.value === huidige)) {
    opts.push({ value: huidige, label: huidige });
  }
  return opts;
}

/** Is er een bon verplicht bij deze categorie? Onbekend = ja, dat is de veilige kant. */
export function bonVerplichtUit(lijst = [], naam) {
  const c = (lijst || []).find(x => x.naam === naam);
  if (c) return c.bonVerplicht !== false;
  return bonVerplicht(naam);
}

/** Eerste beschikbare categorie, voor een leeg formulier. */
export function standaardCategorieUit(lijst = []) {
  const actief = (lijst || []).filter(c => c.actief !== false);
  return actief.find(c => c.naam === STANDAARD_CATEGORIE)?.naam
    ?? actief[0]?.naam
    ?? STANDAARD_CATEGORIE;
}
