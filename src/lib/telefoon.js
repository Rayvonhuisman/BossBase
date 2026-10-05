// Controle op een telefoonnummer zoals mensen het intypen: met spaties,
// streepjes, punten of haakjes ertussen.
//
//   06-12345678, 0612345678, 020 - 123 45 67  → Nederlands: 10 cijfers, begint met 0
//   +31 6 12345678, 0031 6 12345678           → internationaal
//   +49 30 1234567, +32 470 12 34 56          → buitenlands
//
// Internationaal: landcode plus nummer, 8 tot 15 cijfers in totaal (E.164).
// Een +31-nummer moet daarna nog steeds een geldig Nederlands nummer zijn
// (9 cijfers zonder de 0), zodat "+31 6 1234" niet doorglipt.

export function telefoonFout(invoer) {
  const ruw = (invoer || '').trim()
  if (!ruw) return 'Vul je telefoonnummer in.'
  if (!/^\+?[\d\s\-.()/]+$/.test(ruw)) return 'Een telefoonnummer bevat alleen cijfers, spaties, streepjes en eventueel een + vooraan.'

  const cijfers = ruw.replace(/\D/g, '')
  const internationaal = ruw.startsWith('+') ? cijfers : cijfers.startsWith('00') ? cijfers.slice(2) : null

  if (internationaal !== null) {
    if (internationaal.startsWith('31')) {
      const nl = internationaal.slice(2).replace(/^0/, '')   // "+31 (0)6 …" mag ook
      return /^[1-9]\d{8}$/.test(nl) ? '' : 'Dit is geen geldig Nederlands nummer.'
    }
    return /^[1-9]\d{7,14}$/.test(internationaal) ? '' : 'Vul een geldig nummer in, met landcode (bijv. +32 470 12 34 56).'
  }

  if (/^0[1-9]\d{8}$/.test(cijfers)) return ''
  return 'Vul een geldig telefoonnummer in, bijv. 06-12345678 of +32 470 12 34 56.'
}
