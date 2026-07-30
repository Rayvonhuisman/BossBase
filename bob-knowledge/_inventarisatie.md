# BossBase — Inventarisatie gebruikers-zichtbare functies

> Bron voor de kennisbank van **Bob** (de AI-helpagent). Dit document beschrijft
> per module wat een eindgebruiker in het **portaal** (web-dashboard) ziet en kan
> doen. Geen implementatiedetails, geen code.
>
> **Hoe te lezen:**
> - BossBase is een **web-based dashboard/portaal**, geen native app (wel mobiel-vriendelijk).
> - Het portaal zit onder `/dashboard/...`. Daarnaast is er een **openbare website**
>   (marketing + registratie/login) en een paar **klant-gerichte publieke links**
>   (offerte ondertekenen, teamuitnodiging).
> - De sectie **"Openstaande vragen voor Niels"** per module is het belangrijkst:
>   dat zijn dingen die niet met zekerheid uit de code af te leiden zijn en die je
>   zelf in het portaal moet controleren voordat Bob ze aan klanten uitlegt.
> - ⚠️ Onderaan staat een sectie **"Belangrijke onzekerheden & tegenstrijdigheden"**
>   met dingen die per se geverifieerd moeten worden.
> - 🔒 Het **Super-admin-portaal is INTERN** (alleen voor BossBase-eigenaren). Bob
>   mag hier **nooit** uitleg over geven aan klanten.

**Rollen & rechten (kort):**
- **Admin** = eigenaar/beheerder: ziet en mag alles.
- **Medewerker** = teamlid met granulaire rechten (per module aan/uit te zetten door de admin).
- Veel menu-items en knoppen zijn afhankelijk van rechten (`pipeline`, `offertes`,
  `facturen`, `kosten`, `financieel`, `planning`, `team`, `database`,
  `instellingen`, plus fijnmazige rechten zoals `klanten_bewerken`/`klanten_verwijderen`).
  De exacte lijst rechten moet Niels bevestigen (zie Team-module).

---

# DEEL 1 — HET PORTAAL (na inloggen, `/dashboard`)

## Dashboard (route: /dashboard)
**Wat de gebruiker hier kan:**
- Een persoonlijk startscherm zien met widgets (KPI's, lijstjes, grafieken) op basis van live bedrijfsdata.
- Het dashboard volledig zelf inrichten: widgets toevoegen, verwijderen, verslepen en van formaat wisselen.
- Een kant-en-klare layout kiezen (o.a. varianten voor standaard/sales/planning/financieel/medewerker).
- Snelle acties starten: nieuwe activiteit, nieuwe aanvraag (lead).

**Knoppen/acties op dit scherm:**
- **Nieuwe activiteit**: opent het activiteiten-formulier.
- **Nieuwe aanvraag**: opent formulier voor een nieuwe lead/deal.
- **Dashboard aanpassen**: schakelt de bewerk-modus in (werkbalk verschijnt).
- **Demo aan/uit**: toont statische demo-data i.p.v. echte data (waarschijnlijk alleen in test/dev — Niels checken).
- In bewerk-modus: **Layout kiezen**, **Blok toevoegen** (widget-galerij), **Reset**, **Annuleren**, **Opslaan**; per widget: omhoog/omlaag, formaat (Klein/Middel/Groot/Breed) en verwijderen; slepen om te herschikken.

**Beschikbare widgets (gebruiker kiest welke zichtbaar zijn):**
- KPI's: open pipeline-waarde, geaccepteerde waarde, aantal klanten, kosten per klus, kosten deze maand, te factureren, omzet deze maand (met trend), winst deze maand, activiteiten vandaag, taken te laat, uren deze week.
- Lijst-widgets: activiteiten vandaag, taken te laat, agenda vandaag/week, nieuwe aanvragen, actieve deals, open offertes, openstaande facturen, werkbonnen vandaag.
- Grafieken: omzet per maand, winst per maand, pipeline per fase, conversiefunnel, factuurstatus, kosten per klant, activiteiten per dag, uren per week, lead-bron.

**Openstaande vragen voor Niels:**
- Is "Demo aan" zichtbaar voor echte klanten of alleen in test?
- Welke widget-formaten worden per widget ondersteund (niet elke widget kan elk formaat)?
- "Te factureren"-widget: telt die alleen 100% afgeronde klussen of ook deels afgerond?

---

## Pipeline / CRM (route: /dashboard/pipeline)
**Wat de gebruiker hier kan:**
- Deals/leads bekijken op een kanban-bord (één kolom per pijplijnfase).
- Deals tussen fases verplaatsen (slepen op desktop; op mobiel via een "verplaats naar fase"-keuze).
- Nieuwe aanvraag/lead aanmaken (eventueel meteen in een specifieke fase).
- Een deal als "verloren" markeren (met reden).
- Filteren (fase, status, prioriteit) en zoeken; de "Verloren"-kolom tonen/verbergen.

**Knoppen/acties op dit scherm:**
- **Nieuwe aanvraag** (ook per kolom **Lead toevoegen**): opent het lead-formulier.
- **Filter**: toont filterpaneel (fase, status Open/Gewonnen/Afgerond/Verloren, prioriteit, zoeken).
- Deal-kaart aanklikken: opent (klant-)detail / verplaats-opties.
- **Markeer verloren**: opent reden-keuze (bijv. te duur, geen reactie, ander bedrijf) + toelichting.

**"Nieuwe aanvragen":** dit zijn de leads in de **eerste** pijplijnfase (nieuwe binnenkomende aanvragen). Er is geen aparte route hiervoor — ze verschijnen in Pipeline én als dashboard-widget.

**Formuliervelden (nieuwe lead):**
- Titel (tekst), Klant (keuze), Waarde (€), Fase (keuze, vaak voorge­selecteerd), Bron (tekst), Plaats (tekst).

**Openstaande vragen voor Niels:**
- Wordt de "verloren"-reden opgeslagen (voor rapportage) of is het alleen UI?
- Hoe/waar wordt "prioriteit" van een deal ingesteld?
- Zien medewerkers alle deals van het team, of alleen hun eigen (rechten/RLS)?

---

## Klanten (route: /dashboard/customers)
**Wat de gebruiker hier kan:**
- Alle klanten bekijken als kaarten (grid) of als tabel.
- Zoeken op naam/bedrijf.
- Een klant openen (opent de **Klantkaart** als zijpaneel).
- Nieuwe klant aanmaken; klant verwijderen (met bevestiging, mits het recht).

**Knoppen/acties op dit scherm:**
- **Kaarten / Tabel**: wissel weergave.
- **Nieuwe klant**: opent klant-formulier.
- Per klant: openen (pijl), verwijderen (prullenbak — afhankelijk van recht).

**Formuliervelden (nieuwe klant — beknopt):**
- Naam, bedrijf, e-mail, telefoon, adres, postcode, stad, KvK, BTW, IBAN, type (Particulier/Bedrijf/VvE/Aannemer), bron.

---

## Klantkaart (opent als paneel binnen /dashboard/customers — geen eigen URL)
**Wat de gebruiker hier kan:** alle informatie en acties rondom één klant, verdeeld over tabs. Bovenaan (met financieel-recht) 4 snelcijfers: Totaal geoffreerd, Betaald, Totale kosten, Winst. Volledig-scherm-knop aanwezig.

**Tabs/subpagina's:**
- **Overzicht**: snelcijfers + korte blokken (notities, activiteiten, offertes, facturen, projecten) met "+"-knoppen om nieuw aan te maken.
- **Notities**: notitie-editor met @-vermeldingen van teamleden; lijst van notities (met "laad meer").
- **Offertes** (recht `offertes`): lijst van offertes van deze klant; nieuwe offerte; een offerte openen.
- **Facturen** (recht `facturen`): lijst van facturen (nummer, datum·vervaldatum, status, bedrag); nieuwe factuur.
- **Kosten** (recht `kosten`): 3 cijfers (kosten, omzet, winst/marge) + kostenregels; kosten toevoegen.
- **Projecten**: lijst van projecten; nieuw project; project openen.
- **Tijdlijn**: chronologische feed van alle gebeurtenissen (klant aangemaakt, offerte verstuurd/geaccepteerd, factuur betaald, notitie, e-mail, enz.).
- **E-mails**: e-mail schrijven (template kiezen, onderwerp, tekst, "Aan"), versturen; lijst van verstuurde mails (uitklapbaar).
- **Klantgegevens**: alle klantvelden inline bewerken (naam, e-mail, telefoon, adres, postcode, stad, KvK, BTW, IBAN, type, bron) — bewerken afhankelijk van recht `klanten_bewerken`.

**Knoppen/acties:** sluiten, volledig scherm, en per tab "+ Nieuwe ..." (activiteit, offerte, factuur, project, kosten).

**Openstaande vragen voor Niels:**
- Zijn de financieel-snelcijfers verborgen voor medewerkers zonder financieel-recht?
- E-mails-tab: hebben oudere mails altijd een nette HTML-weergave?
- Toont de tijdlijn ook boekhoud-/Moneybird-sync-gebeurtenissen?

---

## Activiteiten (route: /dashboard/activities)
**Wat de gebruiker hier kan:**
- Alle activiteiten (bellen, e-mail, bezoek, taak, follow-up) bekijken, filteren en zoeken.
- Filteren op status (Alle/Open/Vandaag/Te laat/Afgerond), op medewerker en op datum.
- Weergave wisselen tussen datumgroepen (Te laat/Vandaag/Morgen/Deze week/Later/Afgerond) en platte lijst.
- Nieuwe activiteit aanmaken, een activiteit openen/bewerken, en met één klik als gereed markeren.

**Knoppen/acties op dit scherm:**
- **Nieuwe activiteit**; statusfilter-tabs; datumkiezer + **datum wissen**; medewerker-filter; zoeken; **datumgroepen/lijst**-toggle; vinkje per rij = markeer gereed; rij aanklikken = bewerken.

**Formuliervelden (activiteit):** titel, klant, type (bellen/e-mail/bezoek/taak/follow-up), datum, starttijd, (eindtijd), status, notities. (Mogelijk ook toegewezen medewerkers/voertuig/locatie/deal — Niels bevestigen.)

**Openstaande vragen voor Niels:**
- Kun je in de activiteit-bewerkmodal een deal koppelen/aanmaken?
- Kun je een activiteit via de UI verwijderen?
- Precieze regel voor "Te laat" (vervaldatum < vandaag én niet afgerond?).

---

## Agenda (route: /dashboard/calendar)
**Wat de gebruiker hier kan:**
- Agenda bekijken in **Dag / Week / Maand**.
- Navigeren (vorige/volgende, "Vandaag").
- Handmatig een agenda-item toevoegen.
- Een agenda-item openen (detailpaneel) om te bewerken/verwijderen.
- Werkbonnen verschijnen automatisch als (niet direct bewerkbare) agenda-items; klik erop springt naar de werkbon.
- Activiteiten verschijnen automatisch (alleen jouw open/toegewezen activiteiten).

**Knoppen/acties:** Dag/Week/Maand-tabs; ← Vandaag →; **Toevoegen**; item aanklikken → **Bewerken**/**Verwijderen**/**Sluiten**.

**Formuliervelden (agenda-item):** titel, type (afspraak/klus/activiteit/opname), klant, datum, start, (einde), notities.

**Openstaande vragen voor Niels:**
- Zien medewerkers alleen hun eigen agenda + werkbonnen, of alles?
- "Google Agenda koppelen" lijkt in de code uitgezet — is dat bewust (nog niet live)?

---

## Planning (route: /dashboard/planning) — *rechten: `planning` (lijkt admin/planner-gericht)*
**Wat de gebruiker hier kan:**
- Weekplanning (ma–zo) van werkbonnen en activiteiten bekijken.
- Wisselen tussen **Totaal** (iedereen), **Per medewerker** en **Per voertuig**.
- Niet-ingeplande werkbonnen naar een dag/uur slepen (drag-and-drop).
- Een werkbon inplannen of een activiteit inplannen via een modal.

**Knoppen/acties:** week-navigatie (← Deze week →); weergave-keuze (Totaal/Medewerker/Voertuig) + keuzelijst; **Werkbon inplannen**; **Activiteit inplannen**; inklapbaar paneel "Niet ingepland"; blok aanklikken = detail/bewerken.

**Formuliervelden (werkbon inplannen):** titel, klant, project, datum, starttijd, eindtijd, medewerkers (multi), voertuig, locatie, omschrijving.
**Formuliervelden (activiteit inplannen):** titel, type, klant, datum, start, (eind), medewerkers, voertuig, locatie, notities, eventueel werkbon koppelen/aanmaken.

**Openstaande vragen voor Niels:**
- Is Planning echt alleen voor admins/planners, of ook gewone medewerkers met het recht?
- Verwijder je een activiteit in Planning ook uit de Agenda?
- Krijgen toegewezen medewerkers een melding (in-app/e-mail/beide)?

---

## Projecten (route: /dashboard/projecten)
**Wat de gebruiker hier kan (lijst):**
- Projecten bekijken (tabel op desktop, kaarten op mobiel).
- Filteren op status (Concept/Lopend/Wachten op klant/Te factureren/Afgerond) en op facturatie (nog te factureren / al gefactureerd).
- Zoeken (projectnaam, klant, deal, offertenummer, omschrijving).
- KPI's zien: actieve projecten, totale projectwaarde, te factureren, gewerkte uren.
- Nieuw project aanmaken; project openen (detailpaneel).

**Project-detail (paneel met tabs):**
- **Overzicht**: projectcontrole (uren gebruikt/begroot, budget, gefactureerd, deadline) + bewerkbare projectgegevens.
- **Offertes**: offerte koppelen of nieuwe maken; offerte openen; "factuur maken".
- **Facturen**: gekoppelde facturen (zie open vraag).
- **Uren**: geregistreerde uren t.o.v. begroting; handmatig uren toevoegen/verwijderen.
- **Kosten**: kostenregels van het project; toevoegen/verwijderen.
- **Werkbonnen**: gekoppelde werkbonnen.
- **Notities**: editor met @-vermeldingen.
- Volledig-scherm-toggle; "Open klant".

**Formuliervelden (nieuw project):** projectnaam, klant, status, deal, offerte (vult waarde/uren voor), projectwaarde (incl. BTW), begrote uren, startdatum, deadline, toegewezen medewerker, omschrijving.

**Openstaande vragen voor Niels:**
- Wat doet "Facturen"-tab precies (lijst? knop naar factuur-wizard?) en hoe werkt "Factuur maken" vanuit een project?
- Wie mag projecten bewerken/verwijderen? Is er een verwijder-knop in de UI?
- Toont de Werkbonnen-tab álle werkbonnen van het project?

---

## Werkbonnen (route: /dashboard/werkbonnen)
**Wat de gebruiker hier kan (lijst):**
- Alle werkbonnen als kaarten bekijken; filteren op status (Alle/Gepland/In uitvoering/Afgerond); zoeken (titel/klant/locatie).
- Nieuwe werkbon aanmaken; werkbon openen (detail).

**Werkbon-detail (alles op één scrollbare pagina):**
- Basisinfo bewerken (titel, status, datum, tijden, klant, project, locatie, omschrijving, interne notities, toegewezen medewerker).
- Snelknoppen: **Bel klant**, **Route** (Google Maps), **Start klus / Afronden** (status doorschakelen).
- **Taken/checklist**: toevoegen, afvinken, verwijderen.
- **Materialen**: toevoegen (naam, eenheid, aantal, prijs/stuk, BTW%), subtotalen excl./incl.
- **Uren**: geboekte uren zien en snel boeken (naar urenregistratie).
- **Foto's**: uploaden per categorie (Voor/Tijdens/Na), verwijderen.
- **Meerwerk**: toevoegen (omschrijving, prijs), "klant akkoord gevraagd", totaal.
- **Notities uitvoerder**: rich-text met @-vermeldingen.

**Formuliervelden (nieuwe/bewerk werkbon):** status (bij bewerken), titel, klant, project, locatie, datum, start-/eindtijd, omschrijving, interne notities, toegewezen medewerker.

**Openstaande vragen voor Niels:**
- Wordt meerwerk automatisch op een factuur gezet of moet dat handmatig?
- Zet "Afronden" automatisch een afrond-datum? Sturen @-vermeldingen meldingen?
- Kunnen foto's bewerkt (draaien/bijsnijden) worden of alleen geüpload?

---

## Uren (route: /dashboard/uren)
**Wat de gebruiker hier kan:**
- Urenregistraties bekijken (arbeid en reiskosten), filteren op periode (Alles/Vandaag/Deze week/Deze maand) en op medewerker.
- KPI's: totaal uren, aantal medewerkers, gemiddelde per dag.
- Uren registreren, bewerken en verwijderen. (Desktop: tabel; mobiel: kaarten + snelknop.)

**Knoppen/acties:** **Uren registreren**; periode-tabs; medewerker-filter; per rij bewerken/verwijderen.

**Formuliervelden (uren):** datum, type (Arbeid/Reiskosten/Overig), starttijd, eindtijd (live-berekening van uren), werkbon, project, klant, notitie.

**Openstaande vragen voor Niels:**
- Vult het kiezen van een werkbon automatisch klant+project in?
- Kan een medewerker uren op naam van iemand anders boeken, of alleen op zichzelf?

---

## Offertes (route: /dashboard/offertes) — *recht: `offertes`*
**Wat de gebruiker hier kan:**
- Offertes maken, bewerken, verwijderen; filteren op status (Concept/Verzonden/Geaccepteerd/Afgewezen); zoeken (nummer/omschrijving/klant).
- Regelitems toevoegen met type **Uren / Km / Overig** of een **eigen eenheid** (uit Instellingen); BTW per regel (21%/9%/anders).
- Offerte per e-mail versturen (met ondertekeningslink); PDF bekijken/downloaden.
- Geaccepteerde offerte omzetten naar factuur ("Maak factuur").
- Statistieken bovenaan: totaal, concept, verzonden, geaccepteerd (aantal + bedrag).

**Knoppen/acties:** **Nieuwe offerte**; per offerte: Bekijken, Bewerken, **Verstuur per mail**, Download/Preview PDF, **Maak factuur** (bij geaccepteerd), Verwijderen.

**Formuliervelden (offerte):** klant (verplicht), project (optioneel), omschrijving, regelitems (type, omschrijving, hoeveelheid, prijs, BTW, bedrag), geldig tot, notities, status. Totalen (subtotaal/BTW/totaal) worden berekend.

**Openstaande vragen voor Niels:**
- Kan een verstuurde offerte nog inhoudelijk gewijzigd worden of ligt die vast?
- Bij "Maak factuur": mag de gebruiker de overgenomen regels nog aanpassen?
- Bestaan er meer statussen dan deze vier (bijv. "ondertekend")?

---

## Facturen (route: /dashboard/facturen) — *recht: `facturen`*
**Wat de gebruiker hier kan:**
- Facturen maken, bewerken, verwijderen; filteren op status (Aangemaakt/Verzonden/Betaald/Verlopen/Gecrediteerd); zoeken (nummer/klant).
- Regelitems zoals bij offertes (Uren/Km/Overig/eigen eenheden, BTW per regel).
- Factuur per e-mail versturen (optioneel met PDF-bijlage); PDF bekijken/downloaden.
- Betaalherinneringen sturen (1e en 2e, alleen bij verlopen); als betaald markeren.
- Crediteren (volledig of gedeeltelijk → creditfactuur).
- Statistieken: totaal, openstaand (bedrag), betaald deze maand, verlopen (aantal).

**Knoppen/acties:** **Nieuwe factuur**; per factuur: Bekijken, Bewerken, **Verstuur per mail**, **Herinnering 1/2 sturen**, **Crediteer factuur**, Download/Preview PDF, Verwijderen.

**Formuliervelden (factuur):** klant (verplicht; adres/plaats/e-mail moeten compleet zijn), project, factuurdatum, vervaldatum, regelitems, betalingskenmerk (automatisch), status, notities/betalingsinstructies.

**Openstaande vragen voor Niels:**
- Wordt "verlopen" automatisch bepaald op basis van de vervaldatum?
- Bij crediteren: wordt de originele factuur op "gecrediteerd" gezet of verwijderd?
- Kan de betaaldatum achteraf handmatig worden gezet?

---

## Kosten (route: /dashboard/costs) — *recht: `kosten`*
**Wat de gebruiker hier kan:**
- Kostenregels toevoegen (bedrag excl. BTW, datum, BTW%, leverancier/omschrijving, categorie).
- Kosten koppelen aan klant, project en/of werkbon (afhankelijke keuzelijsten).
- Filteren op klant en categorie; kostenregels bewerken/verwijderen.
- Via Moneybird geïmporteerde kosten herkennen (badge) en bijlagen bekijken.
- Cijfers bovenaan: totale kosten, materiaalkosten, arbeidskosten, reiskosten (gefilterd).

**Knoppen/acties:** **Kosten toevoegen**; regel aanklikken = detail bewerken; bijlage bekijken; verwijderen.

**Formuliervelden (kosten):** bedrag (excl. BTW), datum, BTW (0/9/21/anders), leverancier/omschrijving, categorie (Materiaal/Arbeid/Reiskosten/Inkoopfactuur/Algemene kosten/Overig), klant, project, werkbon.

**Openstaande vragen voor Niels:**
- Kun je Moneybird-geïmporteerde kosten in BossBase nog aanpassen?
- Kun je een bijlage via het formulier uploaden, of alleen bekijken?
- Zijn er standaard-BTW-waarden per categorie?

---

## Financiën (route: /dashboard/revenue) — *recht: `financieel`*
**Wat de gebruiker hier kan:**
- Financieel overzicht met KPI's per gekozen periode (deze maand / vorige maand / dit jaar / vorig jaar / aangepast).
- Omzetgrafiek met keuze Gefactureerd/Ontvangen/Kosten en periode Week/Maand/Kwartaal/Jaar.
- Financiële data per klant (geoffreerd, kosten, betaald, openstaand, nettoresultaat, marge).
- BTW-overzicht — **alleen zichtbaar bij een actieve Moneybird-koppeling** (BTW ontvangen/betaald per tarief, saldo, sync-knop).
- Exporteren naar CSV.

**Knoppen/acties:** periodekiezer; grafiek-tabs (Week/Maand/Kwartaal/Jaar en Gefactureerd/Ontvangen/Kosten); **Exporteren** (CSV); (met Moneybird) BTW kwartaal/maand-switch, periodekeuze en **Synchroniseer BTW**.

**Openstaande vragen voor Niels:**
- Exacte definities: hoe wordt "Openstaand" en "Omzet" berekend, en tellen creditfacturen mee/af?
- Is de BTW-sync handmatig (knop) of ook automatisch?

---

## Database (route: /dashboard/database) — *recht: `database`*
**Wat de gebruiker hier kan:** een uitgebreide **klantendatabase** met krachtige filters, bulk-acties en export. (Het is dus géén technische database-import/-export van buitenaf, maar een geavanceerd klantoverzicht.)
- Klanten doorzoeken en filteren op veel criteria (klantgegevens, projecten, offertes, facturen, pipeline, communicatie, uren, documenten).
- Filtersets opslaan als **segmenten** (herbruikbaar).
- Klanten selecteren en **bulk-acties** doen: mailen, exporteren (Excel/CSV), en PDF's downloaden (offertes/facturen/creditfacturen/getekende offertes/alles als ZIP).
- Klantgegevens bewerken, mailen of verwijderen per rij.

**Knoppen/acties:** **Segment opslaan**; snelfilters (status, stad, projectstatus, laatste contact, boekhoud-sync); geavanceerde filtersidebar; **Wis filters**; per rij: bewerken/mailen/meer; bulkbalk onderaan met **Acties ▼** (mailen, Excel, CSV, segment, PDF-downloads).

**Formuliervelden:** vooral filtervelden (data, bedragen, statussen, checkboxes) + de bulk-mailmodal (template, onderwerp, bericht, ontvangerslijst).

**Openstaande vragen voor Niels:**
- Voor wie is Database bedoeld/zichtbaar (alleen admins/marketing, of iedereen met het recht)?
- Segmenten lijken lokaal in de browser opgeslagen — is dat de bedoeling (niet gedeeld/gesynchroniseerd)?
- Wat is het verschil tussen "Kosten importeren" en "Contacten synchroniseren" (boekhoudkoppeling)?

---

## Team (route: /dashboard/team) — *recht: `team`*
**Wat de gebruiker hier kan:**
- Alle teamleden (actief + uitgenodigd) zien met status en rol.
- Nieuwe teamleden uitnodigen per e-mail.
- Teamlid-gegevens bewerken (naam, telefoon, uren/week, foto) en rol instellen (Medewerker/Admin).
- Rechten per medewerker beheren (checkboxes per categorie; "alles aan"/"alles uit").
- Medewerkers deactiveren/reactiveren en verwijderen. (Je kunt jezelf niet deactiveren/verwijderen.)
- Cijfers: totaal, actief, uitgenodigd.

**Knoppen/acties:** **Teamlid uitnodigen**; per lid: Bewerken, **Rechten**, Deactiveren/Activeren, Verwijderen.

**Formuliervelden:**
- *Uitnodigen:* e-mail (verplicht), naam, telefoon, rol, uren/week.
- *Bewerken:* foto, naam, telefoon, rol, uren/week.
- *Rechten:* checkboxes per categorie (+ alles aan/uit).

**Openstaande vragen voor Niels:**
- **Wat is de exacte lijst van rechten** (labels + categorieën)? Dit staat in de config en moet Bob precies weten. → jij bevestigen.
- Kan een medewerker zijn eigen gegevens wijzigen, of alleen een admin?

---

## Instellingen (route: /dashboard/instellingen)
Eén pagina met tabs. **Iedereen** kan de tab **Mijn profiel**; de overige (bedrijfs)tabs zijn voor admins of medewerkers met het recht `instellingen` (tab **Voertuigen** is alleen admin).

### Profiel — "Mijn profiel" (onderdeel van /dashboard/instellingen)
**Wat de gebruiker hier kan:** profielfoto uploaden/verwijderen, naam wijzigen, wachtwoord wijzigen, cookievoorkeuren aanpassen, en **account verwijderen** (Gevarenzone onderaan).
- **Account verwijderen** verschilt per rol:
  - **Admin** → "Bedrijf opzeggen": het hele bedrijf wordt opgezegd, alle teamleden verliezen toegang.
  - **Medewerker** → alleen het eigen account.
  - Bevestiging vereist het typen van **VERWIJDEREN**. Databewaarbeleid wordt getoond: account wordt gedeactiveerd + uitgelogd; gegevens 2 jaar bewaard (terugkeer mogelijk), financiële administratie wettelijk 7 jaar.
**Velden:** foto, naam, e-mail (alleen-lezen), rol (alleen-lezen); wachtwoord: huidig/nieuw/herhaal.

### Bedrijfsprofiel (admins)
Logo, merkkleur, bedrijfsnaam, e-mail, antwoord-e-mail (reply-to), telefoon, KvK, BTW, website, adres, postcode, stad. → **Opslaan**.

### Standaardwaarden (admins)
- Uurtarief (€/uur), Reiskosten (€/km), BTW (%), Offerte geldig (dagen). → **Opslaan**.
- **Eigen prijzen / eenheden**: eigen regeltypes aanmaken (naam, standaardprijs, eenheid-label, optioneel eigen BTW) → verschijnen in offerte/factuur-regelkeuze naast Uren/Km/Overig. Bewerken/verwijderen mogelijk.

### E-mailtemplates (admins)
- Standaardtemplates bewerken en eigen templates maken; activeren/deactiveren; automatisch verzenden instellen (bijv. herinneringen/afspraken, "verzenden X dagen na/voor"); variabelen ({{klant_naam}} enz.) invoegen; template resetten.
- Standaardtemplates (o.a.): offerte, offerte geaccepteerd, factuur, herinnering 1, herinnering 2, aanvraag ontvangen, welkom, afspraak bevestiging, afspraak herinnering. (Exacte set: Niels bevestigen.)

### Pipeline (admins)
Pijplijnfases beheren: nieuwe fase (naam + kleur), bewerken, verwijderen, volgorde.

### Voertuigen (alleen admin)
Bedrijfsvoertuigen beheren (naam, kenteken, kleur, status actief/inactief) — voor de planning.

### Integraties (admins)
- **Moneybird**: API-token + administratie-ID; verbinding testen, opslaan, **Kosten importeren**, **Contacten synchroniseren**; sync-tijdstip.
- **SnelStart**: abonnementssleutel + maatwerksleutel + administratie-ID; zelfde acties.
- **Google Agenda** en **AFAS**: aanwezig in de code maar lijken (nog) verborgen/uitgezet — Niels bevestigen of dit live is.

**Openstaande vragen voor Niels (Instellingen):**
- Welke e-mailtemplates zijn er precies en welke worden automatisch verstuurd?
- Zijn Google Agenda en AFAS bewust nog niet zichtbaar voor klanten?
- Klopt de rechten-scheiding (medewerker met `instellingen`-recht ziet alle bedrijfstabs behalve Voertuigen)?

---

# DEEL 2 — KLANT-GERICHTE PUBLIEKE LINKS (geen login)

## Offerte digitaal ondertekenen (route: /offerte/:token)
**Wat de klant (ontvanger) hier kan:** de offerte bekijken, als PDF downloaden, en digitaal ondertekenen.
- Zichtbaar: logo, offertenummer, datum, geldig tot, klantgegevens, offerteregels, totaal incl. BTW, omschrijving.
- **Ondertekenen:** naam + e-mail (voorge­vuld) en een handtekening tekenen op een tekenveld ("Wissen" om opnieuw). Knop **Akkoord en ondertekenen**.
- Na ondertekening: bevestiging op scherm + bevestigingsmail naar klant (met getekende PDF) en naar het bedrijf; tijdlijn-entry in het portaal.

**Openstaande vragen voor Niels:**
- Werkt het handtekening-tekenveld goed op alle telefoons/tablets?
- Wat gebeurt er als PDF-genereren faalt — wordt de offerte dan toch als ondertekend gemarkeerd?

## Teamlid-uitnodiging accepteren (route: /uitnodiging/:token)
**Wat de genodigde hier kan:** de uitnodiging accepteren en meteen een account aanmaken (e-mail voorge­vuld, naam + wachtwoord invullen). Link is 48 uur geldig en eenmalig. Na aanmaken: automatisch ingelogd → dashboard. Duidelijke meldingen bij verlopen/ongeldige link.

---

# DEEL 3 — INLOGGEN, REGISTREREN & WACHTWOORD

## Inloggen (route: /login)
**Wat de gebruiker hier kan:** inloggen (e-mail + wachtwoord); "Wachtwoord vergeten?"; verificatiemail opnieuw sturen (als e-mail nog niet bevestigd); naar registreren.
**Velden:** e-mailadres, wachtwoord. Nette foutmeldingen + waarschuwing bij niet-bevestigde e-mail.

## Registreren (route: /register, link "/registreer") — meerstaps-flow
Lineaire flow in 4 stappen:
1. **Account**: naam, e-mail, wachtwoord (+ sterkte-indicator), herhaal wachtwoord.
2. **Bedrijf**: bedrijfsnaam (verplicht), branche (pictogram-keuze), telefoon, KvK.
3. **Setup**: "Ik werk alleen (zzp)" of "Ik werk met een team".
4. **Teamleden uitnodigen** (optioneel): naam + e-mail + rol per medewerker; "Overslaan, later doen".
Daarna: e-mailverificatie (6-cijferige code) óf e-mailbevestiging via link, óf direct naar het dashboard.

## E-mailverificatie (onderdeel van login/registratie)
6-cijferige code invoeren; **Verifiëren**; **Code opnieuw versturen** (met 60s-teller). Meldingen bij onjuist/verlopen/te veel pogingen.

## Wachtwoord vergeten / opnieuw instellen (route: /reset-password?token=)
- Stap 1: e-mailadres → **Stuur resetlink** → "check je e-mail".
- Stap 2 (via link): nieuw wachtwoord + herhaal → **Stel wachtwoord in**. Link is tijdgebonden en eenmalig; nette meldingen bij verlopen/gebruikt/ongeldig.

**Openstaande vragen voor Niels:**
- Wanneer krijgt iemand een 6-cijferige code vs. een verificatielink? (twee verschillende paden in de code)
- Worden de team-uitnodigingen uit registratie-stap 4 meteen verstuurd of pas na livegang?

---

# DEEL 4 — OPENBARE MARKETINGWEBSITE (vóór inloggen)

Dit zijn informatiepagina's (geen portaal-functies). Kort samengevat:

## Home (route: /)
Landingspagina met hero, "herkenbaar? chaos → BossBase", 5 kernfuncties (CRM/pipeline, offertes & ondertekenen, planning & uitvoering, uren/materialen/omzet, team & rollen), ingebouwde mini-demo, branches, prijzen-samenvatting, testimonials, FAQ-samenvatting. CTA's: **Start (14 dagen) gratis**, **Bekijk demo**, **Plan een gesprek**, **Bekijk prijzen**.

## Functies (route: /functies)
Gedetailleerde uitleg per functieblok, "zonder vs. met BossBase"-vergelijking, en een integraties-grid (o.a. Google Calendar, Outlook, Exact Online, Mollie, Slack, Zapier, Moneybird, WhatsApp — sommige "binnenkort").

## Prijzen (route: /prijzen)
Prijskaarten (maandelijks/jaarlijks-toggle), uitgebreide vergelijkingstabel en FAQ. ⚠️ Zie tegenstrijdigheid over prijzen/plannaam hieronder.

## Voor wie (route: /voor-wie)
ZZP vs. bedrijf, plus branche-specifieke blokken (pijnpunten → oplossingen) voor o.a. loodgieter, schilder, elektricien, aannemer, installateur, hovenier, schoonmaak.

## Over ons (route: /over-ons, ook /over)
Verhaal, team/oprichters, missie, statistieken, waarden. ⚠️ Bevat concrete claims (aantallen gebruikers, bedrag aan offertes, adres, telefoon) — mogelijk marketing/placeholder; Bob niet als harde feiten laten presenteren.

## Contact (route: /contact)
Contactformulier (naam, bedrijf, e-mail, telefoon, branche, onderwerp, bericht) + contactgegevens + korte FAQ.

## FAQ (route: /faq)
Doorzoekbare FAQ met categorie-filters (Algemeen, Abonnement & betaling, Functies, Technisch, Privacy & veiligheid).

## Demo (route: /demo)
Interactieve, alleen-lezen demo met voorbeelddata: schermen Dashboard, Pipeline, Offertes, Agenda, Klanten, Omzet. Alles toont "Dit is een demo".

## Cookieverklaring (route: /cookieverklaring)
Placeholder ("Cookieverklaring volgt binnenkort").

**Openstaande vragen voor Niels (marketing):**
- Zijn de cijfers/claims op "Over ons" en de prijzen definitief, of placeholder?
- Welke integraties zijn écht live vs. "binnenkort"? (marketing zegt meer dan het portaal nu doet)

---

# DEEL 5 — 🔒 SUPER-ADMIN PORTAAL (INTERN — NIET VOOR KLANTEN)

## Super-admin (route: /superadmin) — **INTERN**
> ⚠️ **Bob mag hier NOOIT uitleg over geven aan klanten.** Alleen toegankelijk voor
> BossBase-eigenaren (super-admin + e-mail op de toegestane lijst).

Hiermee beheren de BossBase-eigenaren álle bedrijven op het platform: overzicht + statistieken (aantal bedrijven, actief, trial, MRR), bedrijven-tabel, en per bedrijf een detailpaneel met bedrijfsgegevens, abonnement, teamleden, statistieken en interne notities. Acties: plan wijzigen, status/blokkade wijzigen, mail sturen.

**Openstaande vragen voor Niels:**
- Welke bevestigingen/veiligheidschecks zitten er vóór het blokkeren van een bedrijf?

---

# ⚠️ BELANGRIJKE ONZEKERHEDEN & TEGENSTRIJDIGHEDEN (per se checken)

1. **Facturen: twee verschillende beelden in de code.**
   - De volwaardige **Facturen-module** (`/dashboard/facturen`) is echt: aparte facturen met regelitems, versturen, herinneringen, crediteren, betaald markeren, PDF.
   - Maar de **factuur-detail-drawer op het dashboard** (geopend via de widget "Openstaande facturen") toont een tekst in de trant van *"Bron: geaccepteerde offerte — er is nog geen aparte facturenmodule"* en is alleen-lezen. Dat lijkt **verouderde/legacy** code die niet klopt met de echte module.
   → **Actie:** controleer of die drawer-tekst weg/aangepast moet, zodat Bob geen tegenstrijdige uitleg geeft.

2. **Prijzen & plannamen verschillen tussen pagina's.**
   - Home noemt **Starter €29 / Vakman €39 / Onderneming €59**.
   - Prijzen-pagina noemt **Starter €19 / Groei €39 / Team €79** (met jaar-korting).
   → **Actie:** bepaal de juiste, actuele prijzen/plannamen; Bob moet één consistente lijst hebben.

3. **Integraties: marketing belooft meer dan het portaal nu doet.**
   - Live in het portaal: Moneybird en SnelStart (Instellingen → Integraties). Google Agenda en AFAS lijken uitgezet.
   - Marketing/FAQ noemt o.a. Google Calendar, Outlook, Exact, Mollie, Slack, Zapier, WhatsApp.
   → **Actie:** lijst vaststellen van wat écht werkt, zodat Bob geen niet-bestaande koppelingen belooft.

4. **Rechtenlijst (Team → Rechten).** De exacte permissies (labels/categorieën) staan in de configuratie en zijn niet 1-op-1 uit de UI af te lezen. Bob heeft deze lijst nodig om per rol goed uit te leggen wat wel/niet kan.

5. **Zichtbaarheid per rol.** Voor veel modules (Planning, Database, financiële cijfers op de klantkaart) is niet 100% zeker of ze voor medewerkers of alleen admins zichtbaar zijn. Aanrader: per rol één keer door het portaal lopen en noteren wat een medewerker wél/niet ziet.

6. **Meldingen (notificaties).** Op meerdere plekken worden mensen "toegewezen" (deals, werkbonnen, activiteiten) en zijn er @-vermeldingen. Onduidelijk is of dat in-app, per e-mail of beide een melding geeft.

---

# BIJLAGE — Volledige routelijst (ter verificatie)

**Openbaar / marketing (geen login):**
- `/` — Home / marketingwebsite
- `/functies` — Functies
- `/prijzen` — Prijzen
- `/voor-wie` — Voor wie / branches
- `/over-ons` (ook `/over`) — Over ons
- `/contact` — Contact
- `/faq` — FAQ
- `/demo` — Interactieve demo
- `/cookieverklaring` — Cookieverklaring (placeholder)

**Auth & account:**
- `/login` — Inloggen
- `/register` (link `/registreer`) — Registratie (4 stappen)
- `/reset-password?token=…` — Wachtwoord opnieuw instellen
- `/uitnodiging/:token` — Teamuitnodiging accepteren

**Klant-gericht publiek (geen login):**
- `/offerte/:token` — Offerte bekijken & digitaal ondertekenen

**Portaal (`/dashboard`, na inloggen):**
- `/dashboard` — Dashboard
- `/dashboard/pipeline` — Pipeline / CRM (incl. "nieuwe aanvragen"/leads)
- `/dashboard/customers` — Klanten (+ Klantkaart als paneel, geen eigen URL)
- `/dashboard/activities` — Activiteiten
- `/dashboard/calendar` — Agenda
- `/dashboard/planning` — Planning
- `/dashboard/projecten` — Projecten (+ project-detailpaneel)
- `/dashboard/werkbonnen` — Werkbonnen
- `/dashboard/uren` — Urenregistratie
- `/dashboard/offertes` — Offertes
- `/dashboard/facturen` — Facturen
- `/dashboard/costs` — Kosten
- `/dashboard/revenue` — Financiën
- `/dashboard/database` — Database (klantendatabase)
- `/dashboard/team` — Team / medewerkers / rechten
- `/dashboard/instellingen` — Instellingen (tabs: Mijn profiel, Bedrijfsprofiel, Standaardwaarden, E-mailtemplates, Pipeline, Voertuigen, Integraties)

**Detail-panelen/drawers (geen eigen URL, openen binnen een pagina):**
- Klantkaart (vanuit Klanten/Pipeline/Dashboard)
- Deal-detail (vanuit Pipeline/Dashboard)
- Factuur-detail-drawer (vanuit Dashboard-widget — zie onzekerheid #1)
- Agenda-item-detail (vanuit Agenda)
- Project-detail (vanuit Projecten)

**🔒 Intern (niet voor klanten):**
- `/superadmin` — Super-admin portaal
