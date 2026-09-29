import { useState, useEffect, useRef } from "react"
import { Nav, Footer, Reveal, I, ScrollLine, initChoreo } from "./MktShared"
import { leesAanvraag, HONEYPOT_VELD, AANVRAAG_LIMIETEN } from "../../../supabase/functions/_shared/websiteAanvraag.ts"

// ── Waar het formulier naartoe gaat ─────────────────────────────────────────
// De Edge Function public-website-inquiry slaat de aanvraag op in
// public.inquiries bij het bedrijf van dit formulier; in het dashboard staat hij
// onder "Aanvragen". Zie supabase/functions/public-website-inquiry.
//
// Het formuliertoken (website_forms.public_token) is GEEN geheim: het zegt
// alleen wélk formulier dit is, en staat daarom gewoon in de website. Het
// bedrijf waar de aanvraag landt, bepaalt de server aan de hand van dit token;
// de browser stuurt nooit een company_id. VITE_BOSSBASE_FORM_TOKEN kan het
// overschrijven (bijvoorbeeld voor een ander formulier in een testomgeving).
const FORM_TOKEN = import.meta.env.VITE_BOSSBASE_FORM_TOKEN || "wf_43e9d08800d44b9d9ef13b64e33d9829332dfad5b56e4fb88438362db9d86330"
const ENDPOINT = `${import.meta.env.VITE_SUPABASE_URL || "https://mawzqpnsluljxpbarhng.supabase.co"}/functions/v1/public-website-inquiry`

// Er is nog geen gepubliceerde privacyverklaring. De bezoeker gaat akkoord met
// de privacytekst die hieronder bij het formulier staat; deze versie verwijst
// naar díe tekst. Verander hem als die tekst verandert. Komt er een
// privacyverklaring, verwijs daar dan naar en gebruik haar versiedatum.
const PRIVACY_VERSIE = "contactformulier-2026-09-29-v2"

const CONTACT_EMAIL = "info@bossbase.nl"

const BRANCHES = [
  "Installateur", "Loodgieter", "Elektricien", "Schilder", "Stukadoor",
  "Hovenier", "Aannemer", "Klusbedrijf", "Schoonmaakbedrijf", "Anders",
]
const ONDERWERPEN = [
  "Algemene vraag", "Proefperiode", "Technisch probleem", "Factuur / abonnement", "Anders",
]

const MELDINGEN = {
  validatie: "Controleer de gemarkeerde velden.",
  formulier_onbekend: `Het formulier is tijdelijk niet beschikbaar. Mail ons gerust op ${CONTACT_EMAIL}.`,
  herkomst_niet_toegestaan: `Het formulier is vanaf dit adres niet beschikbaar. Mail ons gerust op ${CONTACT_EMAIL}.`,
  te_veel_pogingen: `Je hebt het formulier net een paar keer verstuurd. Probeer het over een paar minuten opnieuw, of mail ons op ${CONTACT_EMAIL}.`,
  algemeen: `Versturen is niet gelukt. Controleer je internetverbinding en probeer het opnieuw, of mail ons op ${CONTACT_EMAIL}.`,
}

const LEEG = {
  naam: "", bedrijf: "", email: "", telefoon: "", branche: "", onderwerp: "", bericht: "",
  privacy: false, [HONEYPOT_VELD]: "",
}

// Formulierveld ↔ veld in de aanvraag, zodat de meldingen van het gedeelde
// validatieschema (en van de server) bij het juiste veld komen te staan.
const NAAR_AANVRAAG = {
  naam: "name", bedrijf: "company_name", email: "email", telefoon: "phone",
  branche: "branche", onderwerp: "subject", bericht: "message", privacy: "privacy_akkoord",
}
const VAN_AANVRAAG = Object.fromEntries(Object.entries(NAAR_AANVRAAG).map(([k, v]) => [v, k]))
const VOLGORDE = Object.keys(NAAR_AANVRAAG)

function nieuweId() {
  if (window.crypto?.randomUUID) return window.crypto.randomUUID()
  const b = window.crypto.getRandomValues(new Uint8Array(16))
  b[6] = (b[6] & 0x0f) | 0x40
  b[8] = (b[8] & 0x3f) | 0x80
  const h = Array.from(b, x => x.toString(16).padStart(2, "0")).join("")
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`
}

// Lokaal verstuurd = testaanvraag, herkenbaar aan het label "Test" in het
// dashboard. Pas bij het versturen bepaald: tijdens het vooraf renderen bestaat
// window niet.
function isTest() {
  return import.meta.env.DEV || ["localhost", "127.0.0.1"].includes(window.location.hostname)
}

function payloadVan(form, submissionId) {
  return {
    form_token: FORM_TOKEN,
    name: form.naam,
    company_name: form.bedrijf,
    email: form.email,
    phone: form.telefoon,
    subject: form.onderwerp,
    message: form.bericht,
    branche: form.branche,
    source_url: typeof window !== "undefined" ? window.location.href : null,
    is_test: typeof window !== "undefined" ? isTest() : false,
    privacy_akkoord: form.privacy,
    privacy_versie: PRIVACY_VERSIE,
    submission_id: submissionId,
    [HONEYPOT_VELD]: form[HONEYPOT_VELD],
  }
}

function naarFormulierFouten(fouten) {
  const errors = {}
  for (const [veld, melding] of Object.entries(fouten || {})) {
    if (VAN_AANVRAAG[veld]) errors[VAN_AANVRAAG[veld]] = melding
  }
  // De gedeelde validatie spreekt van een privacyverklaring; die is er nog niet.
  // Het vinkje bevestigt dat de bezoeker de uitleg hierboven heeft gezien; het is
  // geen toestemming als grondslag. De Edge Function eist het veld
  // privacy_akkoord nog; weghalen vraagt een wijziging in die functie.
  if (errors.privacy) errors.privacy = "Vink aan dat je hebt gelezen hoe we je gegevens gebruiken."
  return errors
}

function validate(form) {
  const r = leesAanvraag(payloadVan(form, null))
  const fouten = r.ok ? {} : { ...r.fouten }
  // Het token wordt door de server gecontroleerd; daar hoeft de bezoeker niets mee.
  delete fouten.form_token
  return naarFormulierFouten(fouten)
}

function Field({ label, id, req, error, children }) {
  return (
    <div className="form-field">
      <label htmlFor={id}>{label}{req && <span className="req" aria-hidden="true"> *</span>}</label>
      {children}
      {error && <p className="form-error" id={`${id}-fout`}>{error}</p>}
    </div>
  )
}

const FAQ_PREVIEW = [
  { q: "Is BossBase gratis te proberen?", a: "Ja, 14 dagen gratis met de functies van Groei. Je hoeft geen betaalgegevens in te vullen." },
  { q: "Kan ik importeren vanuit Excel?", a: "Nee, een importfunctie is er niet. Je voert klanten zelf in. Exporteren naar Excel of CSV kan wel." },
  { q: "Werkt BossBase op mijn telefoon?", a: "Het dashboard werkt op een tablet, laptop of computer (vanaf 768 pixels breed), niet op een smalle telefoon, en er is geen app. Klanten kunnen offertes en werkbonnen wel op hun telefoon ondertekenen." },
]

export default function ContactPage({ navigate }) {
  const [form, setForm] = useState(LEEG)
  const [errors, setErrors] = useState({})
  const [sent, setSent] = useState(false)
  const [bezig, setBezig] = useState(false)
  const [melding, setMelding] = useState("")
  const [faqOpen, setFaqOpen] = useState(null)
  // Eén id per inzending. Blijft gelijk bij een nieuwe poging na een fout, zodat
  // de server een dubbele inzending herkent; wordt pas na succes vernieuwd.
  const submissionId = useRef(null)
  // Synchroon slot tegen dubbel verzenden: state is pas een render later bij.
  const bezigRef = useRef(false)
  const bevestigingRef = useRef(null)

  useEffect(() => {
    const cleanup = initChoreo()
    return cleanup
  }, [])

  useEffect(() => {
    if (sent) bevestigingRef.current?.focus()
  }, [sent])

  const set = (field, val) => {
    setForm(f => ({ ...f, [field]: val }))
    if (errors[field]) setErrors(e => ({ ...e, [field]: undefined }))
  }

  const toonFouten = errs => {
    setErrors(errs)
    const eerste = VOLGORDE.find(k => errs[k])
    if (eerste) document.getElementById(`contact-${eerste}`)?.focus()
  }

  // Gemeenschappelijke props voor een veld, inclusief de koppeling tussen veld
  // en foutmelding voor schermlezers.
  const veld = naam => ({
    id: `contact-${naam}`,
    name: naam,
    value: form[naam],
    onChange: e => set(naam, e.target.value),
    "aria-invalid": errors[naam] ? true : undefined,
    "aria-describedby": errors[naam] ? `contact-${naam}-fout` : undefined,
  })

  const submit = async e => {
    e.preventDefault()
    if (bezigRef.current) return
    setMelding("")
    const errs = validate(form)
    if (Object.keys(errs).length) { toonFouten(errs); return }
    setErrors({})
    if (!submissionId.current) submissionId.current = nieuweId()

    bezigRef.current = true
    setBezig(true)
    try {
      const res = await fetch(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payloadVan(form, submissionId.current)),
      })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok === true) {
        // Pas na een bevestigde inzending leegmaken en een nieuwe id nemen.
        setForm(LEEG)
        submissionId.current = null
        setSent(true)
        return
      }
      if (data.fout === "validatie" && data.velden) {
        setMelding(MELDINGEN.validatie)
        toonFouten(naarFormulierFouten(data.velden))
        return
      }
      setMelding(MELDINGEN[data.fout] || MELDINGEN.algemeen)
    } catch {
      setMelding(MELDINGEN.algemeen)
    } finally {
      bezigRef.current = false
      setBezig(false)
    }
  }

  const go = (e, href) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return
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
            <span className="section-kicker">Contact</span>
            <h1>We helpen je graag verder</h1>
            <p>Vraag over BossBase, je proefperiode of je abonnement? Stuur een bericht of mail ons; we reageren op werkdagen.</p>
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
                    <div>
                      <div className="contact-toast" role="status" tabIndex={-1} ref={bevestigingRef}>
                        {I.checkCircle}
                        <span>Bedankt, je bericht is ontvangen. We reageren op werkdagen.</span>
                      </div>
                      <button type="button" className="contact-opnieuw" onClick={() => setSent(false)}>
                        Nog een bericht sturen
                      </button>
                    </div>
                  ) : (
                    <form onSubmit={submit} noValidate aria-busy={bezig}>
                      <div className="form-row-2">
                        <Field label="Naam" id="contact-naam" req error={errors.naam}>
                          <input type="text" {...veld("naam")} autoComplete="name" required
                            maxLength={AANVRAAG_LIMIETEN.name} placeholder="Jan Jansen" />
                        </Field>
                        <Field label="Bedrijfsnaam" id="contact-bedrijf" error={errors.bedrijf}>
                          <input type="text" {...veld("bedrijf")} autoComplete="organization"
                            maxLength={AANVRAAG_LIMIETEN.company_name} placeholder="Jansen Schilderwerk" />
                        </Field>
                      </div>
                      <div className="form-row-2">
                        <Field label="E-mailadres" id="contact-email" req error={errors.email}>
                          <input type="email" {...veld("email")} autoComplete="email" inputMode="email" required
                            maxLength={AANVRAAG_LIMIETEN.email} placeholder="jan@jansen.nl" />
                        </Field>
                        <Field label="Telefoonnummer" id="contact-telefoon" error={errors.telefoon}>
                          <input type="tel" {...veld("telefoon")} autoComplete="tel" inputMode="tel"
                            maxLength={AANVRAAG_LIMIETEN.phone} placeholder="06 12 34 56 78" />
                        </Field>
                      </div>
                      <div className="form-row-2">
                        <Field label="Branche" id="contact-branche" error={errors.branche}>
                          <select {...veld("branche")}>
                            <option value="">Kies branche...</option>
                            {BRANCHES.map(b => <option key={b} value={b}>{b}</option>)}
                          </select>
                        </Field>
                        <Field label="Onderwerp" id="contact-onderwerp" error={errors.onderwerp}>
                          <select {...veld("onderwerp")}>
                            <option value="">Kies onderwerp...</option>
                            {ONDERWERPEN.map(o => <option key={o} value={o}>{o}</option>)}
                          </select>
                        </Field>
                      </div>
                      <Field label="Bericht" id="contact-bericht" req error={errors.bericht}>
                        <textarea {...veld("bericht")} required maxLength={AANVRAAG_LIMIETEN.message}
                          placeholder="Vertel ons hoe we je kunnen helpen..." rows={5} />
                      </Field>

                      {/* Honeypot: onzichtbaar voor bezoekers en schermlezers, niet bereikbaar met Tab. */}
                      <div className="bb-sr-only" aria-hidden="true">
                        <label htmlFor="contact-hp">Laat dit veld leeg</label>
                        <input type="text" id="contact-hp" name={HONEYPOT_VELD} tabIndex={-1} autoComplete="off"
                          value={form[HONEYPOT_VELD]} onChange={e => set(HONEYPOT_VELD, e.target.value)} />
                      </div>

                      <p className="contact-privacy" id="contact-privacy-uitleg">
                        <strong>Wat we met je gegevens doen.</strong> Je naam, e-mailadres, bericht en wat je verder
                        invult (bedrijfsnaam, telefoonnummer, branche, onderwerp) slaan we op in het BossBase-systeem,
                        met het adres van deze pagina. We gebruiken ze alleen om op je bericht te reageren. Wil je
                        dat we ze verwijderen of wil je weten wat we van je hebben, mail dan
                        naar <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>. Om misbruik van het formulier te
                        beperken, telt de server inzendingen per IP-adres en e-mailadres; dat gebeurt met een gehashte
                        (niet leesbare) vorm van die gegevens.
                      </p>

                      <div className="form-check-wrap">
                        <label className="form-check" htmlFor="contact-privacy">
                          <input type="checkbox" id="contact-privacy" name="privacy" required
                            checked={form.privacy} onChange={e => set("privacy", e.target.checked)}
                            aria-invalid={errors.privacy ? true : undefined}
                            aria-describedby={errors.privacy ? "contact-privacy-uitleg contact-privacy-fout" : "contact-privacy-uitleg"} />
                          <span>
                            Ik heb gelezen hoe BossBase mijn gegevens gebruikt om op mijn bericht te reageren.
                            <span className="req" aria-hidden="true"> *</span>
                          </span>
                        </label>
                        {errors.privacy && <p className="form-error" id="contact-privacy-fout">{errors.privacy}</p>}
                      </div>

                      {melding && <div className="contact-alert" role="alert">{melding}</div>}

                      <button type="submit" className="btn btn-p glow contact-submit btn-lg" disabled={bezig}>
                        {bezig
                          ? <><span className="contact-spinner" aria-hidden="true" /> Versturen…</>
                          : <>Verstuur bericht {I.arrowRight}</>}
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
                      <a href={`mailto:${CONTACT_EMAIL}`} className="ci-link">{CONTACT_EMAIL}</a>
                      <div className="ci-sub">We reageren op werkdagen</div>
                    </div>
                  </div>
                  <div className="contact-info-block">
                    <div className="ci-icon">{I.sparkle}</div>
                    <div>
                      <div className="ci-title">Al klant?</div>
                      <div className="ci-val">Stel je vraag aan Boss</div>
                      <div className="ci-sub">De helpchat in het dashboard beantwoordt vragen over het gebruik.</div>
                    </div>
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
      </main>
      <Footer navigate={navigate} />
    </div>
  )
}
