import { useEffect, useRef, useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

// Invulhulp bovenop de bestaande losse adresvelden (address / postcode / city).
// Zoekt in de PDOK Locatieserver van het Kadaster: gratis, open CORS, geen API-key.
// Het component slaat zelf niets op — het roept alleen onSelect aan met de
// gestructureerde velden, zodat het formulier eromheen de baas blijft.
//
// Twee verschijningsvormen:
//   - standaard: eigen labelveld boven de losse adresvelden (nieuwe-klant-modal)
//   - inline:    het bewerkveld van één regel ís de zoeker (klantdetail-tab)
const SUGGEST = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/suggest';
const LOOKUP = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/lookup';

// PDOK levert de postcode zonder spatie ("1012JS"); het formulier toont "1234 AB".
const formatPostcode = pc => {
  const raw = (pc || '').replace(/\s+/g, '').toUpperCase();
  return /^\d{4}[A-Z]{2}$/.test(raw) ? `${raw.slice(0, 4)} ${raw.slice(4)}` : (pc || '');
};

// De klantentabel heeft geen aparte straat/huisnummer-kolommen: straat en
// huisnummer gaan samen in `address`. huis_nlt bevat het complete huisnummer
// inclusief toevoeging ("12", "12A", "3-bis"), dus dat is het juiste veld.
const toFormFields = doc => ({
  address: [doc.straatnaam, doc.huis_nlt].filter(Boolean).join(' ').trim(),
  postcode: formatPostcode(doc.postcode),
  city: doc.woonplaatsnaam || '',
});

export default function AdresZoeker({
  onSelect,
  disabled = false,
  label = 'Zoek adres',
  className = '',
  inline = false,
  autoFocus = false,
  placeholder = 'Bijv. Dam 1 Amsterdam of 1012 JS 1',
  // Optioneel gecontroleerd: in de inline-variant is dit het bewerkveld zelf,
  // dus de pagina eromheen houdt de concept-waarde vast.
  value,
  onChange,
  onEnter,
  onEscape,
}) {
  const controlled = value !== undefined;
  const [internal, setInternal] = useState('');
  const query = controlled ? value : internal;
  const setQuery = v => (controlled ? onChange?.(v) : setInternal(v));

  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [active, setActive] = useState(-1);
  const boxRef = useRef(null);
  const abortRef = useRef(null);
  // Na een keuze zetten we het zoekveld op de gekozen tekst — dat mag geen
  // nieuwe suggest-call triggeren.
  const skipNextRef = useRef(false);
  // Een inline-veld start gevuld met het huidige adres; daar hoort niet meteen
  // een dropdown bij. Pas zoeken zodra er echt getypt wordt.
  const firstRunRef = useRef(true);

  // Debounce: pas ~300ms na de laatste toetsaanslag zoeken.
  useEffect(() => {
    if (firstRunRef.current) { firstRunRef.current = false; return; }
    if (skipNextRef.current) { skipNextRef.current = false; return; }
    const q = (query || '').trim();
    if (q.length < 3) { setItems([]); setOpen(false); setError(''); setLoading(false); return; }

    setLoading(true);
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const ctrl = new AbortController();
      abortRef.current = ctrl;
      try {
        const url = `${SUGGEST}?q=${encodeURIComponent(q)}&fq=type:adres&rows=8`;
        const res = await fetch(url, { signal: ctrl.signal });
        if (!res.ok) throw new Error(`PDOK gaf status ${res.status}`);
        const json = await res.json();
        const docs = json?.response?.docs || [];
        setItems(docs);
        setActive(-1);
        setOpen(true);
        setError(docs.length ? '' : 'Geen adres gevonden');
      } catch (err) {
        if (err.name === 'AbortError') return; // opgevolgd door een nieuwere zoekopdracht
        setItems([]);
        setOpen(true);
        setError('Adres zoeken lukt even niet — je kunt het handmatig typen');
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);

    return () => clearTimeout(timer);
  }, [query]);

  useEffect(() => () => abortRef.current?.abort(), []);

  // Buiten het component klikken/tikken sluit de lijst.
  useEffect(() => {
    if (!open) return;
    const onDown = e => { if (boxRef.current && !boxRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  const choose = async item => {
    setOpen(false);
    setItems([]);
    skipNextRef.current = true;
    setQuery(item.weergavenaam || '');
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${LOOKUP}?id=${encodeURIComponent(item.id)}`);
      if (!res.ok) throw new Error(`PDOK gaf status ${res.status}`);
      const json = await res.json();
      const doc = json?.response?.docs?.[0];
      if (!doc) throw new Error('Geen adresdetails ontvangen');
      const fields = toFormFields(doc);
      // Inline is dit veld hét adresveld, dus daar hoort alleen "Dam 1" te staan
      // en niet de volledige weergavenaam "Dam 1, 1012JS Amsterdam".
      if (inline) { skipNextRef.current = true; setQuery(fields.address); }
      onSelect?.(fields);
    } catch {
      setError('Adresdetails ophalen mislukt — je kunt het handmatig typen');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = e => {
    if (open && items.length) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setActive(i => (i + 1) % items.length); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setActive(i => (i <= 0 ? items.length : i) - 1); return; }
      if (e.key === 'Enter' && active >= 0) { e.preventDefault(); choose(items[active]); return; }
      if (e.key === 'Escape') { e.preventDefault(); setOpen(false); return; }
    }
    // Geen suggestie geselecteerd → gedraag je als een gewoon bewerkveld.
    if (e.key === 'Enter') onEnter?.();
    if (e.key === 'Escape') onEscape?.();
  };

  return (
    <div className={`adres-zoeker ${inline ? 'adres-zoeker-inline' : ''} ${className}`} ref={boxRef}>
      {!inline && label && <label>{label}</label>}
      <div className="adres-zoeker-input">
        {!inline && <Search size={15} className="adres-zoeker-icon" aria-hidden="true" />}
        <input
          type="search"
          value={query || ''}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={e => setQuery(e.target.value)}
          onFocus={() => { if (items.length) setOpen(true); }}
          onKeyDown={onKeyDown}
          placeholder={placeholder}
          autoComplete="off"
          spellCheck="false"
          role="combobox"
          aria-expanded={open}
          aria-autocomplete="list"
        />
        {loading && <Loader2 size={15} className="adres-zoeker-spin" aria-hidden="true" />}
      </div>

      {open && (
        <ul className="adres-zoeker-list" role="listbox">
          {items.map((item, i) => (
            <li
              key={item.id}
              role="option"
              aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              // onMouseDown: vuurt vóór blur, zodat de keuze niet verloren gaat.
              onMouseDown={e => { e.preventDefault(); choose(item); }}
              onMouseEnter={() => setActive(i)}
            >
              {item.weergavenaam}
            </li>
          ))}
          {!items.length && error && <li className="adres-zoeker-empty">{error}</li>}
        </ul>
      )}

      {!open && error && <span className="adres-zoeker-error">{error}</span>}
      {!inline && <span className="adres-zoeker-hint">Optioneel — je kunt de velden hieronder ook zelf invullen.</span>}
    </div>
  );
}
