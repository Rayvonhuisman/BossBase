import { useState, useEffect, useRef, useCallback } from "react"
import "./bossbase-mkt.css"

/* ── Icons ── */
export const I = {
  check: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8l3.5 3.5L13 4.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  checkCircle: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <circle cx="10" cy="10" r="9" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 10l2.5 2.5L14 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  arrowRight: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M3 8h10M9 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  chevronDown: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  chevronRight: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M6 4l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  menu: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M3 7h16M3 11h16M3 15h16" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  x: (
    <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
      <path d="M5 5l12 12M17 5L5 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round"/>
    </svg>
  ),
  mail: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="4" width="14" height="10" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 7l7 4 7-4" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  kanban: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="4" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="7" y="2" width="4" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="12" y="2" width="4" height="10" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  signature: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 13c1.5-3 3-6 4.5-6S9 9 10 9s2-3 3-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M2 15h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  calendar: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="14" height="13" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 2v2M12 2v2M2 8h14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  chart: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 14l4-5 3.5 3.5L14 5l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  users: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="7" cy="6" r="3" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M1 15c0-3 2.7-5 6-5s6 2 6 5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M12 5c1.7 0 3 1.3 3 3M17 15c0-2.5-1.5-4-3-4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  truck: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="1" y="5" width="10" height="8" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M11 7h3.5L17 10v3h-6V7z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <circle cx="4.5" cy="14" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="13.5" cy="14" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  bolt: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M10 2L4 10h5l-1 6 7-9h-5l1-5z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  shield: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L3 5v5c0 4 3 6.5 6 7 3-.5 6-3 6-7V5L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M6 9l2 2 4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  star: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor">
      <path d="M8 1l1.8 4 4.4.5-3.2 3 .9 4.4L8 10.8l-3.9 2.1.9-4.4-3.2-3 4.4-.5L8 1z"/>
    </svg>
  ),
  search: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="8" cy="8" r="5.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M12.5 12.5L16 16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  phone: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4 2h4l1.5 4-2.5 1.5c1 2 2.5 3.5 4.5 4.5L13 9.5l4 1.5v4c0 1.1-.9 2-2 2-8 0-13-5-13-13C2 2.9 2.9 2 4 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  mapPin: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2C6.2 2 4 4.2 4 7c0 4.5 5 9 5 9s5-4.5 5-9c0-2.8-2.2-5-5-5z" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="9" cy="7" r="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  externalLink: (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
      <path d="M6 3H3C2.4 3 2 3.4 2 4v7c0 .6.4 1 1 1h7c.6 0 1-.4 1-1V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M8 2h4v4M12 2L7 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  dash: (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
      <path d="M4 8h8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  sparkle: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2l1.2 4.8H15l-3.9 2.8 1.5 4.6L9 11.4l-3.6 2.8 1.5-4.6L3 7.8h4.8L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  tool: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M13.5 2c-2 0-3.5 1.5-3.5 3.5 0 .4.1.8.2 1.2L3 14c-.5.5-.5 1.5 0 2s1.5.5 2 0l7.3-7.2c.4.1.8.2 1.2.2C15.5 9 17 7.5 17 5.5c0-.5-.1-1-.3-1.4L14 6.8 12.2 5l2.7-2.7c-.4-.2-.9-.3-1.4-.3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  clock: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 5v4l2.5 2.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  heart: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 15s-7-4.35-7-9a4 4 0 0 1 7-2.7A4 4 0 0 1 16 6c0 4.65-7 9-7 9z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  rocket: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2c4 0 7 3.5 7 8v1l-3 1-2-3-3 3-1-3L4 11v-1c0-4.5 3-8 7-8z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M6 11c-1 1.5-1 3-1 4h3v-3M12 11c1 1.5 1 3 1 4h-3v-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  building: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="4" width="14" height="12" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M6 16v-5h6v5M9 4V2M5 8h2M11 8h2M5 12h2M11 12h2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  wrench: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M13 3.5A3 3 0 0 0 7.5 7l-4.5 4.5a1.5 1.5 0 0 0 2 2L9.5 9A3 3 0 0 0 13 3.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  package: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L2 5.5v7L9 16l7-3.5v-7L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M2 5.5L9 9l7-3.5M9 9v7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  zap: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M10 2L4 10h5l-1 6 7-9h-5l1-5z" fill="currentColor"/>
    </svg>
  ),
  linkedIn: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="currentColor">
      <path d="M4.5 6H2v10h2.5V6zM3.25 5a1.5 1.5 0 1 0 0-3 1.5 1.5 0 0 0 0 3zM7 6H4.75v10H7v-5.3c0-2.8 3.5-3 3.5 0V16H13v-6.4C13 6.2 10 6 8.75 7.5V6H7z"/>
    </svg>
  ),
  instagram: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="4" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="9" cy="9" r="3.5" stroke="currentColor" strokeWidth="1.5"/>
      <circle cx="13.5" cy="4.5" r="0.75" fill="currentColor"/>
    </svg>
  ),
  checkBig: (
    <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
      <path d="M4 10l4 4 8-8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  close: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M4 4l10 10M14 4L4 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  warning: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2L1 16h16L9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M9 8v4M9 14v.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  paintRoller: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="3" width="11" height="5" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M9 5.5h4a1 1 0 0 1 1 1v1a1 1 0 0 1-1 1H9" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M10 8.5v3.5a1 1 0 0 0 1 1h0a1 1 0 0 1 1 1V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  leaf: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M14 3C14 3 14 10 8 12c-2 .7-4.5.5-6 .5 0 0 1-8 8-9.5A9 9 0 0 1 14 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M4 15c1-1.5 2.5-2.5 4-3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  hammer: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M10 3l5 5-1.5 1.5-1-1L7 14l-3-3 5.5-5.5-1-1L10 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M4 14l1 1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  roof: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M1 9L9 2l8 7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
      <path d="M3 8v7h4v-4h4v4h4V8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
  ),
  sparkles: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2v2M9 14v2M2 9h2M14 9h2M4.2 4.2l1.4 1.4M12.4 12.4l1.4 1.4M4.2 13.8l1.4-1.4M12.4 5.6l1.4-1.4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <circle cx="9" cy="9" r="2.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  trowel: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M3 15l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
      <path d="M7 11L14 4a2 2 0 0 0-3-3L4 8l3 3z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M12 6l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  droplet: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2C9 2 3.5 8 3.5 11.5a5.5 5.5 0 0 0 11 0C14.5 8 9 2 9 2z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  bell: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M9 2a5 5 0 0 0-5 5v4l-1.5 2h13L14 11V7a5 5 0 0 0-5-5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M7 13a2 2 0 0 0 4 0" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  smartphone: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="4" y="1" width="10" height="16" rx="2" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M7.5 14.5h3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  message: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M2 3h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H5l-3 3V4a1 1 0 0 1 1-1z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
    </svg>
  ),
  notebook: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="3" y="2" width="12" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M3 6h12M6 2v14M7 9h6M7 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  table: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="14" height="14" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <path d="M2 7h14M7 7v9" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
  euro: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M13 5a5.5 5.5 0 1 0 0 8M3 9h7M3 12h6" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  fileText: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M10 2H4a1 1 0 0 0-1 1v12a1 1 0 0 0 1 1h10a1 1 0 0 0 1-1V6l-5-4z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round"/>
      <path d="M10 2v4h4M6 9h6M6 12h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
    </svg>
  ),
  dashboard: (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <rect x="2" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="10" y="2" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="2" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
      <rect x="10" y="10" width="6" height="6" rx="1.5" stroke="currentColor" strokeWidth="1.5"/>
    </svg>
  ),
}

/* ── Wordmark ── */
export function Wordmark({ onDark, navigate }) {
  return (
    <a
      href="/"
      className={`wordmark${onDark ? " on-dark" : ""}`}
      onClick={e => { if (navigate) { e.preventDefault(); navigate("/") } }}
    >
      <span className="b1">Boss</span>Base
    </a>
  )
}

/* ── Reveal on scroll ── */
export function Reveal({ children, className = "", stagger = false, delay = 0 }) {
  const ref = useRef(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    const io = new IntersectionObserver(
      ([entry]) => { if (entry.isIntersecting) { el.classList.add("in"); io.disconnect() } },
      { threshold: 0.1 }
    )
    io.observe(el)
    return () => io.disconnect()
  }, [])
  const style = delay ? { transitionDelay: `${delay}ms` } : {}
  return (
    <div ref={ref} className={`${stagger ? "stagger" : "reveal"} ${className}`} style={style}>
      {children}
    </div>
  )
}

/* ── Nav ── */
const NAV_LINKS = [
  { label: "Home",       href: "/" },
  { label: "Functies",   href: "/functies" },
  { label: "Prijzen",    href: "/prijzen" },
  { label: "Voor wie",   href: "/voor-wie" },
  { label: "Over",       href: "/over" },
  { label: "Contact",    href: "/contact" },
]

export function Nav({ navigate }) {
  const [scrolled, setScrolled] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState("/")

  useEffect(() => {
    const path = window.location.pathname
    setActive(path === "" ? "/" : path)
    const onScroll = () => setScrolled(window.scrollY > 24)
    window.addEventListener("scroll", onScroll, { passive: true })
    return () => window.removeEventListener("scroll", onScroll)
  }, [])

  const go = useCallback((e, href) => {
    e.preventDefault()
    setOpen(false)
    setActive(href)
    if (navigate) navigate(href)
    else window.location.href = href
  }, [navigate])

  return (
    <>
      <nav className={`nav${scrolled ? " scrolled" : ""}`}>
        <div className="container">
          <div className="nav-inner">
            <Wordmark navigate={navigate} />
            <ul className="nav-links">
              {NAV_LINKS.map(l => (
                <li key={l.href}>
                  <a
                    href={l.href}
                    className={active === l.href ? "active" : ""}
                    onClick={e => go(e, l.href)}
                  >
                    {l.label}
                  </a>
                </li>
              ))}
            </ul>
            <div className="nav-right">
              <a href="/login" className="btn btn-ghost" onClick={e => go(e, "/login")}>Inloggen</a>
              <a href="/registreer" className="btn btn-p" onClick={e => go(e, "/registreer")}>Gratis proberen</a>
              <button className="hamburger" aria-label="Menu" onClick={() => setOpen(o => !o)}>
                {open ? I.x : I.menu}
              </button>
            </div>
          </div>
        </div>
      </nav>
      <div className={`mobile-menu${open ? " open" : ""}`}>
        {NAV_LINKS.map(l => (
          <a key={l.href} href={l.href} onClick={e => go(e, l.href)}>{l.label}</a>
        ))}
        <a href="/registreer" className="btn btn-p mobile-menu-cta" onClick={e => go(e, "/registreer")}>
          Gratis proberen
        </a>
      </div>
    </>
  )
}

/* ── Footer ── */
const FOOTER_LINKS = {
  Product: [
    { label: "Functies",  href: "/functies" },
    { label: "Prijzen",   href: "/prijzen" },
    { label: "Voor wie",  href: "/voor-wie" },
    { label: "Demo",      href: "/registreer" },
  ],
  Bedrijf: [
    { label: "Over ons",  href: "/over" },
    { label: "Contact",   href: "/contact" },
    { label: "FAQ",       href: "/faq" },
  ],
  Juridisch: [
    { label: "Privacy",   href: "/privacy" },
    { label: "Voorwaarden", href: "/voorwaarden" },
  ],
}

export function Footer({ navigate }) {
  const go = useCallback((e, href) => {
    e.preventDefault()
    if (navigate) navigate(href)
    else window.location.href = href
  }, [navigate])

  return (
    <footer className="footer">
      <div className="container">
        <div className="footer-grid">
          <div>
            <Wordmark onDark navigate={navigate} />
            <p className="footer-tag">Jij de baas, wij de basis. Het complete systeem voor vakmensen in Nederland.</p>
            <a href="mailto:hallo@bossbase.nl" className="footer-email">hallo@bossbase.nl</a>
          </div>
          {Object.entries(FOOTER_LINKS).map(([title, links]) => (
            <div key={title}>
              <h4>{title}</h4>
              <ul>
                {links.map(l => (
                  <li key={l.href}>
                    <a href={l.href} onClick={e => go(e, l.href)}>{l.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="footer-bottom">
          <span>© 2026 BossBase</span>
          <span>Gemaakt in Nederland</span>
        </div>
      </div>
    </footer>
  )
}

/* ── ScrollLine ── */
export function ScrollLine() {
  const pathRef = useRef(null)
  const reduced = useReducedMotion()
  useEffect(() => {
    const path = pathRef.current
    if (!path) return
    const len = path.getTotalLength()
    path.style.strokeDasharray = len
    path.style.strokeDashoffset = len
    const onScroll = () => {
      const docH = document.body.scrollHeight - window.innerHeight
      const pct  = docH > 0 ? Math.min(window.scrollY / docH, 1) : 0
      path.style.strokeDashoffset = len * (1 - pct)
    }
    window.addEventListener("scroll", onScroll, { passive: true })
    window.addEventListener("resize", onScroll, { passive: true })
    onScroll()
    return () => {
      window.removeEventListener("scroll", onScroll)
      window.removeEventListener("resize", onScroll)
    }
  }, [])
  return (
    <div className="scroll-line" aria-hidden="true">
      <svg width="100%" height="100%" viewBox="0 0 1000 10000" preserveAspectRatio="none" fill="none">
        <path
          ref={pathRef}
          d="M 620 0
             C 620 620, 180 900, 180 1620
             C 180 2340, 820 2560, 820 3320
             C 820 4120, 160 4320, 160 5120
             C 160 5920, 840 6120, 840 6920
             C 840 7720, 200 7920, 200 8720
             C 200 9340, 600 9520, 600 10000"
          stroke="#1DDB62"
          strokeWidth="2"
          strokeLinecap="round"
          fill="none"
          style={{
            opacity: reduced ? 0.15 : 0.35,
            filter: "drop-shadow(0 0 6px rgba(29,219,98,0.4))",
          }}
        />
      </svg>
    </div>
  )
}

/* ── initChoreo ── */
export function initChoreo() {
  const supportsTimeline = (() => {
    try { return CSS.supports("animation-timeline", "view()") } catch { return false }
  })()
  if (!supportsTimeline) {
    document.documentElement.classList.add("choreo-js")
    let raf = null
    const update = () => {
      document.querySelectorAll(".bm .choreo, .bm .choreo-head, .bm .choreo-body").forEach(el => {
        const rect  = el.getBoundingClientRect()
        const vh    = window.innerHeight
        const entry = Math.max(0, Math.min(1, (vh - rect.top) / (vh + rect.height)))
        const op    = entry < 0.3 ? entry / 0.3 : entry > 0.85 ? (1 - (entry - 0.85) / 0.15) : 1
        const ty    = entry < 0.3 ? (1 - entry / 0.3) * 40 : 0
        el.style.opacity   = op
        el.style.transform = `translateY(${ty}px)`
      })
      raf = requestAnimationFrame(update)
    }
    raf = requestAnimationFrame(update)
    return () => cancelAnimationFrame(raf)
  }
  return () => {}
}

/* ── useReducedMotion ── */
export function useReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined"
      ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
      : false
  )
  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)")
    const handler = e => setReduced(e.matches)
    mq.addEventListener("change", handler)
    return () => mq.removeEventListener("change", handler)
  }, [])
  return reduced
}

/* ── useScrollY ── */
export function useScrollY() {
  const [y, setY] = useState(0)
  useEffect(() => {
    const handler = () => setY(window.scrollY)
    window.addEventListener("scroll", handler, { passive: true })
    return () => window.removeEventListener("scroll", handler)
  }, [])
  return y
}
