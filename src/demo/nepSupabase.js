// Nep-Supabase voor de demo op bossbase.nl/demo.
//
// ── Waarom zo ───────────────────────────────────────────────────────────────
// De demo moet er identiek uitzien als het echte portaal. Dat lukt alleen als
// de ECHTE pagina's draaien — niet een nabouw ernaast, die binnen een maand uit
// de pas loopt. Alle 37 bestanden die data ophalen importeren dezelfde client
// uit lib/supabase.js, dus dat is de enige plek waar ingegrepen hoeft te worden.
// Services, pagina's en componenten blijven ongewijzigd en weten van niets.
//
// Dit bestand bootst het stuk van de supabase-js API na dat de app werkelijk
// gebruikt: de query-keten (from/select/eq/order/…), schrijfacties in het
// geheugen, en vaste antwoorden voor rpc/functions/storage/auth.
//
// ── De belangrijkste regel ──────────────────────────────────────────────────
// Onbekende tabel, kolom of functie levert een LEEG resultaat op, nooit een
// fout. Een demoscherm dat iets opvraagt waar ik niet aan gedacht heb, toont
// dan hooguit een lege lijst in plaats van stuk te gaan voor de bezoeker.

import { demoDb, nieuwId } from './demoDb.js';

// ── Hulp ────────────────────────────────────────────────────────────────────

const kopie = rij => (rij && typeof rij === 'object' ? { ...rij } : rij);
const ok = (data, count = null) => Promise.resolve({ data, error: null, count, status: 200 });

// Waardevergelijking die omgaat met datums-als-string en null.
const gelijk = (a, b) => {
  if (a === null || a === undefined) return b === null || b === undefined;
  return String(a) === String(b);
};

function parseKolommen(select) {
  if (!select || select === '*') return null;
  return select
    .replace(/\([^)]*\)/g, '')     // relaties eruit
    .split(',')
    .map(s => s.trim())
    .filter(Boolean);
}

// Welke kolom verwijst naar welke tabel. Nodig omdat services ingebedde
// relaties opvragen — `select('*, customers(name)')` en dan `row.customers.name`
// lezen. Zonder dit blijft de klantnaam leeg op juist de plekken waar hij het
// meest opvalt: deals, facturen, offertes, werkbonnen.
const RELATIE_SLEUTEL = {
  customers: 'customer_id',
  companies: 'company_id',
  deals: 'deal_id',
  offertes: 'offerte_id',
  facturen: 'factuur_id',
  werkbonnen: 'werkbon_id',
  projects: 'project_id',
  pipeline_stages: 'stage_id',
  activities: 'activiteit_id',
  profiles: 'profile_id',
};

// Herkent `customers(name, email)` en `alias:profiles!fk(full_name)`.
function parseRelaties(select) {
  if (!select) return [];
  const uit = [];
  const patroon = /(?:([a-z_]+)\s*:\s*)?([a-z_]+)(?:!\w+)?\s*\(/gi;
  let m;
  while ((m = patroon.exec(select)) !== null) {
    const alias = m[1] || m[2];
    const tabel = m[2];
    if (RELATIE_SLEUTEL[tabel] || tabel === 'profiles') uit.push({ alias, tabel, viaAlias: !!m[1] });
  }
  return uit;
}

// Zoekt de gekoppelde rij op. Voor profiles is de verwijzende kolom afhankelijk
// van de context (assigned_to, created_by, profile_id), dus die proberen we op
// volgorde — een mis levert null, nooit een fout.
function koppel(rij, { alias, tabel, viaAlias }) {
  const bron = demoDb[tabel] || [];
  const kandidaten = tabel === 'profiles'
    ? [viaAlias ? `${alias}_id` : null, 'profile_id', 'assigned_to', 'created_by', 'eigenaar_id'].filter(Boolean)
    : [RELATIE_SLEUTEL[tabel]];
  for (const kolom of kandidaten) {
    const waarde = rij[kolom];
    if (waarde == null) continue;
    const gevonden = bron.find(r => String(r.id) === String(waarde));
    if (gevonden) return kopie(gevonden);
  }
  return null;
}

// ── Query-keten ─────────────────────────────────────────────────────────────
// Elke methode geeft `this` terug, zodat .eq().order().limit() blijft werken.
// De keten is "thenable": await levert { data, error } op, net als bij het
// echte pakket.

class Query {
  constructor(tabel) {
    this.tabel = tabel;
    this.rijen = (demoDb[tabel] || []).map(kopie);
    this.filters = [];
    this.volgorde = null;
    this.max = null;
    this.enkel = null;        // 'single' | 'maybeSingle'
    this.telMee = false;
    this.kolommen = null;
    this.schrijf = null;      // { soort, waarden }
  }

  // ── Lezen ──
  select(kolommen, opties = {}) {
    this.kolommen = parseKolommen(kolommen);
    this.relaties = parseRelaties(kolommen);
    if (opties.count) this.telMee = true;
    return this;
  }

  eq(kolom, waarde)  { this.filters.push(r => gelijk(r[kolom], waarde)); return this; }
  neq(kolom, waarde) { this.filters.push(r => !gelijk(r[kolom], waarde)); return this; }
  gt(kolom, waarde)  { this.filters.push(r => r[kolom] > waarde); return this; }
  gte(kolom, waarde) { this.filters.push(r => r[kolom] >= waarde); return this; }
  lt(kolom, waarde)  { this.filters.push(r => r[kolom] < waarde); return this; }
  lte(kolom, waarde) { this.filters.push(r => r[kolom] <= waarde); return this; }

  in(kolom, lijst) {
    const set = new Set((lijst || []).map(String));
    this.filters.push(r => set.has(String(r[kolom])));
    return this;
  }

  is(kolom, waarde) {
    // .is('x', null) is de gangbare vorm; true/false komt ook voor.
    this.filters.push(r => (waarde === null ? r[kolom] == null : r[kolom] === waarde));
    return this;
  }

  not(kolom, operator, waarde) {
    if (operator === 'is') this.filters.push(r => (waarde === null ? r[kolom] != null : r[kolom] !== waarde));
    else this.filters.push(r => !gelijk(r[kolom], waarde));
    return this;
  }

  contains(kolom, lijst) {
    this.filters.push(r => Array.isArray(r[kolom]) && (lijst || []).every(v => r[kolom].includes(v)));
    return this;
  }

  // `or('a.eq.1,b.eq.2')` komt twee keer voor; hier bewust ruim genomen.
  or(uitdrukking) {
    const delen = String(uitdrukking || '').split(',').map(d => d.split('.'));
    this.filters.push(r => delen.some(([kolom, , waarde]) => gelijk(r[kolom], waarde)));
    return this;
  }

  order(kolom, opties = {}) { this.volgorde = { kolom, oplopend: opties.ascending !== false }; return this; }
  limit(n) { this.max = n; return this; }
  range(van, tot) { this.vanaf = van; this.max = tot - van + 1; return this; }
  single() { this.enkel = 'single'; return this; }
  maybeSingle() { this.enkel = 'maybeSingle'; return this; }

  // ── Schrijven (alleen in het geheugen) ──
  insert(waarden) { this.schrijf = { soort: 'insert', waarden }; return this; }
  update(waarden) { this.schrijf = { soort: 'update', waarden }; return this; }
  upsert(waarden) { this.schrijf = { soort: 'upsert', waarden }; return this; }
  delete() { this.schrijf = { soort: 'delete' }; return this; }

  // ── Uitvoeren ──
  _pasFiltersToe(rijen) { return rijen.filter(r => this.filters.every(f => f(r))); }

  _voerSchrijfUit() {
    const bron = demoDb[this.tabel] || (demoDb[this.tabel] = []);
    const nu = new Date().toISOString();

    if (this.schrijf.soort === 'delete') {
      const weg = this._pasFiltersToe(bron);
      const ids = new Set(weg.map(r => r.id));
      demoDb[this.tabel] = bron.filter(r => !ids.has(r.id));
      return weg.map(kopie);
    }

    if (this.schrijf.soort === 'update') {
      const raak = bron.filter(r => this.filters.every(f => f(r)));
      raak.forEach(r => Object.assign(r, this.schrijf.waarden, { updated_at: nu }));
      return raak.map(kopie);
    }

    // insert / upsert
    const lijst = Array.isArray(this.schrijf.waarden) ? this.schrijf.waarden : [this.schrijf.waarden];
    const nieuw = lijst.map(w => ({
      id: w.id || nieuwId(),
      created_at: nu,
      updated_at: nu,
      ...w,
    }));
    nieuw.forEach(r => {
      const bestaat = this.schrijf.soort === 'upsert' && bron.findIndex(x => x.id === r.id);
      if (bestaat > -1 && bestaat !== false) Object.assign(bron[bestaat], r);
      else bron.push(r);
    });
    return nieuw.map(kopie);
  }

  then(vervolg, fout) {
    let data;
    try {
      data = this.schrijf ? this._voerSchrijfUit() : this._pasFiltersToe(this.rijen);

      if (!this.schrijf) {
        if (this.volgorde) {
          const { kolom, oplopend } = this.volgorde;
          data.sort((a, b) => {
            const x = a[kolom] ?? '', y = b[kolom] ?? '';
            if (x === y) return 0;
            return (x > y ? 1 : -1) * (oplopend ? 1 : -1);
          });
        }
        if (this.vanaf) data = data.slice(this.vanaf);
        if (this.max != null) data = data.slice(0, this.max);
      }

      // Ingebedde relaties erbij hangen, zodat row.customers.name werkt.
      if (this.relaties?.length) {
        data = data.map(rij => {
          const uit = { ...rij };
          this.relaties.forEach(rel => { uit[rel.alias] = koppel(rij, rel); });
          return uit;
        });
      }

      const aantal = data.length;
      if (this.enkel) {
        const rij = data[0] ?? null;
        // single() hoort te klagen bij niets gevonden; in de demo is een lege
        // uitkomst normaal (niet alle schermen hebben data), dus geen fout.
        return Promise.resolve({ data: rij, error: null, count: aantal, status: 200 }).then(vervolg, fout);
      }
      return ok(data, this.telMee ? aantal : null).then(vervolg, fout);
    } catch (e) {
      // Nooit de demo laten breken op een aanroep waar ik niet aan dacht.
      if (import.meta.env.DEV) console.warn('[demo] query mislukt op', this.tabel, e?.message);
      return ok([], 0).then(vervolg, fout);
    }
  }
}

// ── Vaste antwoorden voor databasefuncties ──────────────────────────────────
// De echte functies draaien serverlogica die hier niet bestaat. Alleen die
// waarvan de uitkomst het scherm bepaalt, krijgen een antwoord; de rest levert
// null, wat elke aanroeper als "niets" behandelt.
const RPC_ANTWOORDEN = {
  // Alles aan, niets geblokkeerd: de bezoeker moet elke module kunnen zien.
  get_plan_status: {
    tier: 'team',
    trial: false,
    readonly: false,
    modules: ['planning', 'projecten', 'kosten_nacalculatie', 'voertuigen'],
    features: ['planning', 'projecten', 'kosten_nacalculatie', 'betaalherinneringen', 'voertuigen'],
    limieten: {},
  },
  get_company_tier: 'team',
  get_billing_status: { status: 'actief', tier: 'team' },
  get_accounting_status: { connected: false },
  google_calendar_status: { connected: false },
  bb_downgrade_blokkades: [],
  bb_mag_wisselen: true,
  bb_uren_per_project: [],
};

// ── De nepclient ────────────────────────────────────────────────────────────

const DEMO_GEBRUIKER = {
  id: demoDb.__profielId,
  email: 'demo@bossbase.nl',
  user_metadata: { full_name: 'Sander de Vries' },
};

export const nepSupabase = {
  from(tabel) { return new Query(tabel); },

  rpc(naam, params) {
    if (naam in RPC_ANTWOORDEN) return ok(RPC_ANTWOORDEN[naam]);
    if (import.meta.env.DEV) console.info('[demo] rpc zonder antwoord:', naam, params);
    return ok(null);
  },

  // Geen mails, geen PDF's, geen betalingen: melden dat het gelukt is en verder
  // niets doen. De knoppen reageren dus wel, maar er vertrekt niets.
  functions: {
    invoke(naam) {
      if (import.meta.env.DEV) console.info('[demo] edge function overgeslagen:', naam);
      return Promise.resolve({ data: { success: true, demo: true }, error: null });
    },
  },

  storage: {
    from() {
      return {
        upload: () => Promise.resolve({ data: { path: 'demo/bestand.pdf' }, error: null }),
        remove: () => Promise.resolve({ data: [], error: null }),
        list:   () => Promise.resolve({ data: [], error: null }),
        getPublicUrl: () => ({ data: { publicUrl: '' } }),
        createSignedUrl: () => Promise.resolve({ data: { signedUrl: '' }, error: null }),
      };
    },
  },

  auth: {
    getUser:    () => Promise.resolve({ data: { user: DEMO_GEBRUIKER }, error: null }),
    getSession: () => Promise.resolve({ data: { session: { user: DEMO_GEBRUIKER } }, error: null }),
    signOut:    () => Promise.resolve({ error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
  },

  channel() {
    return { on() { return this; }, subscribe() { return this; }, unsubscribe() {} };
  },
  removeChannel() {},
};

export default nepSupabase;
