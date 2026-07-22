import { useState, useEffect, useRef } from 'react';
import { I, ModalX, STAGE_COLOR_OPTIONS, stageColToHex, stageColorLabel, stageBadgeStyle } from '../bb-shared.jsx';
import { supabase } from '../lib/supabase.js';
import { useToast } from '../lib/toast.jsx';
import { useProfile, useTier } from '../lib/profileContext.jsx';
import { getStripeConnection, startStripeOnboarding, refreshStripeStatus, disconnectStripe } from '../services/stripeService.js';
import { usePermissions } from '../hooks/usePermissions.js';
import { useUrlTab } from '../hooks/useUrlTab.js';
import { useUploads } from '../lib/uploadContext.jsx';
import { openCookieBanner } from '../components/CookieBanner.jsx';
import {
  getBedrijfsinstellingen,
  upsertBedrijfsinstellingen,
  getEmailTemplates,
  updateEmailTemplate,
  createEmailTemplate,
  deleteEmailTemplate,
  getPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
} from '../services/instellingenService.js';
import { getLostReasons, createLostReason, updateLostReason, deleteLostReason } from '../services/lostReasonService.js';
import { getVoertuigen, createVoertuig, updateVoertuig, deleteVoertuig } from '../services/voertuigService.js';
import { getEigenEenheden, createEigenEenheid, updateEigenEenheid, deleteEigenEenheid } from '../services/eigenEenheidService.js';
import { updateCompany, updateProfile, deleteOwnAccount, cancelCompanyAccount } from '../services/profileService.js';
import { changePassword } from '../services/authService.js';
import { uploadProfileAvatar, removeProfileAvatar } from '../services/avatarService.js';
import { AvatarUpload } from '../components/AvatarUpload.jsx';
import { PasswordRequirements, PasswordMatch, passwordValid } from '../components/PasswordStrength.jsx';
import { NoteEditor } from '../components/NoteEditor.jsx';
import { plainToEditorHtml } from '../lib/noteFormat.js';
import {
  getConnection,
  saveConnection,
  testMoneybirdConnection,
  importKostenVanuitMoneybird,
  syncContactenMetMoneybird,
  saveSnelStartConnection,
  testSnelStartConnection,
  importKostenVanuitSnelStart,
  syncContactenMetSnelStart,
  saveAfasConnection,
  testAfasConnection,
  setAfasConnected,
  importKostenVanuitAfas,
  syncContactenMetAfas,
} from '../services/accountingService.js';

const ALL_TEMPLATE_CONFIGS = [
  { type: 'offerte', label: 'Offerte', vars: ['klant_naam','bedrijfsnaam','offerte_nummer','totaal_bedrag','vervaldatum','link'], showAutoToggle: false, showAutoDagen: false },
  { type: 'offerte_geaccepteerd', label: 'Offerte geaccepteerd', vars: ['klant_naam','bedrijfsnaam','offerte_nummer'], showAutoToggle: true, showAutoDagen: false },
  { type: 'factuur', label: 'Factuur', vars: ['klant_naam','bedrijfsnaam','factuur_nummer','totaal_bedrag','vervaldatum','betaalinstructie'], showAutoToggle: false, showAutoDagen: false },
  { type: 'herinnering_1', label: 'Herinnering 1', vars: ['klant_naam','bedrijfsnaam','factuur_nummer','totaal_bedrag','vervaldatum'], showAutoToggle: true, showAutoDagen: true, dagenLabel: 'dagen na vervaldatum' },
  { type: 'herinnering_2', label: 'Herinnering 2', vars: ['klant_naam','bedrijfsnaam','factuur_nummer','totaal_bedrag','vervaldatum'], showAutoToggle: true, showAutoDagen: true, dagenLabel: 'dagen na vervaldatum' },
  { type: 'aanvraag_ontvangen', label: 'Aanvraag ontvangen', vars: ['klant_naam','bedrijfsnaam'], showAutoToggle: true, showAutoDagen: false },
  { type: 'welkom', label: 'Welkom', vars: ['klant_naam','bedrijfsnaam'], showAutoToggle: false, showAutoDagen: false },
  { type: 'afspraak_bevestiging', label: 'Afspraak bevestiging', vars: ['klant_naam','bedrijfsnaam','afspraak_datum','afspraak_tijd'], showAutoToggle: true, showAutoDagen: false },
  { type: 'afspraak_herinnering', label: 'Afspraak herinnering', vars: ['klant_naam','bedrijfsnaam','afspraak_datum','afspraak_tijd'], showAutoToggle: true, showAutoDagen: true, dagenLabel: 'dag(en) voor afspraak' },
];

const STANDARD_TYPES = new Set(ALL_TEMPLATE_CONFIGS.map(c => c.type));
const NEW_TEMPLATE_VARS = ['klant_naam','bedrijfsnaam','factuur_nummer','offerte_nummer','totaal_bedrag','vervaldatum','afspraak_datum','afspraak_tijd','link'];

const DEFAULT_BODY = {
  offerte: 'Beste {{klant_naam}},\n\nHierbij sturen wij u offerte {{offerte_nummer}} toe.\n\nTotaalbedrag: {{totaal_bedrag}}\nGeldig tot: {{vervaldatum}}\n\nVia onderstaande link kunt u de offerte bekijken en digitaal ondertekenen:\n{{link}}\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  offerte_geaccepteerd: 'Beste {{klant_naam}},\n\nHartelijk dank! Uw offerte {{offerte_nummer}} is succesvol ondertekend.\n\nWij gaan zo snel mogelijk voor u aan de slag. U ontvangt binnenkort meer informatie over de planning.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  factuur: 'Beste {{klant_naam}},\n\nHierbij ontvangt u factuur {{factuur_nummer}} van {{bedrijfsnaam}}.\n\nTotaalbedrag: {{totaal_bedrag}}\nBetaaltermijn: {{vervaldatum}}\n\n{{betaalinstructie}}\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  herinnering_1: 'Beste {{klant_naam}},\n\nWij willen u vriendelijk herinneren dat factuur {{factuur_nummer}} nog openstaat.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nMocht u dit bedrag reeds hebben overgemaakt, dan kunt u deze herinnering als niet verzonden beschouwen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  herinnering_2: 'Beste {{klant_naam}},\n\nDit is een tweede herinnering voor factuur {{factuur_nummer}}, welke reeds is vervallen.\n\nTotaalbedrag: {{totaal_bedrag}}\nVervaldatum was: {{vervaldatum}}\n\nWij verzoeken u dringend dit bedrag zo spoedig mogelijk te voldoen.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  aanvraag_ontvangen: 'Beste {{klant_naam}},\n\nBedankt voor uw aanvraag! Wij hebben uw bericht ontvangen en nemen zo spoedig mogelijk contact met u op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  welkom: 'Beste {{klant_naam}},\n\nWelkom bij {{bedrijfsnaam}}! Wij zijn blij u als nieuwe klant te mogen verwelkomen.\n\nHeeft u vragen? Neem gerust contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  afspraak_bevestiging: 'Beste {{klant_naam}},\n\nHierbij bevestigen wij uw afspraak.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nMocht u de afspraak willen verzetten, neem dan tijdig contact met ons op.\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
  afspraak_herinnering: 'Beste {{klant_naam}},\n\nDit is een herinnering voor uw afspraak van morgen.\n\nDatum: {{afspraak_datum}}\nTijdstip: {{afspraak_tijd}}\n\nWij zien u graag tegemoet!\n\nMet vriendelijke groet,\n{{bedrijfsnaam}}',
};

const DEFAULT_STAGE_COLOR = '#6b7280'; // Grijs

// Kleurkiezer voor pipeline-fases: kleurvakje + naam, één keuze uit de vaste set.
function ColorSwatchPicker({ value, onChange }) {
  const current = stageColToHex(value);
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
      {STAGE_COLOR_OPTIONS.map(c => {
        const selected = current.toLowerCase() === c.value.toLowerCase();
        return (
          <button
            key={c.value}
            type="button"
            onClick={() => onChange(c.value)}
            title={c.label}
            aria-pressed={selected}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 6,
              padding: '4px 9px', borderRadius: 8, cursor: 'pointer',
              border: selected ? '2px solid var(--dk)' : '1px solid var(--border)',
              background: selected ? 'var(--bgs)' : '#fff',
              fontSize: 12.5, fontWeight: 600, color: 'var(--dk)', fontFamily: 'inherit',
            }}
          >
            <span style={{ width: 14, height: 14, borderRadius: 4, background: c.value, flexShrink: 0 }} />
            {c.label}
          </button>
        );
      })}
    </div>
  );
}

// Alle mogelijke tab-ids (permissie-onafhankelijk) — weert onbekende ?tab=-waarden.
const SETTINGS_TAB_IDS = ['profiel', 'bedrijf', 'standaard', 'templates', 'pipeline', 'voertuigen', 'integraties'];

export function InstellingenPage() {
  const toast = useToast();
  const { company, refresh, profile } = useProfile();
  const tier = useTier();
  const { can } = usePermissions();
  const { startUpload } = useUploads();
  const isAdmin = profile?.role === 'admin';
  // Bedrijfsinstellingen-tabs zijn voor admins (of medewerkers met het recht);
  // iedereen kan z'n eigen "Mijn profiel" beheren (incl. account verwijderen).
  const canCompanySettings = can('instellingen');

  // Actieve tab in de URL (?tab=…) zodat een refresh/terugkeer op dezelfde tab
  // landt. Bij terugkeer uit de Stripe-onboarding zet de return-URL een
  // De actieve tab staat in de URL (?tab=<id>). Zo landt de Stripe-return
  // (…/dashboard/instellingen?tab=integraties) meteen op de Integraties-tab.
  const [tab, setTab] = useUrlTab('profiel', { validIds: SETTINGS_TAB_IDS });
  const [loading, setLoading] = useState(true);

  // Eigen profiel — naam bewerken
  const [naam, setNaam] = useState('');
  const [savingNaam, setSavingNaam] = useState(false);

  // Eigen profiel — wachtwoord wijzigen
  const [pwOpen, setPwOpen] = useState(false);
  const [pwForm, setPwForm] = useState({ current: '', next: '', next2: '' });
  const [savingPw, setSavingPw] = useState(false);
  const [delOpen, setDelOpen] = useState(false);
  const [delConfirm, setDelConfirm] = useState('');
  const [deleting, setDeleting] = useState(false);
  const setPw = (k, v) => setPwForm(f => ({ ...f, [k]: v }));

  // Bedrijfsprofiel
  const [bedrijfForm, setBedrijfForm] = useState({
    name: '', email: '', phone: '', kvk: '', btw_number: '',
    address: '', city: '', postal_code: '', website: '', branding_color: '#1DDB62',
  });
  const [savingBedrijf, setSavingBedrijf] = useState(false);
  const [logoUploading, setLogoUploading] = useState(false);

  // Standaardwaarden
  const [standaardForm, setStandaardForm] = useState({
    uurtarief: 55,
    reiskosten_per_km: 0.23,
    btw_pct: 21,
    offerte_geldig_dagen: 14,
    uren_herinnering_interval_min: 60,
  });
  const [savingStandaard, setSavingStandaard] = useState(false);

  // Eigen prijzen / eenheden
  const [eenheden, setEenheden] = useState([]);
  const [eenheidForm, setEenheidForm] = useState(null); // {id?, naam, standaard_prijs, eenheid_label, btw_pct}
  const [savingEenheid, setSavingEenheid] = useState(false);

  // E-mailtemplates
  const [templates, setTemplates] = useState([]);
  const [templateForms, setTemplateForms] = useState({});
  const [savingTemplate, setSavingTemplate] = useState({});
  // Sub-tab binnen E-mailtemplates — ook in de URL (?sub=…) zodat een refresh
  // op hetzelfde template-type blijft.
  const [activeTemplateType, setActiveTemplateType] = useUrlTab('offerte', { param: 'sub' });
  const bodyRef = useRef(null);
  const newBodyRef = useRef(null);
  const [showNewTemplate, setShowNewTemplate] = useState(false);
  const [newTemplateForm, setNewTemplateForm] = useState({ naam: '', type: '', onderwerp: '', body: '' });
  const [creatingTemplate, setCreatingTemplate] = useState(false);

  // Pipeline stages
  const [stages, setStages] = useState([]);
  const [showNewStage, setShowNewStage] = useState(false);
  const [newStageForm, setNewStageForm] = useState({ name: '', color_class: DEFAULT_STAGE_COLOR });
  const [savingStage, setSavingStage] = useState(false);
  const [editingStageId, setEditingStageId] = useState(null);
  const [editingStageValue, setEditingStageValue] = useState('');
  const [editingStageColor, setEditingStageColor] = useState(DEFAULT_STAGE_COLOR);

  // Verloren-redenen (company-scoped instelbare lijst)
  const [lostReasons, setLostReasons] = useState([]);
  const [showNewReason, setShowNewReason] = useState(false);
  const [newReasonValue, setNewReasonValue] = useState('');
  const [savingReason, setSavingReason] = useState(false);
  const [editingReasonId, setEditingReasonId] = useState(null);
  const [editingReasonValue, setEditingReasonValue] = useState('');

  // Integraties
  // TODO: replace with real OAuth flow when Google API credentials are configured
  const [googleConnected, setGoogleConnected] = useState(false);

  // Moneybird
  const [mbConnection, setMbConnection] = useState(null);
  const [mbForm, setMbForm] = useState({ apiToken: '', administrationId: '' });
  const [mbShowToken, setMbShowToken] = useState(false);
  const [mbEditing, setMbEditing] = useState(false);
  const [mbTesting, setMbTesting] = useState(false);
  const [mbSaving, setMbSaving] = useState(false);
  const [mbImporting, setMbImporting] = useState(false);
  const [mbSyncingContacten, setMbSyncingContacten] = useState(false);

  // SnelStart
  const [ssConnection, setSsConnection] = useState(null);
  const [ssForm, setSsForm] = useState({ subscriptionKey: '', secondaryKey: '', administrationId: '' });
  const [ssEditing, setSsEditing] = useState(false);
  const [ssTesting, setSsTesting] = useState(false);
  const [ssSaving, setSsSaving] = useState(false);
  const [ssImporting, setSsImporting] = useState(false);
  const [ssSyncingContacten, setSsSyncingContacten] = useState(false);

  // Voertuigen
  const [voertuigen, setVoertuigen] = useState([]);
  const [showVoertuigForm, setShowVoertuigForm] = useState(false);
  const [newVoertuigForm, setNewVoertuigForm] = useState({ naam: '', kenteken: '', kleur: '#1DDB62' });
  const [savingVoertuig, setSavingVoertuig] = useState(false);
  const [editingVoertuigId, setEditingVoertuigId] = useState(null);
  const [editingVoertuigForm, setEditingVoertuigForm] = useState({});

  // AFAS
  const [afasConnection, setAfasConnection] = useState(null);
  const [afasForm, setAfasForm] = useState({ environmentId: '', token: '' });
  const [afasEditing, setAfasEditing] = useState(false);
  const [afasTesting, setAfasTesting] = useState(false);
  const [afasSaving, setAfasSaving] = useState(false);
  const [afasImporting, setAfasImporting] = useState(false);
  const [afasSyncingContacten, setAfasSyncingContacten] = useState(false);
  const [afasTested, setAfasTested] = useState(false);
  const [afasShowToken, setAfasShowToken] = useState(false);

  // Stripe Connect (tier-gated: alleen Groei/Team)
  const [stripeConn, setStripeConn] = useState(null);
  const [stripeBusy, setStripeBusy] = useState(false);
  const stripeAllowed = tier === 'groei' || tier === 'team';

  useEffect(() => {
    if (!canCompanySettings) return;
    getVoertuigen({ inclusiefInactief: true }).then(setVoertuigen).catch(() => {});
  }, [canCompanySettings]);

  // Stripe-koppeling laden. Zolang de koppeling nog niet actief is (bv. net terug
  // uit de onboarding) halen we de status live bij Stripe op, zodat de kaart direct
  // klopt en nooit blijft hangen op een verouderde status.
  useEffect(() => {
    if (!canCompanySettings || !stripeAllowed) return;
    let alive = true;
    getStripeConnection()
      .then(async conn => {
        if (!alive) return;
        setStripeConn(conn);
        if (conn?.accountId && !conn.chargesEnabled) {
          try { await refreshStripeStatus(); } catch { /* stil; kaart toont laatst bekende status */ }
          const fresh = await getStripeConnection().catch(() => conn);
          if (alive) setStripeConn(fresh);
        }
      })
      .catch(() => {});
    return () => { alive = false; };
  }, [canCompanySettings, stripeAllowed]);

  const handleStripeConnect = async () => {
    setStripeBusy(true);
    try {
      const url = await startStripeOnboarding();
      window.location.href = url; // redirect naar Stripe onboarding
    } catch (e) {
      toast.error(e.message || 'Koppelen mislukt');
      setStripeBusy(false);
    }
  };

  const handleStripeRefresh = async () => {
    setStripeBusy(true);
    try {
      await refreshStripeStatus();
      setStripeConn(await getStripeConnection());
    } catch (e) {
      toast.error(e.message || 'Status vernieuwen mislukt');
    } finally {
      setStripeBusy(false);
    }
  };

  const handleStripeDisconnect = async () => {
    if (!window.confirm('Stripe-koppeling ontkoppelen? Je account bij Stripe blijft bestaan.')) return;
    setStripeBusy(true);
    try {
      await disconnectStripe();
      setStripeConn(null);
      toast.success('Stripe ontkoppeld');
    } catch (e) {
      toast.error(e.message || 'Ontkoppelen mislukt');
    } finally {
      setStripeBusy(false);
    }
  };

  useEffect(() => {
    // Medewerkers zonder instellingen-recht zien alleen "Mijn profiel" — geen
    // bedrijfsdata of integratie-tokens laden.
    if (!canCompanySettings) { setLoading(false); return; }
    setLoading(true);
    getEigenEenheden().then(setEenheden).catch(() => {});
    getLostReasons().then(setLostReasons).catch(() => {});
    Promise.all([getBedrijfsinstellingen(), getEmailTemplates(), getPipelineStages(), getConnection(), getConnection('snelstart'), getConnection('afas')])
      .then(([instellingen, emailTemplates, pipelineStages, mbConn, ssConn, afasConn]) => {
        if (instellingen) {
          setStandaardForm({
            uurtarief: instellingen.uurtarief ?? 55,
            reiskosten_per_km: instellingen.reiskostenPerKm ?? 0.23,
            btw_pct: instellingen.btwPct ?? 21,
            offerte_geldig_dagen: instellingen.offerteGeldigDagen ?? 14,
            uren_herinnering_interval_min: instellingen.urenHerinneringIntervalMin ?? 60,
          });
        }
        setTemplates(emailTemplates);
        const forms = {};
        emailTemplates.forEach(t => {
          forms[t.id] = { onderwerp: t.onderwerp, body: plainToEditorHtml(t.body || ''), actief: t.actief, auto_versturen: Boolean(t.auto_versturen), auto_dagen: Number(t.auto_dagen ?? 7) };
        });
        setTemplateForms(forms);
        setStages(pipelineStages);
        // Tokens worden NOOIT geprefill: ze zijn server-side afgeschermd en niet
        // meer leesbaar. We tonen alleen de status; niet-geheime velden
        // (administratie/omgeving) mogen wel voor het gemak vooringevuld worden.
        if (mbConn) {
          setMbConnection(mbConn);
          setMbForm({ apiToken: '', administrationId: mbConn.administrationId });
        }
        if (ssConn) {
          setSsConnection(ssConn);
          setSsForm({ subscriptionKey: '', secondaryKey: '', administrationId: ssConn.administrationId });
        }
        if (afasConn) {
          setAfasConnection(afasConn);
          setAfasForm({ environmentId: afasConn.afasEnvironmentId, token: '' });
          if (afasConn.connected) setAfasTested(true);
        }
      })
      .catch(err => toast.error(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false));
  }, [canCompanySettings]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (company) {
      setBedrijfForm({
        name: company.name || '',
        email: company.email || '',
        reply_to_email: company.replyToEmail || '',
        phone: company.phone || '',
        kvk: company.kvk || '',
        btw_number: company.btwNumber || '',
        address: company.address || '',
        city: company.city || '',
        postal_code: company.postalCode || '',
        website: company.website || '',
        branding_color: company.brandingColor || '#1DDB62',
      });
    }
  }, [company]);

  const setBedrijf = (k, v) => setBedrijfForm(f => ({ ...f, [k]: v }));
  const setStandaard = (k, v) => setStandaardForm(f => ({ ...f, [k]: v }));
  const setTemplateField = (id, k, v) => setTemplateForms(f => ({ ...f, [id]: { ...f[id], [k]: v } }));

  const uploadLogo = (e) => {
    const file = e.target.files?.[0];
    const input = e.target;
    if (!file) return;
    input.value = '';
    if (file.size > 10 * 1024 * 1024) { toast.error('Maximum is 10MB'); return; }
    // SVG bewust NIET toegestaan: kan <script>/onload bevatten en zou als
    // actieve inhoud op een publieke storage-URL kunnen worden geopend.
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (!allowed.includes(file.type)) { toast.error('Alleen JPG, PNG en WebP zijn toegestaan'); return; }
    // Niet-blokkerend: upload + koppelen op de achtergrond via de upload-indicator.
    startUpload(file.name, async () => {
      const ext = file.name.split('.').pop().toLowerCase() || 'jpg';
      const path = `${company.id}/logo.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('bedrijf-logos')
        .upload(path, file, { upsert: true, contentType: file.type });
      if (uploadError) throw uploadError;
      const { data: { publicUrl } } = supabase.storage.from('bedrijf-logos').getPublicUrl(path);
      await updateCompany(company.id, { logo_url: publicUrl });
      await refresh();
    });
  };

  const saveBedrijf = async () => {
    if (!company?.id) return;
    if (bedrijfForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bedrijfForm.email)) {
      toast.error('E-mailadres heeft geen geldig formaat');
      return;
    }
    if (bedrijfForm.reply_to_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bedrijfForm.reply_to_email)) {
      toast.error('Antwoord e-mailadres heeft geen geldig formaat');
      return;
    }
    if (bedrijfForm.kvk && !/^\d{8}$/.test(bedrijfForm.kvk.trim())) {
      toast.error('KvK-nummer moet 8 cijfers bevatten');
      return;
    }
    setSavingBedrijf(true);
    try {
      await updateCompany(company.id, bedrijfForm);
      await refresh();
      toast.success('Bedrijfsprofiel opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingBedrijf(false);
    }
  };

  const saveStandaard = async () => {
    setSavingStandaard(true);
    try {
      await upsertBedrijfsinstellingen(standaardForm);
      toast.success('Standaardwaarden opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingStandaard(false);
    }
  };

  // ── Eigen prijzen / eenheden ──
  const newEenheid = () => setEenheidForm({ naam: '', standaard_prijs: '', eenheid_label: '', btw_pct: '' });
  const editEenheid = e => setEenheidForm({ id: e.id, naam: e.naam, standaard_prijs: e.standaardPrijs, eenheid_label: e.eenheidLabel, btw_pct: e.btwPct ?? '' });
  const setEenheidVal = (k, v) => setEenheidForm(f => ({ ...f, [k]: v }));

  const saveEenheid = async () => {
    if (!eenheidForm?.naam.trim()) { toast.error('Naam is verplicht'); return; }
    setSavingEenheid(true);
    try {
      if (eenheidForm.id) {
        const upd = await updateEigenEenheid(eenheidForm.id, eenheidForm);
        setEenheden(list => list.map(x => x.id === upd.id ? upd : x).sort((a, b) => a.naam.localeCompare(b.naam)));
      } else {
        const created = await createEigenEenheid(eenheidForm);
        setEenheden(list => [...list, created].sort((a, b) => a.naam.localeCompare(b.naam)));
      }
      setEenheidForm(null);
      toast.success('Eenheid opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingEenheid(false);
    }
  };

  const removeEenheid = async (id) => {
    if (!window.confirm('Deze eigen eenheid verwijderen? Bestaande offertes/facturen behouden hun bedrag.')) return;
    try {
      await deleteEigenEenheid(id);
      setEenheden(list => list.filter(x => x.id !== id));
      toast.success('Eenheid verwijderd');
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  const saveTemplate = async (templateId) => {
    setSavingTemplate(s => ({ ...s, [templateId]: true }));
    try {
      const form = templateForms[templateId];
      const updated = await updateEmailTemplate(templateId, {
        onderwerp: form.onderwerp,
        body: form.body,
        body_html: form.body,
        actief: form.actief,
        auto_versturen: form.auto_versturen,
        auto_dagen: form.auto_dagen,
      });
      setTemplates(ts => ts.map(t => t.id === templateId ? updated : t));
      setTemplateForms(f => ({ ...f, [templateId]: { onderwerp: updated.onderwerp, body: plainToEditorHtml(updated.body || ''), actief: updated.actief, auto_versturen: Boolean(updated.auto_versturen), auto_dagen: Number(updated.auto_dagen ?? 7) } }));
      toast.success('Template opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingTemplate(s => ({ ...s, [templateId]: false }));
    }
  };

  const insertVar = (varName, _templateId) => {
    if (bodyRef.current?.insertAtCursor) {
      bodyRef.current.insertAtCursor(`{{${varName}}}`);
    }
  };

  const slugify = str => str.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

  const handleCreateTemplate = async () => {
    if (!newTemplateForm.naam.trim()) { toast.error('Naam is verplicht'); return; }
    const slug = newTemplateForm.type.trim() || slugify(newTemplateForm.naam);
    if (!slug) { toast.error('Type/slug is verplicht'); return; }
    if (STANDARD_TYPES.has(slug)) { toast.error('Dit type is al een standaard template'); return; }
    if (templates.some(t => t.type === slug)) { toast.error('Een template met dit type bestaat al'); return; }
    setCreatingTemplate(true);
    try {
      const created = await createEmailTemplate({
        type: slug,
        name: newTemplateForm.naam.trim(),
        onderwerp: newTemplateForm.onderwerp,
        body: newTemplateForm.body,
      });
      setTemplates(ts => [...ts, created]);
      setTemplateForms(f => ({ ...f, [created.id]: { onderwerp: created.onderwerp, body: plainToEditorHtml(created.body || ''), actief: created.actief, auto_versturen: false, auto_dagen: 7 } }));
      setActiveTemplateType(created.type);
      setShowNewTemplate(false);
      setNewTemplateForm({ naam: '', type: '', onderwerp: '', body: '' });
      toast.success('Template aangemaakt');
    } catch (err) {
      toast.error(err.message || 'Aanmaken mislukt');
    } finally {
      setCreatingTemplate(false);
    }
  };

  const handleDeleteTemplate = async (t) => {
    if (!confirm(`Template "${t.name || t.type}" verwijderen? Dit kan niet ongedaan worden gemaakt.`)) return;
    try {
      await deleteEmailTemplate(t.id);
      const remaining = templates.filter(x => x.id !== t.id);
      setTemplates(remaining);
      setTemplateForms(f => { const next = { ...f }; delete next[t.id]; return next; });
      if (activeTemplateType === t.type) {
        const fallback = ALL_TEMPLATE_CONFIGS.find(c => remaining.some(r => r.type === c.type));
        setActiveTemplateType(fallback?.type || remaining[0]?.type || 'offerte');
      }
      toast.success('Template verwijderd');
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  const handleCreateStage = async () => {
    if (!newStageForm.name.trim()) return;
    setSavingStage(true);
    try {
      const created = await createPipelineStage(newStageForm);
      setStages(s => [...s, created]);
      setNewStageForm({ name: '', color_class: DEFAULT_STAGE_COLOR });
      setShowNewStage(false);
      toast.success('Fase aangemaakt');
    } catch (err) {
      toast.error(err.message || 'Aanmaken mislukt');
    } finally {
      setSavingStage(false);
    }
  };

  const handleDeleteStage = async (id) => {
    if (!window.confirm('Fase verwijderen? Dit kan niet ongedaan worden gemaakt.')) return;
    try {
      await deletePipelineStage(id);
      setStages(s => s.filter(st => st.id !== id));
      toast.success('Fase verwijderd');
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  const startEditStage = (stage) => {
    setEditingStageId(stage.id);
    setEditingStageValue(stage.name);
    setEditingStageColor(stageColToHex(stage.colorClass));
  };

  const saveEditStage = async (id) => {
    if (!editingStageValue.trim()) { setEditingStageId(null); return; }
    try {
      const updated = await updatePipelineStage(id, {
        name: editingStageValue.trim(),
        color_class: editingStageColor,
      });
      setStages(s => s.map(st => st.id === id ? updated : st));
      toast.success('Fase bijgewerkt');
    } catch (err) {
      toast.error(err.message || 'Bijwerken mislukt');
    } finally {
      setEditingStageId(null);
      setEditingStageValue('');
      setEditingStageColor(DEFAULT_STAGE_COLOR);
    }
  };

  // ── Verloren-redenen ──────────────────────────────────────────────────────
  const handleCreateReason = async () => {
    if (!newReasonValue.trim()) return;
    setSavingReason(true);
    try {
      const created = await createLostReason({ label: newReasonValue });
      setLostReasons(s => [...s, created]);
      setNewReasonValue('');
      setShowNewReason(false);
      toast.success('Reden aangemaakt');
    } catch (err) {
      toast.error(err.message || 'Aanmaken mislukt');
    } finally {
      setSavingReason(false);
    }
  };

  const handleDeleteReason = async (id) => {
    if (!window.confirm('Verloren-reden verwijderen? Bestaande leads met deze reden behouden hun opgeslagen tekst.')) return;
    try {
      await deleteLostReason(id);
      setLostReasons(s => s.filter(r => r.id !== id));
      toast.success('Reden verwijderd');
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  const startEditReason = (reason) => {
    setEditingReasonId(reason.id);
    setEditingReasonValue(reason.label);
  };

  const saveEditReason = async (id) => {
    if (!editingReasonValue.trim()) { setEditingReasonId(null); return; }
    try {
      const updated = await updateLostReason(id, { label: editingReasonValue.trim() });
      setLostReasons(s => s.map(r => r.id === id ? updated : r));
      toast.success('Reden bijgewerkt');
    } catch (err) {
      toast.error(err.message || 'Bijwerken mislukt');
    } finally {
      setEditingReasonId(null);
      setEditingReasonValue('');
    }
  };

  const handleMbTest = async () => {
    if (!mbForm.apiToken || !mbForm.administrationId) {
      toast.error('Vul API token en administratie-ID in');
      return;
    }
    setMbTesting(true);
    try {
      const result = await testMoneybirdConnection(mbForm.apiToken, mbForm.administrationId);
      if (result?.success) {
        toast.success('Verbinding met Moneybird gelukt');
      } else {
        toast.error(result?.error || 'Verbinding mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Verbinding mislukt');
    } finally {
      setMbTesting(false);
    }
  };

  const handleMbSave = async () => {
    if (!mbForm.apiToken || !mbForm.administrationId) {
      toast.error('Vul API token en administratie-ID in');
      return;
    }
    setMbSaving(true);
    try {
      const saved = await saveConnection(mbForm);
      setMbConnection(saved);
      setMbEditing(false);
      toast.success('Moneybird-koppeling opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setMbSaving(false);
    }
  };

  const handleMbImport = async () => {
    setMbImporting(true);
    try {
      const result = await importKostenVanuitMoneybird();
      if (result?.success) {
        const imp = result.imported;
        if (imp && typeof imp === 'object') {
          const total = (imp.inkoopfacturen || 0) + (imp.bonnetjes || 0) + (imp.mutaties || 0) + (imp.verkoopfacturen || 0);
          toast.success(`${total} items geïmporteerd (${imp.inkoopfacturen || 0} facturen, ${imp.bonnetjes || 0} bonnetjes, ${imp.mutaties || 0} mutaties, ${imp.verkoopfacturen || 0} verkoopfacturen)`);
        } else {
          toast.success(`${imp ?? 0} items geïmporteerd`);
        }
        const refreshed = await getConnection();
        if (refreshed) setMbConnection(refreshed);
      } else {
        toast.error(result?.error || 'Importeren mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Importeren mislukt');
    } finally {
      setMbImporting(false);
    }
  };

  const handleMbSyncContacten = async () => {
    setMbSyncingContacten(true);
    try {
      const result = await syncContactenMetMoneybird();
      if (result?.success) {
        toast.success(`${result.imported ?? 0} klanten geïmporteerd, ${result.exported ?? 0} geëxporteerd`);
      } else {
        toast.error(result?.error || 'Synchronisatie mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Synchronisatie mislukt');
    } finally {
      setMbSyncingContacten(false);
    }
  };

  const handleSsTest = async () => {
    if (!ssForm.subscriptionKey || !ssForm.secondaryKey) {
      toast.error('Vul abonnementssleutel en maatwerksleutel in');
      return;
    }
    setSsTesting(true);
    try {
      const result = await testSnelStartConnection(ssForm.subscriptionKey, ssForm.secondaryKey);
      if (result?.success) {
        toast.success('Verbinding met SnelStart gelukt');
      } else {
        toast.error(result?.error || 'Verbinding mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Verbinding mislukt');
    } finally {
      setSsTesting(false);
    }
  };

  const handleSsSave = async () => {
    if (!ssForm.subscriptionKey || !ssForm.secondaryKey) {
      toast.error('Vul abonnementssleutel en maatwerksleutel in');
      return;
    }
    setSsSaving(true);
    try {
      const saved = await saveSnelStartConnection(ssForm);
      setSsConnection(saved);
      setSsEditing(false);
      toast.success('SnelStart-koppeling opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSsSaving(false);
    }
  };

  const handleSsImport = async () => {
    setSsImporting(true);
    try {
      const result = await importKostenVanuitSnelStart();
      if (result?.success) {
        const imp = result.imported;
        const total = typeof imp === 'object' ? (imp.inkoopboekingen || 0) : (imp ?? 0);
        toast.success(`${total} inkoopboekingen geïmporteerd`);
        const refreshed = await getConnection('snelstart');
        if (refreshed) setSsConnection(refreshed);
      } else {
        toast.error(result?.error || 'Importeren mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Importeren mislukt');
    } finally {
      setSsImporting(false);
    }
  };

  const handleSsSyncContacten = async () => {
    setSsSyncingContacten(true);
    try {
      const result = await syncContactenMetSnelStart();
      if (result?.success) {
        toast.success(`${result.imported ?? 0} contacten gesynchroniseerd`);
      } else {
        toast.error(result?.error || 'Synchroniseren mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Synchroniseren mislukt');
    } finally {
      setSsSyncingContacten(false);
    }
  };

  const handleAfasTest = async () => {
    if (!afasForm.environmentId || !afasForm.token) {
      toast.error('Vul Omgevings-ID en App token in');
      return;
    }
    setAfasTesting(true);
    try {
      const result = await testAfasConnection(afasForm.environmentId, afasForm.token);
      if (result?.success) {
        setAfasTested(true);
        setAfasConnected(true).catch(() => {});
        toast.success('Verbinding met AFAS gelukt');
      } else {
        toast.error(result?.error || 'Verbinding mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Verbinding mislukt');
    } finally {
      setAfasTesting(false);
    }
  };

  const handleAfasSave = async () => {
    if (!afasForm.environmentId || !afasForm.token) {
      toast.error('Vul Omgevings-ID en App token in');
      return;
    }
    setAfasSaving(true);
    try {
      const saved = await saveAfasConnection(afasForm);
      setAfasConnection(saved);
      setAfasEditing(false);
      toast.success('AFAS-koppeling opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setAfasSaving(false);
    }
  };

  const handleAfasImport = async () => {
    setAfasImporting(true);
    try {
      const result = await importKostenVanuitAfas();
      if (result?.success) {
        toast.success(`${result.imported ?? 0} kosten geïmporteerd`);
        const refreshed = await getConnection('afas');
        if (refreshed) setAfasConnection(refreshed);
      } else {
        toast.error(result?.error || 'Importeren mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Importeren mislukt');
    } finally {
      setAfasImporting(false);
    }
  };

  const handleAfasSyncContacten = async () => {
    setAfasSyncingContacten(true);
    try {
      const result = await syncContactenMetAfas();
      if (result?.success) {
        const parts = [];
        if ((result.importedFromAfas ?? 0) > 0) parts.push(`${result.importedFromAfas} geïmporteerd uit AFAS`);
        if ((result.exportedToAfas ?? 0) > 0) parts.push(`${result.exportedToAfas} geëxporteerd naar AFAS`);
        if ((result.exportFailures ?? 0) > 0) parts.push(`${result.exportFailures} export mislukt (schrijfrechten)`);
        if (parts.length === 0) parts.push('Niets te synchroniseren');
        toast.success(parts.join(' · '));
      } else {
        toast.error(result?.error || 'Synchroniseren mislukt');
      }
    } catch (err) {
      toast.error(err.message || 'Synchroniseren mislukt');
    } finally {
      setAfasSyncingContacten(false);
    }
  };

  const TABS = [
    { id: 'profiel', label: 'Mijn profiel' },
    ...(canCompanySettings ? [
      { id: 'bedrijf', label: 'Bedrijfsprofiel' },
      { id: 'standaard', label: 'Standaardwaarden' },
      { id: 'templates', label: 'E-mailtemplates' },
      { id: 'pipeline', label: 'Pipeline' },
      ...(isAdmin ? [{ id: 'voertuigen', label: 'Voertuigen' }] : []),
      { id: 'integraties', label: 'Integraties' },
    ] : []),
  ];

  const handleProfileAvatarUpload = (file) => {
    if (!profile?.id || !profile?.companyId) {
      toast.error('Profiel niet beschikbaar — log opnieuw in');
      return;
    }
    // AvatarUpload toont meteen een lokale preview; de echte upload draait op
    // de achtergrond via de globale upload-indicator.
    startUpload(file.name || 'Profielfoto', async () => {
      await uploadProfileAvatar({
        profileId: profile.id,
        companyId: profile.companyId,
        file,
        previousUrl: profile.avatarUrl,
      });
      await refresh();
    });
  };

  const handleProfileAvatarRemove = async () => {
    if (!profile?.id) return;
    await removeProfileAvatar({ profileId: profile.id, previousUrl: profile.avatarUrl });
    await refresh();
    toast.success('Profielfoto verwijderd');
  };

  // Houd het naam-veld in sync met het geladen profiel.
  useEffect(() => { setNaam(profile?.fullName || ''); }, [profile?.fullName]);

  const naamGewijzigd = naam.trim() !== (profile?.fullName || '').trim();

  const handleSaveNaam = async () => {
    if (!profile?.id) { toast.error('Profiel niet beschikbaar — log opnieuw in'); return; }
    const nieuw = naam.trim();
    if (!nieuw) { toast.error('Naam mag niet leeg zijn'); return; }
    setSavingNaam(true);
    try {
      await updateProfile(profile.id, { full_name: nieuw });
      await refresh();
      toast.success('Naam opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingNaam(false);
    }
  };

  const pwKanOpslaan = pwForm.current.length > 0
    && passwordValid(pwForm.next)
    && pwForm.next === pwForm.next2;

  const handleChangePassword = async () => {
    if (!pwKanOpslaan) return;
    setSavingPw(true);
    try {
      await changePassword(pwForm.current, pwForm.next);
      toast.success('Wachtwoord gewijzigd');
      setPwForm({ current: '', next: '', next2: '' });
      setPwOpen(false);
    } catch (err) {
      toast.error(err.message || 'Wachtwoord wijzigen mislukt');
    } finally {
      setSavingPw(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (delConfirm.trim().toUpperCase() !== 'VERWIJDEREN') return;
    setDeleting(true);
    try {
      if (isAdmin) await cancelCompanyAccount();
      else await deleteOwnAccount();
      toast.success('Je account is verwijderd. Je kunt binnen 2 jaar terugkeren door contact op te nemen.');
      // Uitloggen → onAuthStateChange in App.jsx redirect naar /login.
      await supabase.auth.signOut();
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
      setDeleting(false);
    }
  };

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1>Instellingen</h1>
          <p>Beheer je bedrijfsprofiel, standaardwaarden en integraties</p>
        </div>
      </div>

      <div className="tabs afu2" style={{ marginBottom: 20 }}>
        {TABS.map(t => (
          <button key={t.id} className={`tab${tab === t.id ? ' active' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>

      {loading && (
        <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>
      )}

      {!loading && tab === 'profiel' && (
        <div className="card card-p afu3">
          <div className="card-hd" style={{ marginBottom: 'var(--sp-5)' }}>
            <div className="card-title">Mijn profiel</div>
            <div className="card-sub">Beheer je naam, profielfoto en wachtwoord</div>
          </div>

          {/* Identiteit — avatar links, naam + e-mail ernaast */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--sp-5)', flexWrap: 'wrap' }}>
            <AvatarUpload
              src={profile?.avatarUrl}
              name={profile?.fullName || profile?.email}
              size="xl"
              onUpload={handleProfileAvatarUpload}
              onRemove={profile?.avatarUrl ? handleProfileAvatarRemove : null}
              helperText="JPG, PNG of WEBP"
            />
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--dk)', letterSpacing: '-.01em', wordBreak: 'break-word' }}>
                {profile?.fullName || 'Geen naam ingesteld'}
              </div>
              <div style={{ fontSize: '.84rem', color: 'var(--dl)', marginTop: 2, wordBreak: 'break-all' }}>
                {profile?.email || ''}
              </div>
              {profile?.role && (
                <div style={{ fontSize: '.74rem', color: 'var(--dl)', marginTop: 6, textTransform: 'capitalize' }}>
                  {profile.role}
                </div>
              )}
            </div>
          </div>

          {/* Persoonsgegevens */}
          <div style={{ marginTop: 'var(--sp-6)', paddingTop: 'var(--sp-5)', borderTop: '1px solid var(--border)' }}>
            <div className="label" style={{ marginBottom: 'var(--sp-3)' }}>Persoonsgegevens</div>
            <div className="fg">
              <div className="f s2">
                <label>Naam</label>
                <div style={{ display: 'flex', gap: 'var(--sp-2)', alignItems: 'stretch' }}>
                  <input
                    style={{ flex: 1, minWidth: 0 }}
                    value={naam}
                    onChange={e => setNaam(e.target.value)}
                    placeholder="Je volledige naam"
                    onKeyDown={e => { if (e.key === 'Enter' && naamGewijzigd && naam.trim()) handleSaveNaam(); }}
                  />
                  <button
                    className="btn btn-p"
                    style={{ flexShrink: 0 }}
                    disabled={savingNaam || !naamGewijzigd || !naam.trim()}
                    onClick={handleSaveNaam}
                  >
                    {savingNaam ? 'Opslaan…' : 'Opslaan'}
                  </button>
                </div>
              </div>
              <div className="f">
                <label>E-mailadres</label>
                <input value={profile?.email || ''} disabled />
                <div style={{ fontSize: '.72rem', color: 'var(--dl)', marginTop: 4 }}>
                  Je e-mailadres kan niet worden gewijzigd.
                </div>
              </div>
              <div className="f">
                <label>Rol</label>
                <input value={profile?.role || ''} disabled style={{ textTransform: 'capitalize' }} />
              </div>
            </div>
          </div>

          {/* Wachtwoord */}
          <div style={{ marginTop: 'var(--sp-6)', paddingTop: 'var(--sp-5)', borderTop: '1px solid var(--border)' }}>
            <div className="label" style={{ marginBottom: 'var(--sp-3)' }}>Wachtwoord</div>
            {!pwOpen ? (
              <button className="btn btn-s" onClick={() => setPwOpen(true)}>Wachtwoord wijzigen</button>
            ) : (
              <div className="fg">
                <div className="f s2">
                  <label>Huidig wachtwoord</label>
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={pwForm.current}
                    onChange={e => setPw('current', e.target.value)}
                    placeholder="Je huidige wachtwoord"
                  />
                </div>
                <div className="f">
                  <label>Nieuw wachtwoord</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={pwForm.next}
                    onChange={e => setPw('next', e.target.value)}
                    placeholder="Nieuw wachtwoord"
                  />
                  <PasswordRequirements password={pwForm.next} />
                </div>
                <div className="f">
                  <label>Herhaal nieuw wachtwoord</label>
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={pwForm.next2}
                    onChange={e => setPw('next2', e.target.value)}
                    placeholder="Herhaal nieuw wachtwoord"
                  />
                  <PasswordMatch password={pwForm.next} password2={pwForm.next2} />
                </div>
                <div className="f s2" style={{ flexDirection: 'row', justifyContent: 'flex-end', gap: 'var(--sp-2)' }}>
                  <button
                    className="btn btn-ghost"
                    disabled={savingPw}
                    onClick={() => { setPwOpen(false); setPwForm({ current: '', next: '', next2: '' }); }}
                  >
                    Annuleren
                  </button>
                  <button
                    className="btn btn-p"
                    disabled={!pwKanOpslaan || savingPw}
                    onClick={handleChangePassword}
                  >
                    {savingPw ? 'Wijzigen…' : 'Wachtwoord wijzigen'}
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* Overig */}
          <div style={{ marginTop: 'var(--sp-6)', paddingTop: 'var(--sp-5)', borderTop: '1px solid var(--border)' }}>
            <button
              type="button"
              onClick={openCookieBanner}
              style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--pd)', fontWeight: 600, fontSize: '.84rem', textDecoration: 'underline' }}
            >
              Cookievoorkeuren wijzigen
            </button>
          </div>

          {/* ── Gevarenzone: account verwijderen ── */}
          <div style={{ marginTop: 'var(--sp-6)', paddingTop: 'var(--sp-5)', borderTop: '1px solid #fecaca' }}>
            <div className="label" style={{ marginBottom: 'var(--sp-2)', color: '#b91c1c' }}>Gevarenzone</div>
            <p style={{ fontSize: '.82rem', color: 'var(--dl)', lineHeight: 1.5, marginBottom: 'var(--sp-3)', maxWidth: 560 }}>
              {isAdmin
                ? 'Je bent beheerder. Je account verwijderen zegt het hele bedrijf op: alle teamleden verliezen toegang en alle bedrijfsgegevens worden gedeactiveerd.'
                : 'Je verwijdert alleen je eigen account uit het team. Je verliest direct toegang.'}
            </p>
            <button
              type="button"
              onClick={() => { setDelConfirm(''); setDelOpen(true); }}
              style={{ background: 'none', border: '1px solid #fecaca', borderRadius: 'var(--r8)', padding: '7px 14px', cursor: 'pointer', color: '#b91c1c', fontWeight: 600, fontSize: '.84rem' }}
            >
              Account verwijderen
            </button>
          </div>

          {delOpen && (
            <div className="overlay" onClick={e => e.target === e.currentTarget && !deleting && setDelOpen(false)}>
              <div className="modal">
                <div className="modal-hd">
                  <div>
                    <div className="modal-title">{isAdmin ? 'Bedrijf opzeggen' : 'Account verwijderen'}</div>
                    <div className="modal-sub">Lees dit goed door — deze actie heeft gevolgen.</div>
                  </div>
                  <ModalX onClose={() => !deleting && setDelOpen(false)} />
                </div>
                <div style={{ padding: '4px 24px 8px', display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {isAdmin && (
                    <div style={{ background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 'var(--r8)', padding: '10px 12px', fontSize: '.84rem', color: '#991b1b' }}>
                      Let op: je bent beheerder. Hiermee zeg je het <strong>hele bedrijf</strong> op. Alle teamleden verliezen direct toegang.
                    </div>
                  )}
                  <p style={{ fontSize: '.86rem', color: 'var(--dk)', lineHeight: 1.55, margin: 0 }}>
                    Je account wordt gedeactiveerd en je wordt uitgelogd. Je gegevens blijven <strong>2 jaar</strong> bewaard
                    zodat je kunt terugkeren. Financiële administratie (facturen, BTW) bewaren we wettelijk <strong>7 jaar</strong>.
                    Na deze termijnen worden gegevens definitief verwijderd.
                  </p>
                  <div className="f">
                    <label>Typ <strong>VERWIJDEREN</strong> om te bevestigen</label>
                    <input
                      type="text"
                      value={delConfirm}
                      onChange={e => setDelConfirm(e.target.value)}
                      placeholder="VERWIJDEREN"
                      autoFocus
                      disabled={deleting}
                    />
                  </div>
                </div>
                <div className="fa">
                  <button className="btn btn-ghost" onClick={() => setDelOpen(false)} disabled={deleting}>Annuleren</button>
                  <button
                    className="btn btn-danger"
                    onClick={handleDeleteAccount}
                    disabled={deleting || delConfirm.trim().toUpperCase() !== 'VERWIJDEREN'}
                  >
                    {deleting ? 'Verwijderen…' : (isAdmin ? 'Bedrijf definitief opzeggen' : 'Account definitief verwijderen')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && tab === 'bedrijf' && (
        <div className="card card-p afu3">
          <div className="card-hd" style={{ marginBottom: 18 }}>
            <div className="card-title">Bedrijfsprofiel</div>
            <div className="card-sub">Basisinformatie van je bedrijf</div>
          </div>
          <div style={{ marginBottom: 20 }}>
            <div style={{ fontSize: '.78rem', fontWeight: 600, color: 'var(--dl)', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: 10 }}>Bedrijfslogo</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              {company?.logoUrl ? (
                <div style={{ width: 120, height: 80, borderRadius: 8, border: '1px solid var(--br)', background: '#fff', padding: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <img src={company.logoUrl} alt="Bedrijfslogo" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                </div>
              ) : (
                <div style={{ width: 120, height: 80, borderRadius: 8, border: '2px dashed var(--bstrong)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, color: 'var(--dl)', textAlign: 'center', flexShrink: 0 }}>
                  Geen logo
                </div>
              )}
              <div>
                <label style={{ cursor: logoUploading ? 'default' : 'pointer' }}>
                  <input type="file" accept="image/jpeg,image/png,image/webp" style={{ display: 'none' }} onChange={uploadLogo} disabled={logoUploading} />
                  <span className="btn btn-ghost" style={{ pointerEvents: logoUploading ? 'none' : 'auto', opacity: logoUploading ? 0.6 : 1 }}>
                    {logoUploading ? 'Uploaden...' : 'Logo uploaden'}
                  </span>
                </label>
                <div style={{ fontSize: 11, color: 'var(--dl)', marginTop: 4 }}>Max 10MB · JPG, PNG, SVG</div>
              </div>
            </div>
          </div>
          <div className="f" style={{ marginBottom: 20 }}>
            <label>Merkkleur</label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div
                onClick={() => document.getElementById('branding-color-input').click()}
                style={{
                  position: 'relative', width: 40, height: 40, borderRadius: 8, flexShrink: 0,
                  background: /^#([0-9a-f]{3}){1,2}$/i.test(bedrijfForm.branding_color) ? bedrijfForm.branding_color : '#1DDB62',
                  border: '1px solid #e5e7eb', cursor: 'pointer', transition: 'box-shadow .15s',
                }}
                onMouseEnter={e => e.currentTarget.style.boxShadow = '0 2px 8px rgba(0,0,0,.15)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow = 'none'}
              >
                <input
                  id="branding-color-input"
                  type="color"
                  value={/^#([0-9a-f]{3}){1,2}$/i.test(bedrijfForm.branding_color) ? bedrijfForm.branding_color : '#1DDB62'}
                  onChange={e => setBedrijf('branding_color', e.target.value)}
                  style={{ opacity: 0, position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: 'pointer' }}
                />
              </div>
              <input
                type="text"
                value={bedrijfForm.branding_color}
                onChange={e => {
                  const v = e.target.value;
                  setBedrijf('branding_color', v);
                }}
                maxLength={7}
                placeholder="#1DDB62"
                style={{ width: 110, fontFamily: 'monospace' }}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--dmu)', marginTop: 5 }}>Gebruikt in offertes en facturen</div>
          </div>
          <div className="fg">
            <div className="f">
              <label>Bedrijfsnaam</label>
              <input value={bedrijfForm.name} onChange={e => setBedrijf('name', e.target.value)} placeholder="Nog niet ingevuld" />
            </div>
            <div className="f">
              <label>E-mailadres</label>
              <input type="email" value={bedrijfForm.email} onChange={e => setBedrijf('email', e.target.value)} placeholder="Nog niet ingevuld" />
            </div>
            <div className="f s2">
              <label>Antwoord e-mailadres</label>
              <input type="email" value={bedrijfForm.reply_to_email} onChange={e => setBedrijf('reply_to_email', e.target.value)} placeholder="bijv. info@jouwbedrijf.nl" />
              <div style={{ fontSize: 11, color: 'var(--dmu)', marginTop: 5, lineHeight: 1.5 }}>
                Wanneer een klant op 'Beantwoorden' klikt bij een mail van BossBase, komt het antwoord op dit adres binnen. Mails worden verzonden vanaf noreply@bossbase.nl.
              </div>
            </div>
            <div className="f">
              <label>Telefoonnummer</label>
              <input value={bedrijfForm.phone} onChange={e => setBedrijf('phone', e.target.value)} placeholder="Nog niet ingevuld" />
            </div>
            <div className="f">
              <label>KvK-nummer <span style={{ fontSize: '.75rem', color: 'var(--dmu)', fontWeight: 400 }}>(8 cijfers)</span></label>
              <input value={bedrijfForm.kvk} onChange={e => setBedrijf('kvk', e.target.value)} placeholder="Nog niet ingevuld" maxLength={8} />
            </div>
            <div className="f">
              <label>BTW-nummer</label>
              <input value={bedrijfForm.btw_number} onChange={e => setBedrijf('btw_number', e.target.value)} placeholder="Nog niet ingevuld" />
            </div>
            <div className="f">
              <label>Website</label>
              <input value={bedrijfForm.website} onChange={e => setBedrijf('website', e.target.value)} placeholder="Nog niet ingevuld" />
            </div>
            <div className="f">
              <label>Adres</label>
              <input value={bedrijfForm.address} onChange={e => setBedrijf('address', e.target.value)} placeholder="Nog niet ingevuld" />
            </div>
            <div className="f">
              <label>Postcode</label>
              <input value={bedrijfForm.postal_code} onChange={e => setBedrijf('postal_code', e.target.value)} placeholder="Nog niet ingevuld" />
            </div>
            <div className="f s2">
              <label>Stad</label>
              <input value={bedrijfForm.city} onChange={e => setBedrijf('city', e.target.value)} placeholder="Nog niet ingevuld" />
            </div>
          </div>
          <div className="fa">
            <button className="btn btn-p" onClick={saveBedrijf} disabled={savingBedrijf}>
              {savingBedrijf ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>
      )}

      {!loading && tab === 'standaard' && (
        <>
        <div className="card card-p afu3">
          <div className="card-hd" style={{ marginBottom: 18 }}>
            <div className="card-title">Standaardwaarden</div>
            <div className="card-sub">Wordt vooringevuld bij nieuwe offertes en werkbonnen</div>
          </div>
          <div className="fg">
            <div className="f">
              <label>Uurtarief (€/uur)</label>
              <input
                type="number"
                step="0.01"
                value={standaardForm.uurtarief}
                onChange={e => setStandaard('uurtarief', e.target.value)}
              />
            </div>
            <div className="f">
              <label>Reiskosten (€/km)</label>
              <input
                type="number"
                step="0.01"
                value={standaardForm.reiskosten_per_km}
                onChange={e => setStandaard('reiskosten_per_km', e.target.value)}
              />
            </div>
            <div className="f">
              <label>BTW (%)</label>
              <input
                type="number"
                step="0.1"
                value={standaardForm.btw_pct}
                onChange={e => setStandaard('btw_pct', e.target.value)}
              />
            </div>
            <div className="f">
              <label>Offerte geldig (dagen)</label>
              <input
                type="number"
                step="1"
                value={standaardForm.offerte_geldig_dagen}
                onChange={e => setStandaard('offerte_geldig_dagen', e.target.value)}
              />
            </div>
          </div>
          <div className="fa">
            <button className="btn btn-p" onClick={saveStandaard} disabled={savingStandaard}>
              {savingStandaard ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>

        {/* ── Herinneringen ── */}
        <div className="card card-p afu3" style={{ marginTop: 16 }}>
          <div className="card-hd" style={{ marginBottom: 18 }}>
            <div className="card-title">Herinneringen</div>
            <div className="card-sub">Herinner medewerkers eraan hun uren in te vullen voor verstreken geplande dagen</div>
          </div>
          <div className="fg">
            <div className="f">
              <label>Uren-herinnering</label>
              <select
                value={standaardForm.uren_herinnering_interval_min}
                onChange={e => setStandaard('uren_herinnering_interval_min', e.target.value)}
              >
                <option value={0}>Uit</option>
                <option value={15}>Elke 15 minuten</option>
                <option value={30}>Elke 30 minuten</option>
                <option value={60}>Elk uur</option>
                <option value={120}>Elke 2 uur</option>
                <option value={240}>Elke 4 uur</option>
              </select>
              <div className="card-sub" style={{ marginTop: 6 }}>
                De pop-up verschijnt alleen bij medewerkers met een verstreken geplande dag zonder geboekte uren, en keert op dit interval terug tot de uren zijn ingevuld.
              </div>
            </div>
          </div>
          <div className="fa">
            <button className="btn btn-p" onClick={saveStandaard} disabled={savingStandaard}>
              {savingStandaard ? 'Opslaan...' : 'Opslaan'}
            </button>
          </div>
        </div>

        {/* ── Eigen prijzen / eenheden ── */}
        <div className="card card-p afu3" style={{ marginTop: 16 }}>
          <div className="card-hd" style={{ marginBottom: 14 }}>
            <div className="card-title">Eigen prijzen / eenheden</div>
            <div className="card-sub">Eigen regeltypes met een standaardprijs — verschijnen naast Uren/Km/Overig in offertes en facturen</div>
          </div>

          {eenheden.length === 0 && !eenheidForm && (
            <div style={{ color: 'var(--dl)', fontSize: '.86rem', padding: '4px 0 12px' }}>Nog geen eigen eenheden aangemaakt.</div>
          )}

          {eenheden.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12 }}>
              {eenheden.map(e => (
                <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 12px', border: '1px solid var(--border)', borderRadius: 'var(--r8)', background: 'var(--bgs)' }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '.9rem' }}>{e.naam}</div>
                    <div style={{ fontSize: '.78rem', color: 'var(--dl)' }}>
                      €{Number(e.standaardPrijs).toFixed(2)}{e.eenheidLabel ? ` / ${e.eenheidLabel}` : ''} · BTW {e.btwPct != null ? `${e.btwPct}%` : 'bedrijfsstandaard'}
                    </div>
                  </div>
                  <button className="btn btn-s btn-xs" onClick={() => editEenheid(e)}>Bewerken</button>
                  <button className="btn btn-ghost btn-xs btn-icon" title="Verwijderen" onClick={() => removeEenheid(e.id)}>{I.trash}</button>
                </div>
              ))}
            </div>
          )}

          {eenheidForm ? (
            <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--r8)', padding: 14 }}>
              <div className="fg">
                <div className="f s2">
                  <label>Naam *</label>
                  <input type="text" value={eenheidForm.naam} placeholder="Bijv. Liter verf" onChange={e => setEenheidVal('naam', e.target.value)} />
                </div>
                <div className="f">
                  <label>Standaardprijs (€)</label>
                  <input type="number" step="0.01" value={eenheidForm.standaard_prijs} placeholder="0,00" onChange={e => setEenheidVal('standaard_prijs', e.target.value)} />
                </div>
                <div className="f">
                  <label>Eenheid-label (optioneel)</label>
                  <input type="text" value={eenheidForm.eenheid_label} placeholder="Bijv. liter" onChange={e => setEenheidVal('eenheid_label', e.target.value)} />
                </div>
                <div className="f">
                  <label>BTW % (optioneel)</label>
                  <input type="number" step="0.1" value={eenheidForm.btw_pct} placeholder="Bedrijfsstandaard" onChange={e => setEenheidVal('btw_pct', e.target.value)} />
                </div>
              </div>
              <div className="fa">
                <button className="btn btn-ghost" onClick={() => setEenheidForm(null)} disabled={savingEenheid}>Annuleren</button>
                <button className="btn btn-p" onClick={saveEenheid} disabled={savingEenheid || !eenheidForm.naam.trim()}>
                  {savingEenheid ? 'Opslaan...' : 'Opslaan'}
                </button>
              </div>
            </div>
          ) : (
            <button className="btn btn-s btn-sm" onClick={newEenheid}>{I.plus} Nieuwe toevoegen</button>
          )}
        </div>
        </>
      )}

      {!loading && tab === 'templates' && (
        <div className="afu3">
          {/* Rij 1: standaard templates + "+" knop */}
          {(() => {
            const customTemplates = templates.filter(t => !STANDARD_TYPES.has(t.type));
            return (
              <div style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center', marginBottom: customTemplates.length > 0 ? 8 : 0 }}>
                  {ALL_TEMPLATE_CONFIGS.map(cfg => {
                    const exists = templates.some(t => t.type === cfg.type);
                    if (!exists) return null;
                    const active = activeTemplateType === cfg.type;
                    return (
                      <button
                        key={cfg.type}
                        onClick={() => setActiveTemplateType(cfg.type)}
                        style={{
                          padding: '5px 13px', borderRadius: 20, fontSize: '.82rem', fontWeight: 500, cursor: 'pointer', border: 'none',
                          background: active ? '#1DDB62' : 'var(--bgs)',
                          color: active ? '#0D0D0D' : 'var(--dmu)',
                          outline: active ? 'none' : '1px solid var(--br)',
                        }}
                      >
                        {cfg.label}
                      </button>
                    );
                  })}
                  <button
                    onClick={() => setShowNewTemplate(true)}
                    title="Nieuw template aanmaken"
                    className="btn-plus"
                    style={{ marginLeft: 'auto' }}
                  >
                    {I.plus}
                  </button>
                </div>
                {/* Rij 2: eigen templates */}
                {customTemplates.length > 0 && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                    {customTemplates.map(t => {
                      const active = activeTemplateType === t.type;
                      return (
                        <div key={t.type} style={{ display: 'inline-flex', alignItems: 'center', gap: 0 }}>
                          <button
                            onClick={() => setActiveTemplateType(t.type)}
                            style={{
                              padding: '5px 10px 5px 13px', borderRadius: '20px 0 0 20px', fontSize: '.82rem', fontWeight: 500, cursor: 'pointer', border: 'none',
                              background: active ? '#1DDB62' : 'var(--bgs)',
                              color: active ? '#0D0D0D' : 'var(--dmu)',
                              outline: active ? 'none' : '1px solid var(--br)',
                            }}
                          >
                            {t.name || t.type}
                          </button>
                          <button
                            onClick={() => handleDeleteTemplate(t)}
                            title="Template verwijderen"
                            style={{
                              padding: '5px 8px', borderRadius: '0 20px 20px 0', fontSize: '.78rem', cursor: 'pointer', border: 'none', lineHeight: 1,
                              background: active ? '#1DDB62' : 'var(--bgs)',
                              color: active ? '#0D0D0D' : 'var(--dl)',
                              outline: active ? 'none' : '1px solid var(--br)',
                            }}
                          >
                            ×
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })()}

          {/* Actief template formulier */}
          {(() => {
            const stdCfg = ALL_TEMPLATE_CONFIGS.find(c => c.type === activeTemplateType);
            const t = templates.find(x => x.type === activeTemplateType);
            if (!t) return (
              <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>
                Template niet gevonden — voer de database-migratie uit
              </div>
            );
            // Custom templates get a generic config
            const cfg = stdCfg || { label: t.name || t.type, vars: ['klant_naam', 'bedrijfsnaam'], showAutoToggle: false, showAutoDagen: false };
            const form = templateForms[t.id] || { onderwerp: t.onderwerp, body: plainToEditorHtml(t.body || ''), actief: t.actief, auto_versturen: false, auto_dagen: 7 };
            const saving = savingTemplate[t.id] || false;
            return (
              <div className="card card-p">
                {/* Header */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
                  <div>
                    <div className="card-title" style={{ fontSize: '.95rem' }}>{cfg.label}</div>
                    {cfg.showAutoToggle && (
                      <div style={{ fontSize: '.75rem', color: form.auto_versturen ? '#15A34A' : 'var(--dl)', marginTop: 2 }}>
                        {form.auto_versturen ? 'Automatisch verzenden aan' : 'Automatisch verzenden uit'}
                      </div>
                    )}
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.83rem', color: 'var(--dm)', cursor: 'pointer' }}>
                    <input type="checkbox" style={{ accentColor: 'var(--p)' }} checked={form.actief} onChange={e => setTemplateField(t.id, 'actief', e.target.checked)} />
                    Actief
                  </label>
                </div>

                {/* Variabele chips */}
                {cfg.vars.length > 0 && (
                  <div style={{ marginBottom: 14 }}>
                    <div style={{ fontSize: '.75rem', color: 'var(--dl)', marginBottom: 6, fontWeight: 600 }}>Klik om in te voegen:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                      {cfg.vars.map(v => (
                        <button
                          key={v}
                          onClick={() => insertVar(v, t.id)}
                          style={{ padding: '2px 9px', borderRadius: 4, border: '1px solid var(--p)', background: 'var(--pll)', color: 'var(--p)', fontSize: '.78rem', fontFamily: 'monospace', cursor: 'pointer' }}
                        >
                          {`{{${v}}}`}
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="fg">
                  <div className="f s2">
                    <label>Onderwerp</label>
                    <input value={form.onderwerp} onChange={e => setTemplateField(t.id, 'onderwerp', e.target.value)} placeholder="E-mailonderwerp..." />
                  </div>
                  <div className="f s2">
                    <label>Berichttekst</label>
                    <NoteEditor mentions={false}
                      ref={bodyRef}
                      value={form.body}
                      onChange={html => setTemplateField(t.id, 'body', html)}
                      placeholder="Inhoud van het e-mailbericht..."
                      minHeight={220}
                    />
                  </div>

                  {/* Auto-versturen sectie */}
                  {cfg.showAutoToggle && (
                    <div className="f s2">
                      <label>Automatisch verzenden</label>
                      <div style={{ border: '1px solid var(--bstrong)', borderRadius: 'var(--r8)', overflow: 'hidden', maxWidth: 500 }}>
                        <div
                          onClick={() => setTemplateField(t.id, 'auto_versturen', !form.auto_versturen)}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '11px 14px', cursor: 'pointer', background: 'white', gap: 14, userSelect: 'none' }}
                        >
                          <span style={{ fontSize: '.875rem', color: 'var(--dk)' }}>Automatisch versturen inschakelen</span>
                          <div style={{ position: 'relative', width: 40, height: 22, flexShrink: 0 }}>
                            <div style={{ width: 40, height: 22, borderRadius: 11, background: form.auto_versturen ? 'var(--p)' : 'var(--bstrong)', transition: 'background .18s ease' }} />
                            <div style={{ position: 'absolute', top: 3, left: form.auto_versturen ? 21 : 3, width: 16, height: 16, borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.2)', transition: 'left .18s ease' }} />
                          </div>
                        </div>
                        {cfg.showAutoDagen && form.auto_versturen && (
                          <div style={{ borderTop: '1px solid var(--bstrong)', padding: '10px 14px', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--bgs)' }}>
                            <span style={{ fontSize: '.85rem', color: 'var(--dm)', flex: 1 }}>Verzenden na</span>
                            <input
                              type="number"
                              min="0"
                              step="1"
                              value={form.auto_dagen}
                              onClick={e => e.stopPropagation()}
                              onChange={e => setTemplateField(t.id, 'auto_dagen', Number(e.target.value))}
                              style={{ width: 68, textAlign: 'center' }}
                            />
                            <span style={{ fontSize: '.85rem', color: 'var(--dm)' }}>{cfg.dagenLabel}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {cfg.vars.includes('betaalinstructie') && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r8)', fontSize: '.8rem', color: 'var(--dmu)', lineHeight: 1.55 }}>
                    <div style={{ marginBottom: 4 }}><strong style={{ color: 'var(--dm)', fontFamily: 'monospace' }}>{'{{betaalinstructie}}'}</strong> past zich aan bij het versturen:</div>
                    <div><strong style={{ color: 'var(--dm)' }}>Met Stripe-koppeling:</strong> "U kunt de factuur eenvoudig online betalen via de knop hieronder, of het bedrag overmaken onder vermelding van het factuurnummer."</div>
                    <div><strong style={{ color: 'var(--dm)' }}>Standaard:</strong> "Gelieve het totaalbedrag voor de betaaltermijn over te maken onder vermelding van het factuurnummer."</div>
                  </div>
                )}

                <div className="fa" style={{ flexWrap: 'wrap', gap: 8, marginTop: 4 }}>
                  {stdCfg && DEFAULT_BODY[activeTemplateType] && (
                    <button className="btn btn-ghost btn-sm" onClick={() => {
                      if (confirm('Template terugzetten naar standaard?')) {
                        setTemplateField(t.id, 'body', plainToEditorHtml(DEFAULT_BODY[activeTemplateType] || ''));
                      }
                    }}>Reset</button>
                  )}
                  <button className="btn btn-p" onClick={() => saveTemplate(t.id)} disabled={saving}>{saving ? 'Opslaan...' : 'Opslaan'}</button>
                </div>
              </div>
            );
          })()}

          {templates.length === 0 && (
            <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)', marginTop: 12 }}>
              <div style={{ marginBottom: 8 }}>{I.mail}</div>
              Geen e-mailtemplates gevonden — voer de database-migratie uit
            </div>
          )}
        </div>
      )}

      {/* Nieuw template modal */}
      {showNewTemplate && (
        <div className="overlay" onClick={e => e.target === e.currentTarget && !creatingTemplate && setShowNewTemplate(false)}>
          <div className="modal modal-wide">
            <div className="modal-hd">
              <div>
                <div className="modal-title">Nieuw e-mailtemplate</div>
                <div className="modal-sub">Maak een eigen template aan</div>
              </div>
              <ModalX onClose={() => !creatingTemplate && setShowNewTemplate(false)} />
            </div>
            <div className="fg">
              <div className="f">
                <label>Naam *</label>
                <input
                  value={newTemplateForm.naam}
                  onChange={e => {
                    const naam = e.target.value;
                    setNewTemplateForm(f => ({
                      ...f,
                      naam,
                      type: f.type === slugify(f.naam) ? slugify(naam) : f.type,
                    }));
                  }}
                  placeholder="Bijv. Welkomstmail nieuw project"
                />
              </div>
              <div className="f">
                <label>Type / slug</label>
                <input
                  value={newTemplateForm.type}
                  onChange={e => setNewTemplateForm(f => ({ ...f, type: e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, '_') }))}
                  placeholder="bijv. welkomst_project (automatisch ingevuld)"
                />
              </div>
              <div className="f s2">
                <label>Onderwerp</label>
                <input
                  value={newTemplateForm.onderwerp}
                  onChange={e => setNewTemplateForm(f => ({ ...f, onderwerp: e.target.value }))}
                  placeholder="E-mailonderwerp..."
                />
              </div>
              <div className="f s2">
                <label>Variabelen</label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {NEW_TEMPLATE_VARS.map(v => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => newBodyRef.current?.insertAtCursor(`{{${v}}}`)}
                      style={{ padding: '2px 9px', borderRadius: 4, border: '1px solid var(--p)', background: 'var(--pll)', color: 'var(--p)', fontSize: '.78rem', fontFamily: 'monospace', cursor: 'pointer' }}
                    >
                      {`{{${v}}}`}
                    </button>
                  ))}
                </div>
              </div>
              <div className="f s2">
                <label>Berichttekst</label>
                <NoteEditor mentions={false}
                  ref={newBodyRef}
                  value={newTemplateForm.body}
                  onChange={html => setNewTemplateForm(f => ({ ...f, body: html }))}
                  placeholder="Inhoud van het e-mailbericht..."
                  minHeight={180}
                />
              </div>
            </div>
            <div className="fa">
              <button className="btn btn-s" onClick={() => setShowNewTemplate(false)} disabled={creatingTemplate}>Annuleren</button>
              <button className="btn btn-p" onClick={handleCreateTemplate} disabled={creatingTemplate}>
                {creatingTemplate ? 'Aanmaken...' : 'Template aanmaken'}
              </button>
            </div>
          </div>
        </div>
      )}

      {!loading && tab === 'pipeline' && (
        <div className="afu3" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="tw">
            <div className="tw-hd">
              <div className="card-title">Pipelinefasen</div>
              {isAdmin && (
                <button className="btn btn-p btn-sm" onClick={() => setShowNewStage(v => !v)}>
                  {I.plus} Nieuwe fase
                </button>
              )}
            </div>

            {showNewStage && (
              <div className="card card-p" style={{ margin: '12px 0', background: 'var(--bgs)' }}>
                <div className="fg">
                  <div className="f">
                    <label>Naam</label>
                    <input
                      value={newStageForm.name}
                      onChange={e => setNewStageForm(f => ({ ...f, name: e.target.value }))}
                      placeholder="Naam van de fase..."
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateStage(); }}
                      autoFocus
                    />
                  </div>
                  <div className="f">
                    <label>Kleur</label>
                    <ColorSwatchPicker
                      value={newStageForm.color_class}
                      onChange={val => setNewStageForm(f => ({ ...f, color_class: val }))}
                    />
                  </div>
                </div>
                <div className="fa">
                  <button className="btn btn-ghost" onClick={() => { setShowNewStage(false); setNewStageForm({ name: '', color_class: DEFAULT_STAGE_COLOR }); }}>
                    Annuleren
                  </button>
                  <button className="btn btn-p" onClick={handleCreateStage} disabled={savingStage || !newStageForm.name.trim()}>
                    {savingStage ? 'Aanmaken...' : 'Aanmaken'}
                  </button>
                </div>
              </div>
            )}

            <table className="dt">
              <thead>
                <tr>
                  <th style={{ width: 40 }}>#</th>
                  <th>Naam</th>
                  <th>Kleur</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {stages.length === 0 && (
                  <tr>
                    <td colSpan={4} style={{ textAlign: 'center', color: 'var(--dl)', padding: 20 }}>
                      Nog geen pipelinefasen aangemaakt
                    </td>
                  </tr>
                )}
                {stages.map(stage => (
                  <tr key={stage.id}>
                    <td style={{ color: 'var(--dl)', fontWeight: 600 }}>{stage.position + 1}</td>
                    <td>
                      {editingStageId === stage.id ? (
                        <input
                          value={editingStageValue}
                          onChange={e => setEditingStageValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditStage(stage.id); if (e.key === 'Escape') setEditingStageId(null); }}
                          autoFocus
                          style={{ width: '100%' }}
                        />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{stage.name}</span>
                      )}
                    </td>
                    <td>
                      {editingStageId === stage.id ? (
                        <ColorSwatchPicker
                          value={editingStageColor}
                          onChange={setEditingStageColor}
                        />
                      ) : (
                        <span className="badge" style={stageBadgeStyle(stage.colorClass)}>
                          {stageColorLabel(stage.colorClass)}
                        </span>
                      )}
                    </td>
                    <td>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {editingStageId === stage.id ? (
                            <>
                              <button className="btn-icon" title="Opslaan" onClick={() => saveEditStage(stage.id)}>
                                {I.check}
                              </button>
                              <button className="btn-icon" title="Annuleren" onClick={() => { setEditingStageId(null); setEditingStageValue(''); setEditingStageColor(DEFAULT_STAGE_COLOR); }}>
                                {I.x}
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="btn-icon" title="Bewerken" onClick={() => startEditStage(stage)}>
                                {I.edit}
                              </button>
                              <button className="btn-icon" title="Verwijderen" onClick={() => handleDeleteStage(stage.id)}>
                                {I.trash}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tw">
            <div className="tw-hd">
              <div>
                <div className="card-title">Verloren-redenen</div>
                <div style={{ fontSize: '.82rem', color: 'var(--dmu)', marginTop: 2 }}>De keuzelijst die verschijnt wanneer een lead in de pipeline op "verloren" wordt gezet.</div>
              </div>
              {isAdmin && (
                <button className="btn btn-p btn-sm" onClick={() => setShowNewReason(v => !v)}>
                  {I.plus} Nieuwe reden
                </button>
              )}
            </div>

            {showNewReason && (
              <div className="card card-p" style={{ margin: '12px 0', background: 'var(--bgs)' }}>
                <div className="fg">
                  <div className="f">
                    <label>Reden</label>
                    <input
                      value={newReasonValue}
                      onChange={e => setNewReasonValue(e.target.value)}
                      placeholder="Bijv. Buiten werkgebied"
                      onKeyDown={e => { if (e.key === 'Enter') handleCreateReason(); }}
                      autoFocus
                    />
                  </div>
                </div>
                <div className="fa">
                  <button className="btn btn-ghost" onClick={() => { setShowNewReason(false); setNewReasonValue(''); }}>
                    Annuleren
                  </button>
                  <button className="btn btn-p" onClick={handleCreateReason} disabled={savingReason || !newReasonValue.trim()}>
                    {savingReason ? 'Aanmaken...' : 'Aanmaken'}
                  </button>
                </div>
              </div>
            )}

            <table className="dt">
              <thead>
                <tr>
                  <th>Reden</th>
                  <th style={{ width: 100 }}></th>
                </tr>
              </thead>
              <tbody>
                {lostReasons.length === 0 && (
                  <tr>
                    <td colSpan={2} style={{ textAlign: 'center', color: 'var(--dl)', padding: 20 }}>
                      Nog geen verloren-redenen aangemaakt
                    </td>
                  </tr>
                )}
                {lostReasons.map(reason => (
                  <tr key={reason.id}>
                    <td>
                      {editingReasonId === reason.id ? (
                        <input
                          value={editingReasonValue}
                          onChange={e => setEditingReasonValue(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditReason(reason.id); if (e.key === 'Escape') setEditingReasonId(null); }}
                          autoFocus
                          style={{ width: '100%' }}
                        />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{reason.label}</span>
                      )}
                    </td>
                    <td>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          {editingReasonId === reason.id ? (
                            <>
                              <button className="btn-icon" title="Opslaan" onClick={() => saveEditReason(reason.id)}>
                                {I.check}
                              </button>
                              <button className="btn-icon" title="Annuleren" onClick={() => { setEditingReasonId(null); setEditingReasonValue(''); }}>
                                {I.x}
                              </button>
                            </>
                          ) : (
                            <>
                              <button className="btn-icon" title="Bewerken" onClick={() => startEditReason(reason)}>
                                {I.edit}
                              </button>
                              <button className="btn-icon" title="Verwijderen" onClick={() => handleDeleteReason(reason.id)}>
                                {I.trash}
                              </button>
                            </>
                          )}
                        </div>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!loading && tab === 'voertuigen' && isAdmin && (
        <div className="afu3" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div className="card card-p">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <div>
                <div className="card-title">Voertuigen</div>
                <div style={{ fontSize: '.82rem', color: 'var(--dmu)', marginTop: 2 }}>Beheer de voertuigen die je kunt inplannen via de Planning pagina.</div>
              </div>
              {!showVoertuigForm && (
                <button className="btn btn-p btn-sm" onClick={() => setShowVoertuigForm(true)}>{I.plus} Voertuig toevoegen</button>
              )}
            </div>

            {showVoertuigForm && (
              <div style={{ background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 'var(--r10)', padding: 14, marginBottom: 14, display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
                <div className="f" style={{ flex: '1 1 160px' }}>
                  <label>Naam *</label>
                  <input autoFocus placeholder="Bijv. Bus 1" value={newVoertuigForm.naam} onChange={e => setNewVoertuigForm(f => ({ ...f, naam: e.target.value }))} />
                </div>
                <div className="f" style={{ flex: '1 1 120px' }}>
                  <label>Kenteken</label>
                  <input placeholder="AB-123-C" value={newVoertuigForm.kenteken} onChange={e => setNewVoertuigForm(f => ({ ...f, kenteken: e.target.value }))} />
                </div>
                <div className="f" style={{ flex: '0 0 80px' }}>
                  <label>Kleur</label>
                  <input type="color" value={newVoertuigForm.kleur} onChange={e => setNewVoertuigForm(f => ({ ...f, kleur: e.target.value }))} style={{ height: 38, padding: 4, cursor: 'pointer' }} />
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button className="btn btn-s btn-sm" onClick={() => { setShowVoertuigForm(false); setNewVoertuigForm({ naam: '', kenteken: '', kleur: '#1DDB62' }); }}>Annuleren</button>
                  <button className="btn btn-p btn-sm" disabled={savingVoertuig || !newVoertuigForm.naam.trim()} onClick={async () => {
                    setSavingVoertuig(true);
                    try {
                      const v = await createVoertuig(newVoertuigForm);
                      setVoertuigen(prev => [...prev, v]);
                      setNewVoertuigForm({ naam: '', kenteken: '', kleur: '#1DDB62' });
                      setShowVoertuigForm(false);
                      toast.success('Voertuig toegevoegd');
                    } catch (e) { toast.error(e.message || 'Opslaan mislukt'); }
                    finally { setSavingVoertuig(false); }
                  }}>{savingVoertuig ? 'Toevoegen…' : 'Toevoegen'}</button>
                </div>
              </div>
            )}

            {voertuigen.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)', fontSize: 13 }}>Nog geen voertuigen toegevoegd.</div>
            ) : (
              <table className="dt" style={{ width: '100%' }}>
                <thead><tr><th>Naam</th><th>Kenteken</th><th>Kleur</th><th>Status</th><th style={{ width: 80 }}></th></tr></thead>
                <tbody>
                  {voertuigen.map(v => (
                    <tr key={v.id}>
                      <td>
                        {editingVoertuigId === v.id ? (
                          <input value={editingVoertuigForm.naam} onChange={e => setEditingVoertuigForm(f => ({ ...f, naam: e.target.value }))} style={{ width: '100%' }} />
                        ) : <span style={{ fontWeight: 600 }}>{v.naam}</span>}
                      </td>
                      <td>
                        {editingVoertuigId === v.id ? (
                          <input value={editingVoertuigForm.kenteken} onChange={e => setEditingVoertuigForm(f => ({ ...f, kenteken: e.target.value }))} style={{ width: '100%' }} />
                        ) : v.kenteken || '—'}
                      </td>
                      <td>
                        {editingVoertuigId === v.id ? (
                          <input type="color" value={editingVoertuigForm.kleur} onChange={e => setEditingVoertuigForm(f => ({ ...f, kleur: e.target.value }))} style={{ width: 40, height: 30, padding: 2, cursor: 'pointer' }} />
                        ) : <span style={{ display: 'inline-block', width: 18, height: 18, borderRadius: 4, background: v.kleur, border: '1px solid var(--border)', verticalAlign: 'middle' }} />}
                      </td>
                      <td>
                        <span className={`badge ${v.actief ? 'b-green' : 'b-gray'}`}>{v.actief ? 'Actief' : 'Inactief'}</span>
                      </td>
                      <td>
                        {editingVoertuigId === v.id ? (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn btn-ghost btn-xs" onClick={() => setEditingVoertuigId(null)}>Annuleer</button>
                            <button className="btn btn-p btn-xs" onClick={async () => {
                              try {
                                const updated = await updateVoertuig(v.id, { ...editingVoertuigForm });
                                setVoertuigen(prev => prev.map(x => x.id === v.id ? updated : x));
                                setEditingVoertuigId(null);
                                toast.success('Voertuig bijgewerkt');
                              } catch (e) { toast.error(e.message || 'Opslaan mislukt'); }
                            }}>Opslaan</button>
                          </div>
                        ) : (
                          <div style={{ display: 'flex', gap: 4 }}>
                            <button className="btn-icon" title="Bewerken" onClick={() => { setEditingVoertuigId(v.id); setEditingVoertuigForm({ naam: v.naam, kenteken: v.kenteken, kleur: v.kleur, actief: v.actief }); }}>{I.edit}</button>
                            <button className="btn-icon" title="Verwijderen" onClick={async () => {
                              if (!confirm(`Voertuig "${v.naam}" verwijderen?`)) return;
                              try { await deleteVoertuig(v.id); setVoertuigen(prev => prev.filter(x => x.id !== v.id)); toast.success('Verwijderd'); }
                              catch (e) { toast.error(e.message || 'Verwijderen mislukt'); }
                            }}>{I.trash}</button>
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {!loading && tab === 'integraties' && (
        <div className="afu3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

          {/* Google Agenda — tijdelijk verborgen voor klanten (OAuth nog niet geconfigureerd). Zet {false} op {true} om terug te zetten. */}
          {false && (
          <div className="card card-p" style={{ border: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bgs)', borderRadius: 'var(--r8)', border: '1px solid var(--border)', flexShrink: 0 }}>
                {I.google}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 2 }}>Google Agenda</div>
                <div style={{ fontSize: '.82rem', color: 'var(--dmu)' }}>
                  Synchroniseer je geplande klussen en afspraken met Google Agenda.
                </div>
              </div>
              <div style={{ flexShrink: 0, display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                {googleConnected ? (
                  <>
                    <span style={{ fontSize: '.75rem', color: '#15A34A', fontWeight: 600 }}>Verbonden (demo)</span>
                    <button
                      className="btn btn-danger btn-sm"
                      onClick={() => { setGoogleConnected(false); toast.info('Google Agenda losgekoppeld'); }}
                    >
                      Loskoppelen
                    </button>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '.75rem', color: 'var(--dmu)' }}>Niet verbonden</span>
                    <button
                      className="btn btn-s btn-sm"
                      onClick={() => {
                        setGoogleConnected(true);
                        toast.info('Google Agenda-koppeling is voorbereid. Echte OAuth-koppeling moet nog worden geconfigureerd.');
                      }}
                    >
                      {I.google} Verbinden
                    </button>
                  </>
                )}
              </div>
            </div>
          </div>
          )}

          {/* Stripe Connect — tier-gated (Groei/Team). Eigen, eenvoudiger opzet dan
              Moneybird: geen sleutel-invoer, alleen een koppel-actie. Frontend leest
              alleen statusvelden; de platform secret key blijft in de edge functions. */}
          <div className="card card-p integ-card" style={{ border: '1px solid var(--border)' }}>
            <div className="integ-card-hd" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              {/* Logo-plek */}
              <div style={{ width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bgs)', borderRadius: 'var(--r8)', border: '1px solid var(--border)', color: 'var(--dm)', flexShrink: 0 }}>
                {I.euro}
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 2 }}>Stripe</div>
                <div style={{ fontSize: '.82rem', color: 'var(--dmu)' }}>
                  Laat klanten je facturen online betalen.
                </div>
              </div>
              {/* Status-pill */}
              <div style={{ flexShrink: 0 }}>
                {!stripeAllowed ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '.72rem', fontWeight: 600, color: 'var(--dmu)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px' }}>
                    Vanaf Groei
                  </span>
                ) : stripeConn?.chargesEnabled ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.72rem', fontWeight: 600, color: 'var(--pd)', background: 'var(--pll)', border: '1px solid var(--pl)', borderRadius: 999, padding: '3px 10px' }}>
                    <span style={{ width: 6, height: 6, borderRadius: 999, background: 'var(--pd)' }} /> Actief
                  </span>
                ) : stripeConn?.accountId ? (
                  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '.72rem', fontWeight: 600, color: 'var(--dmu)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px' }}>
                    In verificatie
                  </span>
                ) : (
                  <span style={{ display: 'inline-flex', alignItems: 'center', fontSize: '.72rem', fontWeight: 600, color: 'var(--dmu)', background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 10px' }}>
                    Niet gekoppeld
                  </span>
                )}
              </div>
            </div>

            {!stripeAllowed ? (
              <div style={{ fontSize: '.82rem', color: 'var(--dmu)' }}>
                Stripe-betalingen zijn beschikbaar vanaf het <strong>Groei</strong>-abonnement.
              </div>
            ) : stripeConn?.chargesEnabled ? (
              <div className="fa" style={{ gap: 8 }}>
                <span style={{ fontSize: '.82rem', color: 'var(--dm)', alignSelf: 'center', marginRight: 'auto' }}>
                  Klanten kunnen je facturen nu online betalen.
                </span>
                <button className="btn btn-ghost btn-sm" onClick={handleStripeDisconnect} disabled={stripeBusy}>Ontkoppelen</button>
              </div>
            ) : stripeConn?.accountId ? (
              <div className="fa" style={{ gap: 8 }}>
                <span style={{ fontSize: '.82rem', color: 'var(--dm)', alignSelf: 'center', marginRight: 'auto' }}>
                  Stripe verifieert je gegevens… Dit kan even duren.
                </span>
                <button className="btn btn-s btn-sm" onClick={handleStripeRefresh} disabled={stripeBusy}>
                  {stripeBusy ? 'Vernieuwen…' : 'Status vernieuwen'}
                </button>
                <button className="btn btn-ghost btn-sm" onClick={handleStripeDisconnect} disabled={stripeBusy}>Ontkoppelen</button>
              </div>
            ) : (
              <button className="btn btn-p" onClick={handleStripeConnect} disabled={stripeBusy}>
                {stripeBusy ? 'Bezig…' : 'Stripe koppelen'}
              </button>
            )}
          </div>

          {/* Moneybird */}
          <div className="card card-p integ-card" style={{ border: '1px solid var(--border)' }}>
            <div className="integ-card-hd" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 2 }}>Moneybird</div>
                <div style={{ fontSize: '.82rem', color: 'var(--dmu)' }}>
                  Synchroniseer facturen automatisch naar Moneybird en importeer inkoopfacturen als kostenregels.
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                {mbConnection?.connected ? (
                  <span style={{ fontSize: '.75rem', color: '#15A34A', fontWeight: 600 }}>Verbonden</span>
                ) : (
                  <span style={{ fontSize: '.75rem', color: 'var(--dmu)' }}>Niet verbonden</span>
                )}
              </div>
            </div>

            <div className="fg" style={{ marginBottom: 14 }}>
              <div className="f s2">
                <label>API token</label>
                <div style={{ position: 'relative' }}>
                  <input
                    type="password"
                    value={mbForm.apiToken}
                    onChange={e => setMbForm(f => ({ ...f, apiToken: e.target.value }))}
                    placeholder="Moneybird API token..."
                    disabled={!!(mbConnection?.connected && !mbEditing)}
                    style={{ paddingRight: mbConnection?.connected && !mbEditing ? 0 : 40, opacity: mbConnection?.connected && !mbEditing ? 0.6 : 1 }}
                  />
                  {!(mbConnection?.connected && !mbEditing) && (
                    <button
                      type="button"
                      onClick={() => setMbShowToken(v => !v)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dmu)', fontSize: '.8rem', padding: 0 }}
                    >
                      {mbShowToken ? 'Verberg' : 'Toon'}
                    </button>
                  )}
                </div>
              </div>
              <div className="f s2">
                <label>
                  Administratie-ID
                  <span style={{ fontSize: '.73rem', color: 'var(--dl)', fontWeight: 400, marginLeft: 6 }}>
                    Te vinden in de URL: moneybird.com/
                    <strong>123456789</strong>
                    /…
                  </span>
                </label>
                <input
                  value={mbForm.administrationId}
                  onChange={e => setMbForm(f => ({ ...f, administrationId: e.target.value }))}
                  placeholder="bijv. 123456789"
                  disabled={!!(mbConnection?.connected && !mbEditing)}
                  style={{ opacity: mbConnection?.connected && !mbEditing ? 0.6 : 1 }}
                />
              </div>
            </div>

            <div className="fa" style={{ flexWrap: 'wrap', gap: 8 }}>
              {mbConnection?.connected && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleMbImport}
                    disabled={mbImporting}
                  >
                    {mbImporting ? 'Importeren...' : 'Kosten importeren'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleMbSyncContacten}
                    disabled={mbSyncingContacten}
                  >
                    {mbSyncingContacten ? 'Synchroniseren...' : 'Contacten synchroniseren'}
                  </button>
                </>
              )}
              {mbConnection?.lastSyncedAt && (
                <span style={{ fontSize: '.75rem', color: 'var(--dl)', alignSelf: 'center', marginRight: 'auto' }}>
                  Laatste sync: {new Date(mbConnection.lastSyncedAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {mbConnection?.connected && !mbEditing ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => setMbEditing(true)}
                >
                  Wijzigen
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleMbTest}
                    disabled={mbTesting || !mbForm.apiToken || !mbForm.administrationId}
                  >
                    {mbTesting ? 'Testen...' : 'Verbinding testen'}
                  </button>
                  <button
                    className="btn btn-p btn-sm"
                    onClick={handleMbSave}
                    disabled={mbSaving || !mbForm.apiToken || !mbForm.administrationId}
                  >
                    {mbSaving ? 'Opslaan...' : 'Opslaan'}
                  </button>
                </>
              )}
            </div>
          </div>


          {/* AFAS — tijdelijk verborgen voor klanten, nog niet actief. Zet {false} op {true} om terug te zetten. */}
          {false && (
          <div className="card card-p integ-card" style={{ border: '1px solid var(--border)' }}>
            <div className="integ-card-hd" style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <img
                src="https://logo.clearbit.com/afas.nl"
                alt="AFAS"
                style={{ width: 32, height: 32, flexShrink: 0, borderRadius: 6 }}
                onError={e => { e.currentTarget.style.display = 'none'; }}
              />
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 700, fontSize: '.95rem', marginBottom: 2 }}>AFAS</div>
                <div style={{ fontSize: '.82rem', color: 'var(--dmu)' }}>
                  Koppel je AFAS administratie met BossBase
                </div>
              </div>
              <div style={{ flexShrink: 0 }}>
                {afasTested ? (
                  <span style={{ fontSize: '.75rem', color: '#15A34A', fontWeight: 600 }}>Verbonden</span>
                ) : afasConnection?.connected ? (
                  <span style={{ fontSize: '.75rem', color: 'var(--dl)', fontWeight: 600 }}>Niet getest</span>
                ) : (
                  <span style={{ fontSize: '.75rem', color: 'var(--dmu)' }}>Niet verbonden</span>
                )}
              </div>
            </div>

            <div className="fg" style={{ marginBottom: 14 }}>
              <div className="f s2">
                <label>
                  Omgevings ID
                  <span style={{ fontSize: '.73rem', color: 'var(--dl)', fontWeight: 400, marginLeft: 6 }}>
                    Te vinden in de URL van je AFAS omgeving
                  </span>
                </label>
                <input
                  value={afasForm.environmentId}
                  onChange={e => setAfasForm(f => ({ ...f, environmentId: e.target.value }))}
                  placeholder="bijv. 12345"
                  disabled={!!(afasTested && !afasEditing)}
                  style={{ opacity: afasTested && !afasEditing ? 0.6 : 1 }}
                />
              </div>
              <div className="f s2">
                <label>
                  App token
                  <span style={{ fontSize: '.73rem', color: 'var(--dl)', fontWeight: 400, marginLeft: 6 }}>
                    Genereer een token via AFAS → App Connector
                  </span>
                </label>
                <div style={{ position: 'relative' }}>
                  <input
                    type={afasShowToken ? 'text' : 'password'}
                    value={afasForm.token}
                    onChange={e => setAfasForm(f => ({ ...f, token: e.target.value }))}
                    placeholder="AFAS App token..."
                    disabled={!!(afasTested && !afasEditing)}
                    style={{ paddingRight: afasTested && !afasEditing ? 0 : 40, opacity: afasTested && !afasEditing ? 0.6 : 1 }}
                  />
                  {!(afasTested && !afasEditing) && (
                    <button
                      type="button"
                      onClick={() => setAfasShowToken(v => !v)}
                      style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--dmu)', fontSize: '.8rem', padding: 0 }}
                    >
                      {afasShowToken ? 'Verberg' : 'Toon'}
                    </button>
                  )}
                </div>
              </div>
            </div>

            <div className="fa" style={{ flexWrap: 'wrap', gap: 8 }}>
              {afasConnection?.connected && (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleAfasImport}
                    disabled={afasImporting}
                    title="Vereist de 'Inkoop' connectorbundel in AFAS SB"
                  >
                    {afasImporting ? 'Importeren...' : 'Kosten importeren'}
                  </button>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleAfasSyncContacten}
                    disabled={afasSyncingContacten}
                  >
                    {afasSyncingContacten ? 'Synchroniseren...' : 'Contacten synchroniseren'}
                  </button>
                </>
              )}
              {afasConnection?.lastSyncedAt && (
                <span style={{ fontSize: '.75rem', color: 'var(--dl)', alignSelf: 'center', marginRight: 'auto' }}>
                  Laatste sync: {new Date(afasConnection.lastSyncedAt).toLocaleString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </span>
              )}
              {afasTested && !afasEditing ? (
                <button
                  className="btn btn-ghost btn-sm"
                  onClick={() => { setAfasEditing(true); setAfasTested(false); }}
                >
                  Wijzigen
                </button>
              ) : (
                <>
                  <button
                    className="btn btn-ghost btn-sm"
                    onClick={handleAfasTest}
                    disabled={afasTesting || !afasForm.environmentId || !afasForm.token}
                  >
                    {afasTesting ? 'Testen...' : 'Verbinding testen'}
                  </button>
                  <button
                    className="btn btn-p btn-sm"
                    onClick={handleAfasSave}
                    disabled={afasSaving || !afasForm.environmentId || !afasForm.token}
                  >
                    {afasSaving ? 'Opslaan...' : 'Opslaan'}
                  </button>
                </>
              )}
            </div>
          </div>
          )}

        </div>
      )}
    </div>
  );
}
