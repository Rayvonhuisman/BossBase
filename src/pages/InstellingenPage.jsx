import { useState, useEffect } from 'react';
import { I, ModalX } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import {
  getBedrijfsinstellingen,
  upsertBedrijfsinstellingen,
  getEmailTemplates,
  updateEmailTemplate,
  getPipelineStages,
  createPipelineStage,
  updatePipelineStage,
  deletePipelineStage,
} from '../services/instellingenService.js';
import { updateCompany } from '../services/profileService.js';

const TEMPLATE_LABELS = {
  lead_ontvangen: 'Lead ontvangen',
  offerte_verstuurd: 'Offerte verstuurd',
  offerte_herinnering: 'Offerte herinnering',
  klus_gepland: 'Klus ingepland',
  betaalherinnering: 'Betaalherinnering',
};

const COLOR_OPTIONS = [
  { label: 'Grijs', value: 'b-gray' },
  { label: 'Blauw', value: 'b-blue' },
  { label: 'Groen', value: 'b-green' },
  { label: 'Oranje', value: 'b-orange' },
  { label: 'Rood', value: 'b-red' },
];

export function InstellingenPage() {
  const toast = useToast();
  const { company, refresh, profile } = useProfile();
  const isAdmin = profile?.role === 'admin';

  const [tab, setTab] = useState('bedrijf');
  const [loading, setLoading] = useState(true);

  // Bedrijfsprofiel
  const [bedrijfForm, setBedrijfForm] = useState({
    name: '', email: '', phone: '', kvk: '', btw_number: '',
    address: '', city: '', postal_code: '', website: '',
  });
  const [savingBedrijf, setSavingBedrijf] = useState(false);

  // Standaardwaarden
  const [standaardForm, setStandaardForm] = useState({
    uurtarief: 55,
    reiskosten_per_km: 0.23,
    standaard_marge: 25,
    btw_pct: 21,
    offerte_geldig_dagen: 14,
  });
  const [savingStandaard, setSavingStandaard] = useState(false);

  // E-mailtemplates
  const [templates, setTemplates] = useState([]);
  const [templateForms, setTemplateForms] = useState({});
  const [savingTemplate, setSavingTemplate] = useState({});

  // Pipeline stages
  const [stages, setStages] = useState([]);
  const [showNewStage, setShowNewStage] = useState(false);
  const [newStageForm, setNewStageForm] = useState({ name: '', color_class: 'b-gray' });
  const [savingStage, setSavingStage] = useState(false);
  const [editingStageId, setEditingStageId] = useState(null);
  const [editingStageValue, setEditingStageValue] = useState('');

  // Integraties
  // TODO: replace with real OAuth flow when Google API credentials are configured
  const [googleConnected, setGoogleConnected] = useState(false);

  useEffect(() => {
    setLoading(true);
    Promise.all([getBedrijfsinstellingen(), getEmailTemplates(), getPipelineStages()])
      .then(([instellingen, emailTemplates, pipelineStages]) => {
        if (instellingen) {
          setStandaardForm({
            uurtarief: instellingen.uurtarief ?? 55,
            reiskosten_per_km: instellingen.reiskostenPerKm ?? 0.23,
            standaard_marge: instellingen.standaardMarge ?? 25,
            btw_pct: instellingen.btwPct ?? 21,
            offerte_geldig_dagen: instellingen.offerteGeldigDagen ?? 14,
          });
        }
        setTemplates(emailTemplates);
        const forms = {};
        emailTemplates.forEach(t => {
          forms[t.id] = { onderwerp: t.onderwerp, body: t.body, actief: t.actief };
        });
        setTemplateForms(forms);
        setStages(pipelineStages);
      })
      .catch(err => toast.error(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (company) {
      setBedrijfForm({
        name: company.name || '',
        email: company.email || '',
        phone: company.phone || '',
        kvk: company.kvk || '',
        btw_number: company.btwNumber || '',
        address: company.address || '',
        city: company.city || '',
        postal_code: company.postalCode || '',
        website: company.website || '',
      });
    }
  }, [company]);

  const setBedrijf = (k, v) => setBedrijfForm(f => ({ ...f, [k]: v }));
  const setStandaard = (k, v) => setStandaardForm(f => ({ ...f, [k]: v }));
  const setTemplateField = (id, k, v) => setTemplateForms(f => ({ ...f, [id]: { ...f[id], [k]: v } }));

  const saveBedrijf = async () => {
    if (!company?.id) return;
    if (bedrijfForm.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(bedrijfForm.email)) {
      toast.error('E-mailadres heeft geen geldig formaat');
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

  const saveTemplate = async (templateId) => {
    setSavingTemplate(s => ({ ...s, [templateId]: true }));
    try {
      const form = templateForms[templateId];
      const updated = await updateEmailTemplate(templateId, form);
      setTemplates(ts => ts.map(t => t.id === templateId ? updated : t));
      setTemplateForms(f => ({ ...f, [templateId]: { onderwerp: updated.onderwerp, body: updated.body, actief: updated.actief } }));
      toast.success('Template opgeslagen');
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSavingTemplate(s => ({ ...s, [templateId]: false }));
    }
  };

  const handleCreateStage = async () => {
    if (!newStageForm.name.trim()) return;
    setSavingStage(true);
    try {
      const created = await createPipelineStage(newStageForm);
      setStages(s => [...s, created]);
      setNewStageForm({ name: '', color_class: 'b-gray' });
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
  };

  const saveEditStage = async (id) => {
    if (!editingStageValue.trim()) { setEditingStageId(null); return; }
    try {
      const updated = await updatePipelineStage(id, { name: editingStageValue.trim() });
      setStages(s => s.map(st => st.id === id ? updated : st));
      toast.success('Fase bijgewerkt');
    } catch (err) {
      toast.error(err.message || 'Bijwerken mislukt');
    } finally {
      setEditingStageId(null);
      setEditingStageValue('');
    }
  };

  const TABS = [
    { id: 'bedrijf', label: 'Bedrijfsprofiel' },
    { id: 'standaard', label: 'Standaardwaarden' },
    { id: 'templates', label: 'E-mailtemplates' },
    { id: 'pipeline', label: 'Pipeline' },
    { id: 'integraties', label: 'Integraties' },
  ];

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

      {!loading && tab === 'bedrijf' && (
        <div className="card card-p afu3">
          <div className="card-hd" style={{ marginBottom: 18 }}>
            <div className="card-title">Bedrijfsprofiel</div>
            <div className="card-sub">Basisinformatie van je bedrijf</div>
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
              <label>Standaard marge (%)</label>
              <input
                type="number"
                step="0.1"
                value={standaardForm.standaard_marge}
                onChange={e => setStandaard('standaard_marge', e.target.value)}
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
      )}

      {!loading && tab === 'templates' && (
        <div className="afu3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {templates.length === 0 && (
            <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>
              <div style={{ marginBottom: 8 }}>{I.mail}</div>
              Geen e-mailtemplates gevonden
            </div>
          )}
          {templates.map(t => {
            const form = templateForms[t.id] || { onderwerp: t.onderwerp, body: t.body, actief: t.actief };
            const saving = savingTemplate[t.id] || false;
            return (
              <div key={t.id} className="card card-p">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                  <div>
                    <div className="card-title" style={{ fontSize: '.95rem' }}>
                      {TEMPLATE_LABELS[t.type] || t.type}
                    </div>
                    <div className="card-sub" style={{ fontSize: '.78rem' }}>Type: {t.type}</div>
                  </div>
                  <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: '.83rem', color: 'var(--dm)', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={form.actief}
                      onChange={e => setTemplateField(t.id, 'actief', e.target.checked)}
                    />
                    Actief
                  </label>
                </div>
                <div className="fg">
                  <div className="f s2">
                    <label>Onderwerp</label>
                    <input
                      value={form.onderwerp}
                      onChange={e => setTemplateField(t.id, 'onderwerp', e.target.value)}
                      placeholder="E-mailonderwerp..."
                    />
                  </div>
                  <div className="f s2">
                    <label>Berichttekst</label>
                    <textarea
                      rows={5}
                      value={form.body}
                      onChange={e => setTemplateField(t.id, 'body', e.target.value)}
                      placeholder="Inhoud van het e-mailbericht..."
                    />
                  </div>
                </div>
                <div className="fa">
                  <button className="btn btn-p" onClick={() => saveTemplate(t.id)} disabled={saving}>
                    {saving ? 'Opslaan...' : 'Opslaan'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {!loading && tab === 'pipeline' && (
        <div className="afu3">
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
                    <select
                      value={newStageForm.color_class}
                      onChange={e => setNewStageForm(f => ({ ...f, color_class: e.target.value }))}
                    >
                      {COLOR_OPTIONS.map(c => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                </div>
                <div className="fa">
                  <button className="btn btn-ghost" onClick={() => { setShowNewStage(false); setNewStageForm({ name: '', color_class: 'b-gray' }); }}>
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
                          onBlur={() => saveEditStage(stage.id)}
                          onKeyDown={e => { if (e.key === 'Enter') saveEditStage(stage.id); if (e.key === 'Escape') setEditingStageId(null); }}
                          autoFocus
                          style={{ width: '100%' }}
                        />
                      ) : (
                        <span style={{ fontWeight: 500 }}>{stage.name}</span>
                      )}
                    </td>
                    <td>
                      <span className={`badge ${stage.colorClass || 'b-gray'}`}>
                        {COLOR_OPTIONS.find(c => c.value === stage.colorClass)?.label || stage.colorClass || 'Grijs'}
                      </span>
                    </td>
                    <td>
                      {isAdmin && (
                        <div style={{ display: 'flex', gap: 4 }}>
                          <button className="btn-icon" title="Bewerken" onClick={() => startEditStage(stage)}>
                            {I.edit}
                          </button>
                          <button className="btn-icon" title="Verwijderen" onClick={() => handleDeleteStage(stage.id)}>
                            {I.trash}
                          </button>
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

      {!loading && tab === 'integraties' && (
        <div className="afu3" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
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
                    <span style={{ fontSize: '.75rem', color: '#059669', fontWeight: 600 }}>Verbonden (demo)</span>
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
        </div>
      )}
    </div>
  );
}
