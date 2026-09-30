# Voorstellen: bewaartermijnen, datalekmelding en prijswijzigingen

**Status: VOORSTEL, niet goedgekeurd.** Niets hiervan is beleid. Neem het niet
op in publieke teksten (website, app, voorwaarden, privacyverklaring) tot het
is goedgekeurd. De concepten van de compagnon (`algemene-voorwaarden.md`,
aanvullingen in `privacyverklaring-CONCEPT.md` en
`verwerkersovereenkomst-CONCEPT.md`) noemen al 2 jaar en 48 uur; ook daar geldt
dit als voorstel.

Uitgangspunt: beloof alleen wat BossBase nu aantoonbaar kan uitvoeren.

## Bewaartermijnen

| Gegevens | Voorstel | Onderbouwing | Uitvoerbaar nu? |
| --- | --- | --- | --- |
| Account en bedrijfsdata na opzeggen | [[kies]]: A) tot een verwijderverzoek, of B) een vaste termijn, bijvoorbeeld 12 maanden | Nu wordt niets automatisch verwijderd. A beschrijft de werkelijkheid; B vergt een opruimtaak die nog niet bestaat. Een termijn beloven zonder uitvoering is wat er eerder misging. | A: ja, via de procedure in `verwijderverzoeken.md`. B: nee, eerst bouwen. |
| Facturen van BossBase aan klanten | 7 jaar | Wettelijke fiscale bewaarplicht (art. 52 AWR). Staat in Stripe. | Ja |
| Contactaanvragen via bossbase.nl | 12 maanden na de laatste reactie | Lang genoeg voor een vervolgvraag; langer heeft geen doel. | Handmatig ja; automatisch nee |
| Helpchatgesprekken | 12 maanden | Nodig voor vervolgvragen en om fouten te vinden. | Nee, geen opruimtaak |
| Mailfouten en meldingen | 12 maanden | Alleen nuttig om een recente storing uit te zoeken. | Nee, geen opruimtaak |
| Resettokens en verificatiecodes | Tot gebruik of verloop, plus opruimen bij de volgende aanvraag | Hebben daarna geen functie meer. | Grotendeels: sinds 1e55125 wordt bij een nieuwe aanvraag opgeruimd |

Advies: kies voor de account-termijn eerst **A** en beloof in de app alleen
dat. Stap over naar B zodra een opruimtaak gebouwd en getest is.

## Datalekmelding aan klanten (als verwerker)

- **Voorstel:** "zonder onredelijke vertraging, en uiterlijk [[24/48/72]] uur
  na ontdekking".
- **Onderbouwing:** de klant heeft zelf 72 uur om te melden bij de Autoriteit
  Persoonsgegevens (art. 33 AVG). Die klok loopt vanaf het moment dat híj het
  weet, dus een korte termijn van BossBase geeft hem ruimte. De AVG zelf zegt
  voor de verwerker alleen "zonder onredelijke vertraging".
- **Uitvoerbaar?** Alleen als iemand de meldingen ook in het weekend ziet. Met
  twee eigenaren en geen dienstrooster is 48 uur een belofte die in een
  vakantieweek kan knellen. Kies de termijn op basis van wie er bereikbaar is,
  en leg vast wie meldt.

## Prijswijzigingen

- **Voorstel:** minimaal 30 dagen vooraf per e-mail aankondigen; wie niet
  akkoord is, kan per de ingangsdatum opzeggen; bij een lopend jaarabonnement
  geldt de oude prijs tot het einde van de looptijd.
- **Onderbouwing:** een maand geeft een klant tijd om te beslissen. De
  jaarregel volgt uit hoe `billing-cancel` al werkt (de looptijd wordt
  aangehouden).
- **Uitvoerbaar?** Ja, de mail kan met de bestaande mailfunctie; het tijdig
  versturen is handwerk.
