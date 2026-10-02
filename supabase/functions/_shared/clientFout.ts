// Welke fouttekst mag naar de browser?
//
// Eigen meldingen ("SnelStart-koppeling niet actief", de gebruikerslimiet uit de
// database) zijn bedoeld voor de gebruiker en gaan door. Technische teksten —
// databasefouten met tabel- en kolomnamen, JWT-, netwerk- en JavaScriptfouten —
// niet: die zeggen een buitenstaander hoe het systeem eruitziet en de gebruiker
// niets. Die worden een algemene Nederlandse melding; het detail gaat naar de
// functielog. Audit 2026-10-01, laag (F5/B-14).

const TECHNISCH = /(relation |column |violates|syntax error|permission denied|row-level security|duplicate key|invalid input|PGRST|JWT|jwt|fetch failed|TypeError|ReferenceError|SyntaxError|is not a function|undefined|Cannot read|ECONN|ETIMEDOUT|timeout|stack|at \w+ \(|https?:\/\/|\bsql\b|42\d{3}|23\d{3})/i

export function clientFout(err: unknown, terugval = 'Er ging iets mis. Probeer het later opnieuw.'): string {
  const tekst = typeof err === 'string' ? err : (err as { message?: string })?.message ?? String(err ?? '')
  if (!tekst || tekst.length > 300 || TECHNISCH.test(tekst)) {
    if (tekst) console.error('[clientFout]', tekst)
    return terugval
  }
  return tekst
}
