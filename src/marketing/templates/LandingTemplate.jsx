// Sjabloon voor functie-, branche- en integratiepagina's. De inhoud komt uit
// src/content/{functies,branches,integraties}/*.md (zie de kop daarvan).
import { PaginaSchil, PaginaKop, Sectie, Kaarten, Stappen, Vragen, Beeld, SlotCta, Tekst } from './Onderdelen.jsx';

export default function LandingTemplate({ inhoud, navigate }) {
  const { meta, html, kruimels } = inhoud;
  return (
    <PaginaSchil navigate={navigate}>
      <PaginaKop
        kruimels={kruimels}
        kicker={meta.kicker}
        h1={meta.h1}
        lead={meta.lead}
        cta={meta.cta || { label: 'Start 14 dagen gratis', href: '/register' }}
        cta2={meta.cta2}
        noot={meta.noot}
      />

      {meta.beeld && (
        <section className="section" style={{ paddingTop: 8 }}>
          <div className="container"><Beeld beeld={meta.beeld} voorrang /></div>
        </section>
      )}

      {meta.punten?.length > 0 && (
        <Sectie titel={meta.puntenTitel} intro={meta.puntenIntro}>
          <Kaarten items={meta.punten} />
        </Sectie>
      )}

      {html && (
        <Sectie>
          <Tekst html={html} />
        </Sectie>
      )}

      {meta.stappen?.items?.length > 0 && (
        <Sectie titel={meta.stappen.titel} intro={meta.stappen.intro} grijs>
          <Stappen items={meta.stappen.items} />
        </Sectie>
      )}

      {meta.faq?.length > 0 && (
        <Sectie titel="Veelgestelde vragen">
          <Vragen items={meta.faq} />
        </Sectie>
      )}

      {meta.gerelateerd?.length > 0 && (
        <Sectie titel={meta.gerelateerdTitel || 'Verder lezen'} grijs>
          <Kaarten items={meta.gerelateerd} />
        </Sectie>
      )}

      <SlotCta
        titel={meta.slot?.titel || 'Probeer het met je eigen klussen'}
        tekst={meta.slot?.tekst || '14 dagen gratis, zonder betaalgegevens. Daarna kies je zelf of en welk abonnement je neemt.'}
        cta={meta.slot?.cta}
        cta2={meta.slot?.cta2 || { label: 'Bekijk prijzen', href: '/prijzen' }}
      />
    </PaginaSchil>
  );
}
