// Validatie van zakelijke nummers, aan onze kant.
//
// SnelStart keurt een ongeldig btw-nummer of IBAN af, en dat laat de HELE
// relatie mislukken — inclusief elke factuur en kostenpost die eraan hangt. De
// sync vangt dat inmiddels op, maar een fout die pas dagen later bij een
// synchronisatie opduikt is lastig terug te leiden naar één tikfout. Beter is
// hem meteen bij het invoeren afvangen.
//
// Alle drie zijn tolerant voor spaties en punten, en accepteren een lege waarde:
// deze velden zijn optioneel.

const schoon = v => String(v || '').replace(/[\s.\-]/g, '').toUpperCase();

// Elfproef: som van cijfer × positiegewicht moet deelbaar zijn door 11.
function elfproef(cijfers, gewichten) {
  let som = 0;
  for (let i = 0; i < gewichten.length; i++) som += Number(cijfers[i]) * gewichten[i];
  return som % 11 === 0;
}

/**
 * Nederlands btw-identificatienummer: NL + 9 cijfers + B + 2 cijfers.
 * De 9 cijfers moeten de elfproef doorstaan. Buitenlandse nummers laten we met
 * rust — die kunnen we niet betrouwbaar controleren.
 */
export function valideerBtwNummer(waarde) {
  const v = schoon(waarde);
  if (!v) return null;
  if (!v.startsWith('NL')) return null; // buitenlands: niet ons oordeel
  if (!/^NL\d{9}B\d{2}$/.test(v)) {
    return 'Een Nederlands btw-nummer ziet eruit als NL123456789B01.';
  }
  const cijfers = v.slice(2, 11);
  if (!elfproef(cijfers, [9, 8, 7, 6, 5, 4, 3, 2, -1])) {
    return 'Dit btw-nummer klopt niet — controleer de cijfers.';
  }
  return null;
}

/** KvK-nummer: 8 cijfers. */
export function valideerKvk(waarde) {
  const v = schoon(waarde);
  if (!v) return null;
  if (!/^\d{8}$/.test(v)) return 'Een KvK-nummer bestaat uit 8 cijfers.';
  return null;
}

/**
 * IBAN volgens de mod-97-controle (ISO 13616): land + controlegetal naar
 * achteren, letters naar cijfers, rest bij deling door 97 moet 1 zijn.
 */
export function valideerIban(waarde) {
  const v = schoon(waarde);
  if (!v) return null;
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(v)) {
    return 'Dit lijkt geen geldige IBAN — controleer het rekeningnummer.';
  }
  if (v.startsWith('NL') && v.length !== 18) {
    return 'Een Nederlandse IBAN bestaat uit 18 tekens.';
  }
  const verplaatst = v.slice(4) + v.slice(0, 4);
  const numeriek = verplaatst.replace(/[A-Z]/g, ch => String(ch.charCodeAt(0) - 55));
  // In blokken rekenen: het getal is te groot voor Number.
  let rest = 0;
  for (const cijfer of numeriek) rest = (rest * 10 + Number(cijfer)) % 97;
  if (rest !== 1) return 'Dit rekeningnummer klopt niet — controleer de IBAN.';
  return null;
}

/**
 * Valideert de zakelijke velden van een relatie in één keer.
 * Geeft { veld: melding } terug; leeg object = alles in orde.
 */
export function valideerRelatieVelden({ btwNumber, kvkNumber, iban } = {}) {
  const fouten = {};
  const btw = valideerBtwNummer(btwNumber);
  const kvk = valideerKvk(kvkNumber);
  const ib = valideerIban(iban);
  if (btw) fouten.btwNumber = btw;
  if (kvk) fouten.kvkNumber = kvk;
  if (ib) fouten.iban = ib;
  return fouten;
}
