// Nederlandse datum/tijd voor edge functions.
//
// Deno draait in UTC. `toLocaleTimeString('nl-NL')` zonder timeZone geeft dus de
// UTC-klok — daardoor stond er in de afspraakherinnering-mail een tijd die twee
// uur (zomer) of één uur (winter) afweek van de afspraak.
//
// Dit is de server-tegenhanger van src/lib/datumTijd.js. Beide pinnen expliciet
// op Europe/Amsterdam; Intl regelt zomer-/wintertijd zelf.

export const TZ = 'Europe/Amsterdam';

const partsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: TZ,
  hour12: false,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
});

type Wandkloek = { year: number; month: number; day: number; hour: number; minute: number; second: number };

function wandkloek(instant: Date): Wandkloek {
  const p: Record<string, string> = {};
  for (const part of partsFormatter.formatToParts(instant)) {
    if (part.type !== 'literal') p[part.type] = part.value;
  }
  return {
    year: +p.year, month: +p.month, day: +p.day,
    hour: +p.hour % 24, minute: +p.minute, second: +p.second,
  };
}

function offsetMs(instant: Date): number {
  const w = wandkloek(instant);
  return Date.UTC(w.year, w.month - 1, w.day, w.hour, w.minute, w.second) - instant.getTime();
}

const pad = (n: number) => String(n).padStart(2, '0');

/** YYYY-MM-DD zoals die dag in Nederland heet. */
export function lokaleDatum(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const w = wandkloek(d);
  return `${w.year}-${pad(w.month)}-${pad(w.day)}`;
}

/** HH:mm zoals de klok in Nederland wijst. */
export function lokaleTijd(value: Date | string): string {
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const w = wandkloek(d);
  return `${pad(w.hour)}:${pad(w.minute)}`;
}

/** Nederlandse datum+tijd → het bijbehorende UTC-moment. */
export function lokaalNaarUtc(dateStr: string, timeStr = '00:00'): Date | null {
  if (!dateStr) return null;
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const [hh, mm] = String(timeStr || '00:00').slice(0, 5).split(':').map(Number);
  if (!y || !m || !d) return null;
  const alsofUtc = Date.UTC(y, m - 1, d, hh || 0, mm || 0, 0);
  let ts = alsofUtc - offsetMs(new Date(alsofUtc));
  ts = alsofUtc - offsetMs(new Date(ts));
  return new Date(ts);
}

/** Telt dagen op bij een YYYY-MM-DD en geeft weer YYYY-MM-DD terug. */
export function voegDagenToe(dateStr: string, aantal: number): string {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d));
  t.setUTCDate(t.getUTCDate() + aantal);
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

/** Vandaag in Nederland. */
export const vandaagIso = () => lokaleDatum(new Date());

/** Volledige Nederlandse datumweergave, bv. "dinsdag 28 juli 2026". */
export const langeDatumNl = (value: Date | string) =>
  new Date(value).toLocaleDateString('nl-NL', {
    timeZone: TZ, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
