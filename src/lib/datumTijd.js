// Centrale datum/tijd-omrekening. Eén plek, zodat schrijven en lezen niet uit
// elkaar kunnen lopen.
//
// De bug die dit oplost: op meerdere plekken werd `.toISOString()` gebruikt om
// een datum of tijd te TONEN. Dat geeft de UTC-wijzerplaat, niet de Nederlandse.
// Een afspraak van 09:00 werd correct opgeslagen als 07:00Z, maar vervolgens ook
// als "07:00" teruggelezen. Datzelfde patroon zette dagranges een dag terug:
// lokale middernacht is 22:00 UTC op de dag ervóór.
//
// We pinnen bewust op Europe/Amsterdam in plaats van op de browser-tijdzone.
// Dit is een Nederlands product: een gebruiker die vanuit het buitenland inlogt
// hoort nog steeds de Nederlandse planning te zien. Intl regelt zomer- en
// wintertijd zelf, dus er staan hier geen hardgecodeerde +1/+2 offsets.

export const TZ = 'Europe/Amsterdam';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

// De wijzerplaat in Amsterdam op een bepaald moment, als losse getallen.
function wandkloek(instant) {
  const p = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return {
    year: +p.year, month: +p.month, day: +p.day,
    // 24 komt voor bij middernacht in sommige runtimes; normaliseer naar 0.
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
  };
}

// Hoeveel ms loopt Amsterdam voor op UTC, op dat moment? (+2u zomer, +1u winter)
function offsetMs(instant) {
  const w = wandkloek(instant);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - instant.getTime();
}

const pad = n => String(n).padStart(2, '0');
const naarDate = v => (v instanceof Date ? v : new Date(v));

// ── LEZEN: UTC-instant → Nederlandse weergave ────────────────────────────────

/** YYYY-MM-DD zoals die dag in Nederland heet. */
export function lokaleDatum(value) {
  const d = naarDate(value);
  if (Number.isNaN(d.getTime())) return '';
  const w = wandkloek(d);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** HH:mm zoals de klok in Nederland wijst. */
export function lokaleTijd(value) {
  const d = naarDate(value);
  if (Number.isNaN(d.getTime())) return '';
  const w = wandkloek(d);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** { date, time } in één keer — vervangt de oude splitEventTime. */
export function splitsLokaal(value) {
  if (!value) return { date: '', time: '' };
  return { date: lokaleDatum(value), time: lokaleTijd(value) };
}

/** Vandaag in Nederland. Vervangt `new Date().toISOString().slice(0,10)`, dat
 *  tussen middernacht en 01:00/02:00 nog de vorige dag teruggaf. */
export function vandaagIso() {
  return lokaleDatum(new Date());
}

// ── SCHRIJVEN: Nederlandse wandkloektijd → UTC-instant ───────────────────────

/**
 * Zet een Nederlandse datum+tijd om naar het bijbehorende UTC-moment.
 * "2026-07-28" + "09:00" → 2026-07-28T07:00:00.000Z (zomertijd)
 * "2026-01-28" + "09:00" → 2026-01-28T08:00:00.000Z (wintertijd)
 */
export function lokaalNaarUtc(dateStr, timeStr = '00:00') {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').slice(0, 5).split(':').map(Number);
  if (!y || !m || !d) return null;

  const alsofUtc = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  // Eerste schatting met de offset op dat moment, daarna één correctieronde.
  // Die tweede ronde vangt de DST-overgang af, waar de offset vóór en ná het
  // omgerekende moment verschilt.
  let ts = alsofUtc - offsetMs(new Date(alsofUtc));
  ts = alsofUtc - offsetMs(new Date(ts));
  return new Date(ts);
}

/** Middernacht (00:00 NL) van een YYYY-MM-DD, als UTC-instant. */
export const beginVanDag = dateStr => lokaalNaarUtc(dateStr, '00:00');

/** 23:59:59.999 NL van een YYYY-MM-DD, als UTC-instant. */
export function eindVanDag(dateStr) {
  const start = lokaalNaarUtc(dateStr, '00:00');
  if (!start) return null;
  const volgende = voegDagenToe(dateStr, 1);
  return new Date(lokaalNaarUtc(volgende, '00:00').getTime() - 1);
}

// ── DAGREKENEN op YYYY-MM-DD, zonder tijdzone-valkuilen ──────────────────────

/** Telt dagen op bij een YYYY-MM-DD en geeft weer YYYY-MM-DD terug. */
export function voegDagenToe(dateStr, aantal) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + aantal);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Weekdag van een YYYY-MM-DD: 0 = maandag … 6 = zondag. */
export function weekdagMaandag0(dateStr) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  return (new Date(Date.UTC(y, m - 1, d)).getUTCDay() + 6) % 7;
}

/** De maandag van de week waarin deze datum valt, als YYYY-MM-DD. */
export function maandagVan(dateStr = vandaagIso()) {
  return voegDagenToe(dateStr, -weekdagMaandag0(dateStr));
}
