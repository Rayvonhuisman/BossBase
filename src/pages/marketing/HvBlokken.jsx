import { useState, useCallback } from "react"

// Gedeelde bouwstenen van het herontwerp 2026 (homepage en functiepagina):
// de iconen, de klik-helpers, het vragenblok en de afsluiting. De stijlen
// staan in bossbase-mkt.css onder "Herontwerp 2026" (hv-*).

/* ── Iconen (lijnstijl, 24-raster) ── */
const ico = (paden, extra = {}) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...extra}>
    {paden}
  </svg>
)
export const HI = {
  check:     ico(<path d="M20 6 9 17l-5-5" />, { strokeWidth: 2.6 }),
  arrow:     ico(<><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></>, { strokeWidth: 2.4 }),
  arrowDown: ico(<><path d="M12 5v14" /><path d="m5 12 7 7 7-7" /></>, { strokeWidth: 2.6 }),
  chevron:   ico(<path d="m6 9 6 6 6-6" />, { strokeWidth: 2.4 }),
  lock:      ico(<><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>),
  bell:      ico(<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9M10.3 21a1.94 1.94 0 0 0 3.4 0" />),
  mail:      ico(<><rect x="2" y="4" width="20" height="16" rx="2" /><path d="m22 7-10 7L2 7" /></>),
  pin:       ico(<><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0" /><circle cx="12" cy="10" r="3" /></>),
  calendar:  ico(<><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></>),
  phone:     ico(<path d="M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.6a2 2 0 0 1-.5 2.1L8 9.7a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.8.3 1.7.6 2.6.7a2 2 0 0 1 1.7 2z" />),
  pen:       ico(<><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></>),
  kanban:    ico(<path d="M6 5v11M12 5v6M18 5v14" />),
  chart:     ico(<path d="M3 3v18h18M18 17V9M13 17V5M8 17v-3" />),
  users:     ico(<><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" /></>),
  file:      ico(<><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8" /></>),
  message:   ico(<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22z" />),
  notebook:  ico(<><path d="M2 6h4M2 10h4M2 14h4M2 18h4" /><rect x="4" y="2" width="16" height="20" rx="2" /><path d="M16 2v20" /></>),
  table:     ico(<><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M12 3v18M3 9h18M3 15h18" /></>),
  alert:     ico(<><circle cx="12" cy="12" r="10" /><path d="M12 8v4M12 16h.01" /></>, { strokeWidth: 2.8 }),
  euro:      ico(<path d="M4 10h12M4 14h9M19 6a7 7 0 0 0-10 0 7.8 7.8 0 0 0 0 12 7 7 0 0 0 10 0" />),
  clock:     ico(<><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></>),
  clipboard: ico(<><rect x="8" y="2" width="8" height="4" rx="1" /><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /><path d="m9 14 2 2 4-4" /></>),
  download:  ico(<><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="m7 10 5 5 5-5" /><path d="M12 15V3" /></>),
  card:      ico(<><rect x="2" y="5" width="20" height="14" rx="2" /><path d="M2 10h20" /></>, { strokeWidth: 2.4 }),
  grip:      ico(<path d="M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01" />, { strokeWidth: 2.4 }),
  warn:      ico(<><path d="m21.7 18-8-14a2 2 0 0 0-3.4 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3" /><path d="M12 9v4M12 17h.01" /></>, { strokeWidth: 2.4 }),
  hash:      ico(<path d="M4 9h16M4 15h16M10 3 8 21M16 3l-2 18" />),
  sticky:    ico(<><path d="M16 3H5a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V8z" /><path d="M15 3v5h5" /></>),
}

export function useGa(navigate) {
  return useCallback((e, href) => {
    // Ctrl/cmd-klik: de browser opent een nieuw tabblad.
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
    e.preventDefault()
    if (navigate) navigate(href)
    else window.location.href = href
  }, [navigate])
}

export function naarAnker(e, id) {
  e.preventDefault()
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth" })
}

/* ── Veelgestelde vragen ── */
// items: [[vraag, antwoord], …]. De eerste staat open.
export function Faq({ navigate, items, titel = "Veelgestelde vragen" }) {
  const go = useGa(navigate)
  const [open, setOpen] = useState(0)
  return (
    <section className="hv-sectie hv-sectie-wit" id="faq">
      <div className="container">
        <div className="hv-kop hv-kop-rij">
          <div>
            <span className="hv-kicker">Veelgestelde vragen</span>
            <h2>{titel}</h2>
            <p>Staat je vraag er niet bij? Mail ons op <a href="mailto:info@bossbase.nl">info@bossbase.nl</a>, we reageren op werkdagen.</p>
          </div>
          <a href="/faq" className="hv-link" onClick={e => go(e, "/faq")}>Alle vragen {HI.arrow}</a>
        </div>
        <div className="hv-faq">
          {items.map(([q, a], i) => (
            <div key={q} className="hv-faq-item" data-open={open === i ? "true" : "false"}>
              <button type="button" className="hv-faq-q" onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i}>
                <span>{q}</span>{HI.chevron}
              </button>
              <div className="hv-faq-a"><div><p>{a}</p></div></div>
            </div>
          ))}
        </div>
      </div>
    </section>
  )
}

/* ── Afsluiting ── */
export function Afsluiting({ navigate }) {
  const go = useGa(navigate)
  return (
    <section className="hv-slot">
      <div className="hv-hero-bg" aria-hidden="true"><span className="hv-glow-a" /><span className="hv-ring-a" /><span className="hv-floor" /></div>
      <div className="container hv-slot-in">
        <div className="hv-slot-copy">
          <span className="hv-wm hv-wm-groot"><b>Boss</b><i>Base</i></span>
          <span className="hv-slot-sub">Zakelijk overzicht</span>
          <a href="/register" className="hv-btn hv-btn-p" onClick={e => go(e, "/register")}>Start nu gratis {HI.arrow}</a>
        </div>
        <img className="hv-slot-foto" src="/kennisbank/afsluiting-ondernemers.webp" alt="Twee ondernemers van een vakbedrijf bekijken samen de administratie op een laptop" width="1774" height="887" loading="lazy" />
      </div>
    </section>
  )
}
