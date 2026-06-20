# DESIGN CONSISTENTIE AUDIT — BossBase Dashboard

> Volledige inventarisatie van UI-styling per element-type, met exacte waarden, vindplaatsen (`bestand:regel`) en aanbevolen standaard. Puur onderzoek — geen code gewijzigd.
> Bron-baseline: `src/bb-dashboard.css` (`:root` tokens + basis-component-classes).
> Scope: alle dashboard-pagina's, gedeelde componenten en auth-pagina's. Marketing (`src/pages/marketing/*`) buiten scope.

---

## 0. SAMENVATTING — TOP BEVINDINGEN

| # | Bevinding | Impact |
|---|-----------|--------|
| 1 | **Meerdere parallelle design-systemen** naast `bb-dashboard.css`: `act2-*` (ActivitiesPageV2), `wb2-*` (WerkbonPageV2), `uren2-*` (UrenPageV2), `bb-widget/.chip` (WidgetCard), `T/FIN/FLBL/TH` (DatabasePage), en de orphan-primitives `.field/.empty-state/.stat-card` (components/). Elk dupliceert knoppen, badges, kaarten, tabellen, modals. | Hoog |
| 2 | **rem vs px door elkaar.** Sommige bestanden in rem (`.84rem`), andere volledig in px (`13px`). Geen gedeelde typografische schaal. ~25 verschillende font-sizes. | Hoog |
| 3 | **Hardcoded hex i.p.v. bestaande tokens.** `#15A34A` (=`--pd`), `#9ca3af` (=`--dl`), `#0D0D0D` (=`--dk`) worden honderden keren letterlijk geschreven. | Hoog |
| 4 | **Meerdere groentinten voor "waarde/succes":** `#1DDB62`(--p), `#15A34A`(--pd), `#0F7A3F`, `#15803d`, `#13a849`, `#16a34a`. | Middel |
| 5 | **`font-weight: 800`** is de-facto titel-gewicht maar staat niet in het systeem (dat kent 600/700). Ook 400/500 ad-hoc. | Middel |
| 6 | **Niet-bestaande CSS-variabelen gebruikt:** `--tx` (InstellingenPage, valt terug op niets), `--br` bestaat wél (alias `--bstrong`). | Bug |
| 7 | **`btn-s` als size-modifier misbruikt** in SuperAdminPage (`.btn-s` = secundaire kleur, niet klein formaat). | Bug |
| 8 | **Modal max-width inconsistent:** 380/400/420/440/460/480/520/540/560/640/660/780px. Standaard `.modal` = 520. | Middel |
| 9 | **Overlay-opacity inconsistent:** `.38` (standaard), `.45` (Database progress, SuperAdmin drawer), `.3` (.drawer-overlay). Plus `.modal-backdrop` i.p.v. `.overlay`. | Laag |
| 10 | **Gedupliceerde inline-componenten:** `HeadClose`, `Section`, `Row`, `initialsOf` copy-paste over de drie dashboard-drawers; deal-kaart desktop ↔ mobiel volledig gedupliceerd. | Middel |

---

## DESIGN-SYSTEEM BASELINE (de standaard in `bb-dashboard.css`)

### CSS-variabelen (`:root`)
```
--p #1DDB62   --pd #15A34A   --pl #d1fae5   --pll #f0fdf4
--bg #ffffff  --bgs #fafaf8  --bgx #f5f4f1
--sb #0D0D0D  --sbb #1f2020
--dk #0D0D0D  --dm #374151   --dmu #6b7280  --dl #9ca3af
--border #f0ede9   --bstrong #e5e7eb   --br #e5e7eb (alias bstrong)
--r4 4 / --r6 6 / --r8 8 / --r10 10 / --r12 12 / --r14 14 / --r16 16 / --r20 20 / --r999 999
--shadow-xs / --shadow-sm / --shadow-md / --shadow-orange / --shadow-orange-lg
--sw 232 (sidebar)  --th 58 (topbar)
```
> ⚠️ `--tx` bestaat NIET maar wordt gebruikt (InstellingenPage 910/938).

### Basis-component-classes (de bedoelde standaard)
| Class | Waarde |
|-------|--------|
| `.btn` | inline-flex, gap 6, padding **9px 16px**, radius **10**, font **.84rem**, weight 600 |
| `.btn-p` | bg #1DDB62, kleur #0D0D0D, weight **700**, hover bg #15A34A + kleur #fff |
| `.btn-s` | wit, kleur #6b7280, border 1px #e5e7eb, shadow-xs |
| `.btn-ghost` | kleur #6b7280, padding 8px 12px |
| `.btn-sm` / `.btn-xs` | 6px12px/.78rem · 4px9px/.72rem |
| `.btn-danger` | bg #fef2f2, kleur #dc2626, border #fecaca |
| `.btn-icon` | **30×30**, radius 8, kleur #6b7280, hover bg #f3f4f6 |
| `.card` | wit, radius **14**, border #f0ede9, shadow-sm · `.card-p` padding **20** |
| `.badge` | padding **3px 9px**, radius 999, font **.7rem**, weight 600 |
| `.dt` (tabel) | th 9px16px **.68rem** uppercase #9ca3af · td 12px16px · hover #f6fef9 |
| `.tabs`/`.tab` | container bgs+border, tab 6px14px .8rem weight600; `.active` wit bg |
| `.modal` | radius **20**, padding **28px32px**, max-width **520**; `.overlay` rgba(0,0,0,**.38**)+blur |
| `.modal-x` | 26×26, radius 6 |
| `.drawer` | **680px**, max 95vw; `.drawer-x` 32×32 radius 8; `.drawer-overlay` rgba(0,0,0,.3) |
| `.f label` / `.f input` | label .78rem weight600 · input border #e5e7eb radius 8 padding 9px11px .85rem, focus groen |
| `.search` | border #f0ede9 radius 10 padding 8px12px, focus groen |
| `.sc` (statkaart) | radius 14, padding 18px20px, border, shadow-sm; sc-val 1.65rem weight800 |
| `.empty` | padding 48px20px; empty-title .95rem weight700; empty-sub .82rem |
| `.av` | sm26 / md34 / lg44 / xl56; 6 kleurschema's `.av-0..5` |
| `.page-hd` | h1 22px weight700; p 13px #6b7280 |
| `.bb-skel` | skeleton-gradient (donker, voor sidebar) |
| Badge-statuskleuren | oranje #fff4ec/#e8784a · blauw #eff6ff/#2563eb · groen #ecfdf5/#15A34A · rood #fef2f2/#dc2626 · grijs #f3f4f6/#6b7280 · paars #f5f3ff/#7c3aed |

---

## 1. PRIMAIRE KNOPPEN

**Standaard:** `.btn .btn-p` — bg #1DDB62, kleur #0D0D0D, weight 700, padding 9px16px, radius 10, font .84rem.

**Conform:** SharedModals (alle modals: `.btn btn-p`), OffertesPage/FacturenPage (meeste), TeamPage, DashboardCustomizeBar, AvatarUpload.

**Afwijkende varianten gevonden (≈8 systemen):**
| Variant | Vindplaats | Styling |
|---------|-----------|---------|
| Ronde groene +-knop, **witte** tekst | BbPages1 595/616/637/658; InstellingenPage 918 | 28×28, radius 50%, bg #1DDB62, kleur #fff, font 18px — niet `.btn-p` (zwarte tekst) noch `.btn-icon` |
| Redundante inline-override bovenop `.btn-p` | DealDetailDrawer 247 (`bg #1DDB62, kleur #0a0a0a`); DashboardHome 548 (gele toggle) | class + volledige inline duplicatie; `#0a0a0a` ≠ token `#0D0D0D` |
| `wb2-hours-primary`, `wb2-complete-btn` | WerkbonPageV2 361/1172 | eigen primaire knop in donkere kaart |
| `uren2-btn uren2-btn-primary` | UrenPageV2 506/647 | eigen primair systeem; **0 standaard `.btn`** op hele pagina |
| `.auth-submit` | BbAuth, ResetPasswordPage, UitnodigingPage | eigen auth-submit-knop (geen `.btn`) |
| `.bbw-btn`, `.qa-btn` | WidgetCard 496/978 | eigen widget-knop-systeem |
| Lost-reason / `.dw-layout-kies` | LayoutPickerModal 94-103 | inline dupliceert `.btn-p`-look |
| Delete-modal inline | DatabasePage 1755 (`bg #dc2626 kleur white`); TeamPage delete | handmatig i.p.v. `.btn-danger` |

**Aanbeveling:** Eén `.btn .btn-p`. Ronde +-knoppen vervangen door `.btn-icon` of `.btn-p .btn-xs`. `.auth-submit` aliassen naar `.btn-p`.

---

## 2. SECUNDAIRE / GHOST KNOPPEN

**Standaard:** `.btn-s` (wit/#6b7280/border #e5e7eb), `.btn-ghost` (#6b7280, padding 8px12px).

**Afwijkingen:**
- **Selects gestyled als knop:** `<select className="btn btn-s btn-sm" style={padding:'5px 10px'}>` — BbPages2 595/720/836/1386 (terugkerend patroon).
- **Link-knoppen** (`background:none;border:none`): BbPages1 581/1085/1095; ProjectsPage 526; OffertesPage 998; FacturenPage 331/1051; DatabasePage 330/1409; SuperAdminPage 221.
- **Eigen ghost-systemen:** `act2-btn-ghost`, `wb2-hours-secondary`, `uren2-btn-ghost`, `wb2-list-card` (kaart-als-knop).
- **`btn-s` als size misbruikt:** SuperAdminPage 247/384/400/404/539 — krijgt secundaire kleur i.p.v. klein formaat. **Bug.**
- **Redundante override:** TeamPage 519 (`.btn-sm` + inline `fontSize:.78rem`); ProjectsPage 554 (`btn-ghost btn-icon` gestapeld).

**Aanbeveling:** native `<select>` met `.f`-styling i.p.v. `.btn` op selects. Gedeelde `.btn-link` class voor tekstknoppen. SuperAdmin `btn-s`→`btn-sm` corrigeren.

---

## 3. ICOON-KNOPPEN

**Standaard:** `.btn-icon` 30×30, radius 8, #6b7280, hover #f3f4f6.

**Afwijkingen:**
- **Drie identieke `HeadClose`** (drawers) 32×32, radius **9**, border #e7e9ec — DealDetailDrawer 158, InvoiceDetailDrawer 59, CalendarEventDetailDrawer 242. Copy-paste, radius 9≠8.
- `IconBtn`→`uren2-iconbtn` (UrenPageV2 115); `wb2-taak-del`/`wb2-foto-thumb-del` (WerkbonPageV2); DatabasePage rij-acties 1457 (padding 4px5px, radius 6); `.dw-ctrl-btn` (WidgetCard 88).
- Inline +-knoppen (zie §1).

**Aanbeveling:** Eén `.btn-icon` (+ `.btn-icon-danger` variant). HeadClose → gedeelde component met `.drawer-x`.

---

## 4. ZOEKBALKEN

**Standaard:** `.search` (border #f0ede9, radius 10, padding 8px12px, focus groen + ring rgba(29,219,98,.15)).

**Varianten (4):**
| Variant | Vindplaats |
|---------|-----------|
| `.search` (standaard) | BbPages1 1217 (klanten) |
| `act2-field-search` + inline SVG | ActivitiesPageV2 330 |
| `border:none;background:transparent;fontSize:12` | DatabasePage 317 |
| AddWidgetModal search met clear-knop | AddWidgetModal 72-86 |

**Aanbeveling:** `.search` overal; clear-knop als optionele child.

---

## 5. TEKSTVELDEN / INPUTS

**Standaard:** `.f input` — border #e5e7eb, radius 8, padding 9px11px, font .85rem, focus groen.

**Afwijkende input-definities (≥5 borders!):**
| Border-hex | Radius | Vindplaats |
|-----------|--------|-----------|
| #e5e7eb (standaard) | 8 | `.f input` (SharedModals, Instellingen-forms) |
| #e7e9ec | **9** | DealDetailDrawer 37 (padding 9px11px, font **13.5px**) |
| #e2e5e9 | 8 | CalendarEventDetailDrawer 22 (padding **8px10px**, font **13px**) |
| var(--br) | **7** | DatabasePage 175 (height 32, font 12) |
| var(--bstrong) | 8 | FacturenPage 354 (faux-input div) |

- **Orphan primitive `Input.jsx`** gebruikt class `.field` (styles.css), niet `.f` — apart systeem, 1× geïmporteerd.
- Inline mini-inputs: BbPages1 1070/1074 (padding 2px6px); BbPages2 1138/1146.
- **Labels:** standaard `.f label` .78rem/weight600; afwijkend DealDetailDrawer 31 (11.5px/**700**), CalendarEvent 26 (11.5px/700), DatabasePage/SuperAdmin (11px uppercase letterSpacing .07em).

**Aanbeveling:** `.f input` overal; drie drawer-borders consolideren naar #e5e7eb + radius 8.

---

## 6. TEXTAREAS / NOTITIEVELDEN

**Standaard:** `.f textarea` — resize vertical, min-height 80, line-height 1.5.

**Varianten (3 rich-text + plain):**
| Component | Border / focus | Padding | Min-height |
|-----------|----------------|---------|-----------|
| **MentionEditor** (`bb-me-field`) | var(--br,#d1d5db), focus #1DDB62 | 8px10px | `calc(rows*1.5em+18px)` |
| **MailBodyEditor** (`bb-notitie-editor`) | #1DDB62 focus / var(--border) | 10px12px | `minHeight` prop |
| **NotitieEditor** (BbPages1 77-133) | inline #1DDB62 focus | — | 200 default |
| Plain `<textarea>` | inline | 8px10px | BbPages2 560, SuperAdmin 537 (minHeight 100) |

- MentionEditor mention-kleur `#15803d`; AV_COLORS `['#1DDB62','#3b82f6','#f59e0b','#ef4444','#8b5cf6','#06b6d4']` (≠ `.av-N` palet).
- `rows`-prop verschilt: BbPages1 557 (3), 691 (4).

**Aanbeveling:** Eén rich-editor-component; MailBodyEditor en NotitieEditor consolideren.

---

## 7. DROPDOWNS / SELECTS

**Standaard:** native `<select>` binnen `.f`.

**Varianten:**
- `<select className="btn btn-s btn-sm">` (BbPages2, knop-stijl).
- Volledig custom listbox `Dropdown` → `uren2-dropdown-trigger/-opt` (UrenPageV2 149-193).
- `QuickDropdown` → inline height 30 radius 7 (DatabasePage 201).
- Inline `<select>` PlanningPage 1029 (font 13, radius 8, weight 600).
- Pijl-icoon: soms `I.chevron`/`ChevronDown`, soms native.

**Aanbeveling:** native `.f select` standaardiseren; custom listbox alleen waar functioneel nodig (multi-select).

---

## 8. CHECKBOXEN / TOGGLES

**Checkboxen — 4 varianten, inconsistente grootte:**
| Vindplaats | Grootte | accentColor |
|-----------|---------|-------------|
| TeamPage PermissionsModal 335 | 16×16 | var(--p) ✓ |
| DatabasePage `Checkbox` comp 137 | 15×15, radius 3 | var(--p) ✓ |
| DatabasePage filter-checks (×16) | native | var(--p) ✓ |
| InstellingenPage "Actief" 991 | native | **geen** → browser-blauw ✗ |

**Toggle — 1 implementatie (enige in codebase):** InstellingenPage 1040 — track 40×22 radius 11, actief bg var(--p), thumb 16×16 wit met shadow. Geen herbruikbare class.

**Aanbeveling:** Gedeelde `<Checkbox>` (16px, accent var(--p)) + `<Toggle>` component. Instellingen-checkbox accentColor toevoegen.

---

## 9. KAARTEN

**Standaard:** `.card` (radius 14, border #f0ede9, shadow-sm) + `.card-p` (20).

**Afwijkende kaart-systemen:**
| Systeem | Vindplaats | Afwijking |
|---------|-----------|-----------|
| Quick-stat inline | BbPages1 534 | bg --bgs, radius --r10, padding 12px14px |
| `BtwKaart` | BbPages2 1251 | gebruikt `--br`/`--tx`; radius 8 |
| `ProjectCard` | ProjectsPage 248 | `.card .card-p` op `<button>`, border var(--br) |
| `wb2-card` / `wb2-hours` | WerkbonPageV2 | eigen kaart + donker thema |
| `uren2-card`/`uren2-kpi`/`uren2-mcard` | UrenPageV2 | eigen kaarten |
| DatabasePage cards | 273/1152/1362 | `boxShadow:T.shadow` ≠ shadow-sm |
| SuperAdmin stat/drawer-cards | 236 | inline padding 18px20px, bg #f8f9fa, radius 8/10 |
| `bb-widget` | WidgetCard | volledig parallel systeem |
| `.stat-card` (orphan) | StatCard.jsx | styles.css, ≠ `.sc` |

**Aanbeveling:** Eén `.card`/`.card-p` + `.sc` voor stats. Widget-systeem apart documenteren of harmoniseren.

---

## 10. BADGES / STATUS-LABELS

**Standaard `.badge`** (3px9px, radius 999, .7rem, weight600) + statuskleuren (zie baseline).

**Parallelle badge-systemen (≥6):**
| Systeem | Vindplaats | padding / radius / font |
|---------|-----------|------------------------|
| `.badge b-*` (standaard) | drawers, Offertes, Facturen, TeamPage | 3px9px / 999 / .7rem |
| `.chip` (success/info/warn) | WidgetCard | eigen |
| `act2-badge` + dot | ActivitiesPageV2 440 | inline dot-kleuren |
| `WB2Badge` (tone+dot) | WerkbonPageV2 58 | gray/blue/amber/green |
| `uren2-badge` | UrenPageV2 96 | arbeid/reis/overig |
| `StatusBadge` (DatabasePage 159) | | 2px8px / 999 / **10px** + eigen STATUS_COLORS |
| `StatusBadge`/`PlanBadge` (SuperAdmin 17/29) | | 2px8px / 99 / **11px** weight 700/600 |
| Moneybird-badge | BbPages2 690 | radius **4/5**, bg #2563EB |

**Inline font-overrides op `.badge`:** BbDashboard 121 (.65rem), 214 (12px); FacturenPage 664/1048/1062 (10px).

**Factuur-statussen hergebruiken offerte-classes:** `b-accepted` (betaald), `b-declined` (verlopen) i.p.v. bedoelde `b-paid`/`b-overdue` (FacturenPage 29-34).

**Statuskleur-inventaris (alle varianten per semantiek):**
- **Groen/succes:** `#ecfdf5/#15A34A` (badge), `#f0fdf4/#15803d` (Offertes), `#0F7A3F/#E8FBEF` (Werkbon), `#13a849` (Werkbon chip), `#16a34a` (SuperAdmin), `#f0fdf4/#16A34A` (Database).
- **Oranje/waarschuwing:** `#fff4ec/#e8784a` (badge), `#fff7ed/#d97706` (BbPages2), `#fef3c7/#f59e0b/#92400e` (Facturen), `#fffbeb/#d97706` (SuperAdmin), `#FFF7ED/#C2410C` (Database).
- **Rood:** `#fef2f2/#dc2626` (badge), `#fef2f2/#fca5a5/#991b1b` (Facturen crediteer), `#FFF1F2/#BE123C` (Database), `#fee2e2` (CF-badge).
- **Blauw:** `#eff6ff/#2563eb` (badge), `#2563EB/#EFF4FF` (Werkbon foto), `#dbeafe` (funnel).

**Aanbeveling:** Eén badge-class, statuskleuren via tokens. Factuur-statussen `b-paid`/`b-overdue` invoeren. ~6 groentinten → `--p`/`--pd`.

---

## 11. TABELLEN

**Standaard `.dt`** — th 9px16px .68rem uppercase #9ca3af; td 12px16px; rij-hover #f6fef9; border tussen rijen #f3f4f6.

**Conform:** Offertes, Facturen, BbPages1 (klanten/klantkaart), BbPages2 (kosten/uren/BTW), Pipeline-tabellen.

**Afwijkend:**
- `uren2-table` (`uren2-th`/`uren2-td`) — UrenPageV2 221, volledig eigen tabel; mobiel `uren2-mcard`.
- DatabasePage tabel: gebruikt `.dt`-achtige inline `TH`/`COLS`/`FLBL` tokens (font 10px).
- WerkbonPageV2 materialen: CSS-grid `wb2-mat-grid` (pseudo-tabel).
- Cel-styling overal inline per `<td>` (kleur/weight), bv. BbPages2 1316-1324 (#15A34A/#dc2626/#e8784a direct in style).
- `table-layout:fixed` alleen scoped op `.kk-scroll .dt` (klantkaart).

**Aanbeveling:** `.dt` overal; `uren2-table` migreren. Celkleuren via helper-classes.

---

## 12. MODALS

**Standaard `.modal`** radius 20, padding 28px32px, max-width 520; `.overlay` rgba(0,0,0,.38)+blur; `.modal-x` 26×26.

**max-width wildgroei:** 380 (BbPages2 event, Planning), 400 (BbDashboard lost), 420 (Planning google, Database delete), 440 (BbPages2 kosten, BbDashboard project), 460 (BbDashboard deal, Planning detail), 480 (TeamPage perms), **520 (standaard)**, 540/560 (Planning, Database mail), 640 (AddWidget, uren2 default), 660 (LayoutPicker), 780 (modal-wide).

**Andere afwijkingen:**
- `.modal-backdrop` i.p.v. `.overlay` — BbPages2 684 (KostenDetailModal).
- Custom overlay `rgba(0,0,0,.45)` radius 14 — DatabasePage 1716 (progress).
- `uren2-overlay`/`uren2-modal`/`ModalShell` — UrenPageV2 336 (eigen modal-systeem, mobiel bottom-sheet).
- Body-padding inconsistent: 20px24px (view-modals) vs 28px32px (standaard) vs 32px (loadings).
- Mobiele override inline: width/height 100vw, borderRadius 0 (Offertes/Facturen).

**Conform:** SharedModals (alle `.overlay`+`.modal modal-wide`), TeamPage modals.

**Aanbeveling:** Modal-size-tokens (`sm 420 / md 520 / lg 780`). `.overlay` overal (.38). uren2/ModalShell consolideren.

---

## 13. DRAWERS

**Standaard `.drawer`** 680px, max 95vw; `.drawer-x` 32×32 radius 8; `.drawer-overlay` rgba(0,0,0,.3); `.drawer-body` padding 20px24px.

**Afwijkingen:**
- **Dashboard-drawers gebruiken `.drawer`-class NIET** — DealDetailDrawer/InvoiceDetailDrawer/CalendarEventDetailDrawer zijn losse div-trees met inline flex. Breedte extern bepaald.
- **CustomerPage** rendert als `.cust-split-panel` (split, max(680px,50%)) of `.drawer`; fullscreen via DOM-class `klant-fullscreen`.
- **SuperAdmin CompanyDrawer** 367 — eigen fixed side-drawer 520px, overlay rgba(0,0,0,.45).
- Gedupliceerde `HeadClose`/`Section`/`Row` over de 3 dashboard-drawers.

**Aanbeveling:** Eén drawer-shell-component; HeadClose/Section/Row als gedeelde primitives.

---

## 14. PAGINA-HEADERS

**Standaard `.page-hd`** — h1 22px weight700, p 13px #6b7280, actie-knoppen `.page-hd-actions` rechts.

**Conform:** Klanten, Offertes, Facturen, Projecten, Instellingen, Team, Activiteiten(klassiek).

**Afwijkend:**
- `act2-*` header (ActivitiesPageV2), `uren2-h1`/`uren2-sub` (UrenPageV2), `wb2-detail-back` + inline titel 18px (WerkbonPageV2 1052).
- SuperAdmin eigen donkere header (212-221, inline #0D0D0D/#9ca3af).
- Auth: `.auth-title`/`.auth-sub`.

**Aanbeveling:** `.page-hd` overal in dashboard-pagina's.

---

## 15. TABS

**Standaard `.tabs`/`.tab`** — container bgs+border, actief wit bg.

**4 tab-systemen, 2 active-conventies (`.active` vs `.on`):**
| Systeem | Vindplaats | Active |
|---------|-----------|--------|
| `.tabs`/`.tab.active` | BbPages1 543/1209, BbPages2, Planning 1024, Instellingen 678 | `.active` |
| `.kk-tabs` | BbPages1 klantkaart | `.active` |
| `.bb-filter-tabs`/`.bb-filter-tab.on` + count | BbPages1 1364/1482 | `.on` |
| `act2-tabs`/`act2-tab.on` | ActivitiesPageV2 295 | `.on` |
| `uren2-tab` | UrenPageV2 137 | eigen |
| Template-subtabs (inline pills) | InstellingenPage 904 | inline |
| DatabasePage status-tabs (segmented) | DatabasePage 280 | eigen |

**Aanbeveling:** `.tabs`/`.tab` + optionele `.tab-count`. Eén active-conventie (`.active`).

---

## 16. LIJSTEN / RIJEN

**≥5 rij-stijlen:** `.act-item` (BbPages1 599/1405), `.kk-row` (klantkaart), inline rij-divs (BbPages1 620/641/662, padding 8px0 borderBottom var(--border)), `.act2-row` (accent-bar), `wb2-list-card` (kaart), DatabasePage rijen inline borderBottom #f3f4f6.

**Aanbeveling:** Gedeelde `.list-row` met hover-conventie.

---

## 17. AVATARS

**Standaard `.av av-{sm/md/lg/xl}` + `.av-0..5`** (component `Av` uit bb-shared).

**4+ implementaties:**
- `Av` component (standaard) — meeste pagina's.
- `Avatar`/`AvatarSq` (WidgetCard 148/156) — eigen, `avatarTone` 6-palet.
- Inline avatar CalendarEventDetailDrawer 440 (30×30 bg #eef0f2 #374151).
- `act2-av` (ActivitiesPageV2), UrenPageV2 avatar met `AVATAR_TINTS` 8-palet, MentionEditor AV_COLORS 6-palet.
- **2 verschillende `initialsOf`:** WidgetCard (eerste 2 woorden) vs CalendarEvent (eerste+laatste).

**Aanbeveling:** Eén `Av` + één initials-helper + één tint-palet.

---

## 18. EMPTY STATES

**Standaard `.empty`/`.empty-title`/`.empty-sub`** padding 48px20px.

**≥6 varianten:**
| Variant | Vindplaats |
|---------|-----------|
| `.empty` (standaard) | BbPages1 1222/1398, BbPages2 338 (+emoji) |
| Inline `textAlign:center padding:24px0 #9ca3af` (≥7×) | BbPages1 597/618/639/660…; Werkbon 403/476/628 |
| `.kk-empty` | BbPages1 804/828/865/890 |
| `EmptyState` comp (`.empty-state`/`.empty-mark` = **"QM" placeholder**) | components/EmptyState.jsx (orphan) |
| `act2-state-empty` + SVG | ActivitiesPageV2 524 |
| `wb2-empty` + acties | WerkbonPageV2 1247 |
| `uren2-empty` | UrenPageV2 211 |
| `.dw-empty-state` (`.empty-sub`) | DashboardWidgetGrid 84 |
| Tabel-rij colSpan (padding 32px0 / 48 / 20) | Offertes 985, Database 1383, SuperAdmin 262 |

**Aanbeveling:** Eén `.empty`/`EmptyState`. "QM"-placeholder verwijderen.

---

## 19. LOADING STATES

**≥4 stijlen:**
- Tekst in kaart: `<div className="card card-p">…laden...</div>` (meeste pagina's).
- Skeleton-grid `.dw-skel-card` (DashboardHome 603); `.skel` + **spinner** (WidgetCard 283, enige spinner-in-head).
- `act2-skel` + spinner-SVG (ActivitiesPageV2 484, enige echte skeleton-loader).
- `bb-skel`/`bb-skel-av` (sidebar/profiel).
- Inline tekst `color var(--dl)` (BbPages1 981, BbPages2 1237).
- **Ellipsis-inconsistentie:** "laden..." (3 punten) vs "laden…" (… teken) door elkaar; "Opslaan..." vs "Opslaan…".

**Aanbeveling:** Eén skeleton-systeem + één tekst-loader. Uniforme "…".

---

## 20. TOOLTIPS

- `.sync-indicator::after` (CSS, bb-dashboard 2007) — `data-tooltip`, bg #1a1a1a, .72rem.
- `.sb-toggle-tip` + `navTip` (Sidebar, App.jsx) — fixed-positioned portal, bg #1a1a1a.
- WidgetCard inline tooltip (1532) — bg #fff, rgba(15,23,42,.14).
- `<button title="...">` native tooltips (diverse).

**Aanbeveling:** Eén tooltip-conventie (bg #1a1a1a, .72rem).

---

## 21. NOTIFICATIES / TOASTS

- `useToast()` / `ToastProvider` (lib/toast.jsx) — centraal, gebruikt overal (`toast.success`/`toast.error`). **Consistent.** ✓
- Geen afwijkende inline toast-implementaties gevonden.

---

## 22. KLEURGEBRUIK — HARDCODED HEX (niet via tokens)

**Meest voorkomende dupliceringen van bestaande tokens:**
- `#15A34A` (=`--pd`) — BbPages1 518/536/855/1082/1250/1271; BbPages2 ×8; Instellingen 985/1395/1432; en lowercase `#15a34a`/`#16a34a` in SuperAdmin.
- `#9ca3af` (=`--dl`) — BbPages1 ×11; Werkbon 403/476/628/1138; SuperAdmin ×veel; BbDashboard 467.
- `#0D0D0D` (=`--dk`) en variant `#0a0a0a` (drawers) — alle 3 dashboard-drawers.
- `#1DDB62` (=`--p`) — letterlijk i.p.v. token: BbPages1 +knoppen; FacturenPage 499; ProjectsPage 47; Instellingen 909/1308.
- `#e5e7eb` (=`--bstrong`) — Instellingen 757; UrenPageV2 67.
- `#f0ede9` (=`--border`) — PlanningPage 303.

**Niet-getokeniseerde kleuren (eigen paletten):**
- **Tijdlijn (BbPages1 463-473):** `#3b82f6 #f97316 #10b981 #ef4444 #6366f1 #0ea5e9 #f59e0b #14b8a6 #8b5cf6 #64748b`.
- **PlanningPage:** HSL-palet `entityColor`/`HSL_HUES` (10 hues) volledig buiten tokens; oranje unplanned `#fff7ed/#fed7aa/#b45309/#d97706`; groen activiteit `#15803d`.
- **DatabasePage `STATUS_COLORS` (153-157):** 10 hex-paren. `T.pageBg #F9FAFB`, `T.borderXL #F3F4F6`.
- **SuperAdminPage:** ~80 hardcoded hex (slate-palet #f1f5f9/#475569/#6366f1/#eef2ff, casing-mix #16a34a/#16A34A).
- **WidgetCard `C`-object (8-21):** volledige token-set als losse hex gedupliceerd + extra (#60a5fa #a78bfa #fb923c, avatarTone 6-palet).
- **UrenPageV2 `AVATAR_TINTS` (66):** 8 pastels `#fde68a #bfdbfe #fecaca #c7d2fe #bbf7d0 #fbcfe8 #fef08a #a7f3d0`.
- **Branding default:** `#f97316` (InstellingenPage 86/216/756…), `#0F7A3F` waarde-groen (BbDashboard 335/428/1022, Werkbon).
- **Auth `AuthIcon`-paren:** `#6b7280/#f3f4f6`, `#d97706/#fffbeb`, `#1DDB62/#f0fdf4`, `#dc2626/#fef2f2`.

**Aanbeveling:** Alle token-dupes vervangen door `var(--…)`. Eigen paletten (tijdlijn, planning HSL, status) als nieuwe tokens definiëren (`--status-*`, `--cat-*`).

---

## 23. SPACING

**Geen 8-punts-grid; ad-hoc waarden.**
- **Gaps:** 2/4/5/6/7/8/10/12/14/16 px door elkaar binnen één bestand.
- **Section-marges naast elkaar inconsistent:** BbPages1 header `marginBottom:20`, quick-stats `20`, tabs `16`, kaarten-gap `14` (493/527/543/551).
- **Card-padding:** standaard 20 (`.card-p`); inline varianten 12px14px, 14px16px, 16px18px, 18px20px, en widget-paddings volledig ad-hoc (`'14px 16px 18px'`, `'6px 16px 14px'`…).
- **Drawer Section `marginTop:22`** (willekeurig, alle 3 drawers).
- **Modal-padding:** 16/18, 20/24, 28/32, 32 — geen consistentie.
- **Radius-wildgroei:** 3/4/5/6/7/8/9/10/11/14/20/999 + '50%'. Drawers gebruiken consequent **9** i.p.v. 8.
- **Layout-hacks:** Werkbon 528 `<div style={{visibility:hidden}}>spacer</div>`; inline JS hover-mutaties (ProjectsPage 526, Offertes 998).
- **Bug:** BbPages2 814-817 loading/error-blok **dubbel** gerenderd.

**Aanbeveling:** Spacing-schaal (4/8/12/16/20/24) als tokens; radius beperken tot --r6/8/10/14/20/999.

---

## 24. TYPOGRAFIE

**Eenheden gemengd:** BbDashboard/Instellingen/Team in **rem**; Projects/Planning/Database/SuperAdmin/drawers in **px**.

**Font-sizes (≈25 waarden):**
- rem: .62 / .65 / .68 / .7 / .72 / .73 / .74 / .75 / .76 / .78 / .8 / .82 / .83 / .84 / .85 / .86 / .88 / .9 / .95 / 1 / 1.05 / 1.1 / 1.2 / 1.25 rem.
- px: 9 / 10 / 10.5 / 11 / 11.5 / 12 / 12.5 / 13 / 13.5 / 14 / 15 / 16 / 17 / 18 / 20 / 26 / 36 / 40 px.

**Font-weights:** 400, 500, 600, 700, **800** (de-facto titel, niet in systeem). Binnen één element wisselend (Offertes regelprijs: 500 desktop vs 600 mobiel).

**"Kleine label"-stijl** gedupliceerd met verschillen: BbDashboard `DL` (11px/.04em), ProjectsPage (10px/.04em), PlanningPage (11px/.05em), FacturenPage `DL_STYLE` (11px/.05em), Database/SuperAdmin (11px/.07em).

**Aanbeveling:** Typografische schaal in tokens (`--fs-xs .7rem … --fs-2xl 1.65rem`), uitsluitend rem. Weights → 500/600/700/800 als bewuste set. Eén `.label`-class.

---

## BIJLAGE — CONSISTENTIE-RANKING PER BESTAND

| Niveau | Bestanden |
|--------|-----------|
| ✅ **Schoon** (gebruikt standaard-classes) | SharedModals, TeamPage, lib/toast, AvatarUpload, OffertesPage*, FacturenPage* (*op hardcoded hex na) |
| 🟡 **Gemengd** | BbPages1, BbPages2, BbDashboard, ProjectsPage, InstellingenPage, DashboardHome, drawers (dashboard) |
| 🔴 **Parallel design-systeem** | ActivitiesPageV2 (`act2-*`), WerkbonPageV2 (`wb2-*`), UrenPageV2 (`uren2-*`), WidgetCard (`bb-widget/.chip`), DatabasePage (`T/FIN/FLBL`), SuperAdminPage, PlanningPage (HSL-palet) |
| ⚫ **Orphan / dood** | components/{Button,Input,Select,EmptyState,StatCard}.jsx (`.field`/`.empty-state`/`.stat-card`, 1× geïmporteerd, EmptyState toont "QM"); InstellingenPage SnelStart-card (`false &&`, dead code) |

## BIJLAGE — CONCRETE BUGS (geen styling-smaak, echte fouten)
1. **`var(--tx)`** bestaat niet — InstellingenPage 910/938 (inactieve template-tabs zonder kleur).
2. **`btn-s` als size** — SuperAdminPage 247/384/400/404/539 (krijgt secundaire kleur i.p.v. klein).
3. **Checkbox zonder accentColor** — InstellingenPage 991 (browser-blauw i.p.v. groen).
4. **Dubbele loading/error-render** — BbPages2 814-817.
5. **"QM"-placeholder** zichtbaar in EmptyState.jsx (orphan component).
6. **Dead code** — InstellingenPage SnelStart-card achter `false &&`.
7. **Casing-mix** — `#16a34a` vs `#16A34A` (SuperAdminPage).

---

*Einde rapport. Aanbevolen vervolg: (1) bugs uit bijlage fixen, (2) hardcoded token-dupes → variabelen, (3) parallelle systemen (`act2/wb2/uren2`) per pagina migreren naar standaard-classes, (4) typografie- en spacing-schaal als tokens vastleggen.*
