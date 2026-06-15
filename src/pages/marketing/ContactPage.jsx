import { useState, useEffect } from "react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"

const BRANCHES = [
  "Loodgieter", "Schilder", "Elektricien", "Aannemer", "Installateur",
  "Transporteur", "Tuinman", "Schoonmaakbedrijf", "Anders",
]
const ONDERWERPEN = [
  "Algemene vraag", "Demo aanvragen", "Technisch probleem", "Factuur / abonnement", "Partnership", "Anders",
]

function validate(form) {
  const errors = {}
  if (!form.naam.trim())       errors.naam = "Naam is verplicht"
  if (!form.email.trim())      errors.email = "E-mailadres is verplicht"
  else if (!/\S+@\S+\.\S+/.test(form.email)) errors.email = "Ongeldig e-mailadres"
  if (!form.bericht.trim())    errors.bericht = "Bericht is verplicht"
  return errors
}

function Field({ label, name, req, error, children }) {
  return (
    <div className="form-field">
      <label>{label}{req && <span className="req"> *</span>}</label>
      {children}
      {error && <p className="form-error">{error}</p>}
    </div>
  )
}

const FAQ_PREVIEW = [
  { q: "Is BossBase gratis te proberen?", a: "Ja, 14 dagen gratis. Geen creditcard nodig." },
  { q: "Kan ik importeren vanuit Excel?", a: "Ja, je kunt klanten en contacten importeren via CSV." },
  { q: "Werkt BossBase op mijn telefoon?", a: "Ja, BossBase is volledig mobiel-vriendelijk." },
]

export default function ContactPage({ navigate }) {
  const [form, setForm] = useState({ naam: "", bedrijf: "", email: "", telefoon: "", branche: "", onderwerp: "", bericht: "" })
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const [faqOpen, setFaqOpen] = useState(null)

  useEffect(() => {
    const cleanup = initChoreo()
    return cleanup
  }, [])

  const set = (field, val) => setForm(f => ({ ...f, [field]: val }))

  const submit = e => {
    e.preventDefault()
    const errs = validate(form)
    if (Object.keys(errs).length) { setErrors(errs); return }
    setSent(true)
    setErrors({})
  }

  const go = (e, href) => {
    e.preventDefault()
    if (navigate) navigate(href)
    else window.location.href = href
  }

  return (
    <div className="bm">
      <ScrollLine />
      <Nav navigate={navigate} />
      <main>
        {/* Hero */}
        <section className="contact-hero">
          <div className="container">
            <Reveal>
              <span className="section-kicker">Contact</span>
              <h1>We helpen je graag verder</h1>
              <p>Vraag, opmerking of demo aanvragen? Stuur ons een bericht en we reageren binnen één werkdag.</p>
            </Reveal>
          </div>
        </section>

        {/* Grid: form + info */}
        <div className="section">
          <div className="container">
            <div className="contact-grid choreo-body">
              {/* Form */}
              <Reveal>
                <div className="contact-form-wrap">
                  <h2>Stuur een bericht</h2>
                  {sent ? (
                    <div className="contact-toast">
                      {I.checkCircle}
                      <span>Bericht ontvangen! We reageren binnen één werkdag.</span>
                    </div>
                  ) : (
                    <form onSubmit={submit} noValidate>
                      <div className="form-row-2">
                        <Field label="Naam" name="naam" req error={errors.naam}>
                          <input type="text" value={form.naam} onChange={e => set("naam", e.target.value)} placeholder="Jan Jansen" />
                        </Field>
                        <Field label="Bedrijfsnaam" name="bedrijf" error={errors.bedrijf}>
                          <input type="text" value={form.bedrijf} onChange={e => set("bedrijf", e.target.value)} placeholder="Jansen Schilderwerk" />
                        </Field>
                      </div>
                      <div className="form-row-2">
                        <Field label="E-mailadres" name="email" req error={errors.email}>
                          <input type="email" value={form.email} onChange={e => set("email", e.target.value)} placeholder="jan@jansen.nl" />
                        </Field>
                        <Field label="Telefoonnummer" name="telefoon" error={errors.telefoon}>
                          <input type="tel" value={form.telefoon} onChange={e => set("telefoon", e.target.value)} placeholder="06 12 34 56 78" />
                        </Field>
                      </div>
                      <div className="form-row-2">
                        <Field label="Branche" name="branche" error={errors.branche}>
                          <select value={form.branche} onChange={e => set("branche", e.target.value)}>
                            <option value="">Kies branche...</option>
                            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </Field>
                        <Field label="Onderwerp" name="onderwerp" error={errors.onderwerp}>
                          <select value={form.onderwerp} onChange={e => set("onderwerp", e.target.value)}>
                            <option value="">Kies onderwerp...</option>
                            {ONDERWERPEN.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </Field>
                      </div>
                      <Field label="Bericht" name="bericht" req error={errors.bericht}>
                        <textarea value={form.bericht} onChange={e => set("bericht", e.target.value)} placeholder="Vertel ons hoe we je kunnen helpen..." rows={5} />
                      </Field>
                      <button type="submit" className="btn btn-p glow contact-submit btn-lg">
                        Verstuur bericht {I.arrowRight}
                      </button>
                    </form>
                  )}
                </div>
              </Reveal>

              {/* Info */}
              <Reveal delay={80}>
                <div className="contact-info">
                  <div className="contact-info-block">
                    <div className="ci-icon">{I.mail}</div>
                    <div>
                      <div className="ci-title">E-mail</div>
                      <a href="mailto:hallo@bossbase.nl" className="ci-link">hallo@bossbase.nl</a>
                      <div className="ci-sub">Reactie binnen één werkdag</div>
                    </div>
                  </div>
                  <div className="contact-info-block">
                    <div className="ci-icon">{I.phone}</div>
                    <div>
                      <div className="ci-title">Telefoon</div>
                      <div className="ci-val">085 - 060 70 80</div>
                      <div className="ci-sub">Ma–Vr · 09:00 – 17:00</div>
                    </div>
                  </div>
                  <div className="contact-info-block">
                    <div className="ci-icon">{I.mapPin}</div>
                    <div>
                      <div className="ci-title">Adres</div>
                      <div className="ci-val">Herengracht 182</div>
                      <div className="ci-sub">1016 BR Amsterdam</div>
                    </div>
                  </div>
                  <div>
                    <div className="ci-title" style={{ marginBottom: 10 }}>Volg ons</div>
                    <div className="social-row">
                      <a href="https://linkedin.com" className="social-btn" target="_blank" rel="noopener noreferrer">
                        {I.linkedIn} LinkedIn
                      </a>
                      <a href="https://instagram.com" className="social-btn" target="_blank" rel="noopener noreferrer">
                        {I.instagram} Instagram
                      </a>
                    </div>
                  </div>
                  <div className="map-placeholder">
                    {I.mapPin}
                    <div style={{ fontWeight: 600, color: "var(--dk)" }}>Amsterdam, Nederland</div>
                    <div style={{ fontSize: 13, color: "var(--dmu)" }}>Herengracht 182 · 1016 BR</div>
                  </div>
                </div>
              </Reveal>
            </div>
          </div>
        </div>

        {/* Snelle antwoorden */}
        <div className="section" style={{ background: "var(--bgs)" }}>
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Snelle antwoorden</span>
              <h2>Veelgestelde vragen</h2>
              <p>Misschien staat jouw vraag er al bij.</p>
            </div></Reveal>
            <div className="faq-list choreo-body contact-faq-wrap">
              {FAQ_PREVIEW.map((item, i) => (
                <div key={i} className="faq-item" data-open={faqOpen === i ? "true" : "false"}>
                  <button className="faq-q" onClick={() => setFaqOpen(faqOpen === i ? null : i)}>
                    {item.q} {I.chevronDown}
                  </button>
                  <div className="faq-a"><div><p>{item.a}</p></div></div>
                </div>
              ))}
            </div>
            <p style={{ textAlign: "center", marginTop: 20 }}>
              <a href="/faq" style={{ color: "var(--pd)", fontWeight: 600 }}
                onClick={e => go(e, "/faq")}>
                Alle veelgestelde vragen →
              </a>
            </p>
          </div>
        </div>

        {/* Contact kaarten */}
        <div className="section">
          <div className="container">
            <Reveal><div className="section-head choreo-head">
              <span className="section-kicker">Direct contact</span>
              <h2>Kies de snelste weg</h2>
            </div></Reveal>
            <Reveal stagger>
              <div className="contact-cards choreo-body">
                {[
                  { icon: I.mail,     title: "E-mail",   desc: "hallo@bossbase.nl",  sub: "Reactie binnen 1 werkdag", href: "mailto:hallo@bossbase.nl" },
                  { icon: I.phone,    title: "Telefoon", desc: "085 - 060 70 80",    sub: "Ma–Vr 09:00–17:00",        href: "tel:+31850607080" },
                ].map(c => (
                  <a key={c.title} href={c.href} className="contact-card">
                    <div className="cc-icon">{c.icon}</div>
                    <h3>{c.title}</h3>
                    <p style={{ color: "var(--pd)", fontWeight: 600 }}>{c.desc}</p>
                    <p>{c.sub}</p>
                    <span className="cc-arrow">{I.arrowRight}</span>
                  </a>
                ))}
              </div>
            </Reveal>
          </div>
        </div>
      </main>
      <Footer navigate={navigate} />
    </div>
  )
}
