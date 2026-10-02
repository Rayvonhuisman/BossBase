// IBAN-controle (mod 97), dezelfde regel als public.bb_iban_geldig in de
// database. De database is de grens; dit is er voor een melding vóór het opslaan.
export function ibanGeldig(invoer) {
  const v = String(invoer || '').replace(/\s+/g, '').toUpperCase()
  if (!/^[A-Z]{2}[0-9]{2}[A-Z0-9]{11,30}$/.test(v)) return false
  if (v.startsWith('NL') && v.length !== 18) return false
  const omgezet = (v.slice(4) + v.slice(0, 4)).replace(/[A-Z]/g, c => String(c.charCodeAt(0) - 55))
  let rest = 0
  for (let i = 0; i < omgezet.length; i += 7) rest = Number(String(rest) + omgezet.slice(i, i + 7)) % 97
  return rest === 1
}

export const ibanOpslaan = invoer => {
  const v = String(invoer || '').replace(/\s+/g, '').toUpperCase()
  return v || null
}
