import { useState, useEffect } from 'react';
import { I, ModalX, initials, Av } from '../bb-shared.jsx';
import { useToast } from '../lib/toast.jsx';
import { useUploads } from '../lib/uploadContext.jsx';
import { useProfile } from '../lib/profileContext.jsx';
import {
  getTeamMembers,
  inviteTeamMember,
  updateTeamMember,
  activateTeamMember,
  deactivateTeamMember,
  deleteTeamMember,
} from '../services/teamService.js';
import { uploadTeamMemberAvatar, removeTeamMemberAvatar } from '../services/avatarService.js';
import { AvatarUpload } from '../components/AvatarUpload.jsx';
import { getUserPermissions, setUserPermissions } from '../services/permissionsService.js';
import { AVAILABLE_PERMISSIONS, PERMISSION_GROUPS, WARN_ON_ENABLE } from '../config/permissions.js';
import { usePlanGuard, PlanStand } from '../components/PlanUpgradeModal.jsx';

function TeamAvatar({ member, idx, size = 'sm' }) {
  if (member.avatarUrl) {
    return (
      <img
        src={member.avatarUrl}
        alt={member.fullName || member.email || 'Teamlid'}
        className={`av av-${size}`}
        style={{ objectFit: 'cover', background: 'var(--bgs)', border: '1px solid var(--border)' }}
        onError={e => { e.currentTarget.replaceWith(Object.assign(document.createElement('span'), { className: `av av-${size} av-${idx % 6}`, textContent: initials(member.fullName || member.email || '?') })); }}
      />
    );
  }
  return <Av name={member.fullName || member.email || '?'} size={size} idx={idx % 6} />;
}

function InviteModal({ onClose, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({
    email: '',
    full_name: '',
    phone: '',
    role: 'medewerker',
    hours_per_week: '',
  });
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!form.email.trim()) {
      toast.error('E-mailadres is verplicht');
      return;
    }
    setSaving(true);
    try {
      const result = await inviteTeamMember(form);
      if (result.emailSent === false) {
        toast.error(`Teamlid toegevoegd maar e-mail niet verstuurd: ${result.emailError || 'onbekende fout'}`);
      } else {
        toast.success('Uitnodiging verstuurd');
      }
      onSaved?.(result);
      onClose();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Teamlid uitnodigen</div>
            <div className="modal-sub">Stuur een uitnodiging naar een nieuw teamlid</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>E-mailadres *</label>
            <input
              type="email"
              value={form.email}
              onChange={e => set('email', e.target.value)}
              placeholder="naam@bedrijf.nl"
            />
          </div>
          <div className="f">
            <label>Volledige naam</label>
            <input
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Voor- en achternaam"
            />
          </div>
          <div className="f">
            <label>Telefoonnummer</label>
            <input
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="06-12345678"
            />
          </div>
          <div className="f">
            <label>Rol</label>
            <select value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="medewerker">Medewerker</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="f">
            <label>Uren per week (optioneel)</label>
            <input
              type="number"
              min="0"
              max="60"
              placeholder="bijv. 40"
              value={form.hours_per_week}
              onChange={e => set('hours_per_week', e.target.value)}
            />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Versturen...' : 'Uitnodiging versturen'}
          </button>
        </div>
      </div>
    </div>
  );
}

function EditModal({ member, onClose, onSaved }) {
  const toast = useToast();
  const { startUpload } = useUploads();
  const [form, setForm] = useState({
    full_name: member.fullName || '',
    phone: member.phone || '',
    role: member.role || 'medewerker',
    hours_per_week: member.hoursPerWeek ?? 40,
  });
  const [avatarUrl, setAvatarUrl] = useState(member.avatarUrl || '');
  const [saving, setSaving] = useState(false);
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    setSaving(true);
    try {
      const result = await updateTeamMember(member.id, form);
      toast.success('Teamlid bijgewerkt');
      onSaved?.({ ...result, avatarUrl: avatarUrl || result.avatarUrl });
      onClose();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarUpload = (file) => {
    if (!member.companyId) { toast.error('Bedrijf niet bekend voor dit teamlid'); return; }
    // AvatarUpload toont meteen een preview; upload draait op de achtergrond.
    startUpload(file.name || 'Teamfoto', async () => {
      const newUrl = await uploadTeamMemberAvatar({
        memberId: member.id,
        companyId: member.companyId,
        file,
        previousUrl: avatarUrl,
      });
      setAvatarUrl(newUrl);
      onSaved?.({ ...member, avatarUrl: newUrl });
    });
  };

  const handleAvatarRemove = async () => {
    await removeTeamMemberAvatar({ memberId: member.id, previousUrl: avatarUrl });
    setAvatarUrl('');
    onSaved?.({ ...member, avatarUrl: '' });
    toast.success('Foto verwijderd');
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal">
        <div className="modal-hd">
          <div>
            <div className="modal-title">Teamlid bewerken</div>
            <div className="modal-sub">{member.email}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>
        <div style={{ marginBottom: 18 }}>
          <AvatarUpload
            src={avatarUrl}
            name={form.full_name || member.email}
            size="xl"
            onUpload={handleAvatarUpload}
            onRemove={avatarUrl ? handleAvatarRemove : null}
          />
        </div>
        <div className="fg">
          <div className="f s2">
            <label>Volledige naam</label>
            <input
              value={form.full_name}
              onChange={e => set('full_name', e.target.value)}
              placeholder="Voor- en achternaam"
            />
          </div>
          <div className="f">
            <label>Telefoonnummer</label>
            <input
              value={form.phone}
              onChange={e => set('phone', e.target.value)}
              placeholder="06-12345678"
            />
          </div>
          <div className="f">
            <label>Rol</label>
            <select value={form.role} onChange={e => set('role', e.target.value)}>
              <option value="medewerker">Medewerker</option>
              <option value="admin">Admin</option>
            </select>
          </div>
          <div className="f">
            <label>Uren per week</label>
            <input
              type="number"
              min="0"
              max="60"
              value={form.hours_per_week}
              onChange={e => set('hours_per_week', Number(e.target.value))}
            />
          </div>
        </div>
        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" onClick={submit} disabled={saving}>
            {saving ? 'Opslaan...' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}

function PermissionsModal({ member, onClose, onSaved }) {
  const toast = useToast();
  const [perms, setPerms] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [openInfo, setOpenInfo] = useState(null); // key waarvan de uitleg openstaat

  useEffect(() => {
    if (!member.profileId) {
      // Profiel nog niet actief (uitnodiging niet geaccepteerd)
      const empty = {};
      AVAILABLE_PERMISSIONS.forEach(p => { empty[p.key] = false; });
      setPerms(empty);
      setLoading(false);
      return;
    }
    getUserPermissions(member.profileId)
      .then(granted => {
        const map = {};
        AVAILABLE_PERMISSIONS.forEach(p => { map[p.key] = granted.includes(p.key); });
        setPerms(map);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [member.profileId]);

  const WARN_TEXT = 'Let op: dit geeft brede inzage in projecten, werkbonnen of agenda van collega’s. Weet je zeker dat je dit wilt aanzetten?';

  // Eén subrecht togglen; waarschuw bij het AANzetten van brede-inzage-rechten.
  const toggleSub = key => {
    const turningOn = !perms[key];
    if (turningOn && WARN_ON_ENABLE.includes(key) && !window.confirm(WARN_TEXT)) return;
    setPerms(p => ({ ...p, [key]: !p[key] }));
  };

  // Hoofdrecht togglen → cascadeert naar alle subrechten. Waarschuw als het
  // aanzetten een brede-inzage-subrecht meeneemt.
  const setGroup = (group, value) => {
    if (value && group.subs.some(s => WARN_ON_ENABLE.includes(s.key) && !perms[s.key]) && !window.confirm(WARN_TEXT)) return;
    setPerms(p => { const next = { ...p }; group.subs.forEach(s => { next[s.key] = value; }); return next; });
  };

  // Tri-state van een hoofdrecht: leeg / half (indeterminate) / vol.
  const groupState = group => {
    const on = group.subs.filter(s => perms[s.key]).length;
    return { all: on === group.subs.length, some: on > 0 && on < group.subs.length };
  };

  const allOn  = () => { const m = {}; AVAILABLE_PERMISSIONS.forEach(p => { m[p.key] = true;  }); setPerms(m); };
  const allOff = () => { const m = {}; AVAILABLE_PERMISSIONS.forEach(p => { m[p.key] = false; }); setPerms(m); };

  const save = async () => {
    if (!member.profileId) {
      toast.error('Teamlid heeft de uitnodiging nog niet geaccepteerd');
      return;
    }
    setSaving(true);
    try {
      const granted = Object.entries(perms).filter(([, v]) => v).map(([k]) => k);
      await setUserPermissions(member.profileId, member.companyId, granted);
      toast.success('Rechten opgeslagen');
      onSaved?.();
      onClose();
    } catch (err) {
      toast.error(err.message || 'Opslaan mislukt');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="overlay" onClick={e => e.target === e.currentTarget && !saving && onClose()}>
      <div className="modal" style={{ maxWidth: 480 }}>
        <div className="modal-hd">
          <div>
            <div className="modal-title">Rechten beheren</div>
            <div className="modal-sub">{member.fullName || member.email}</div>
          </div>
          <ModalX onClose={onClose} />
        </div>

        {!member.profileId && (
          <div style={{ padding: '10px 0 14px', fontSize: '.85rem', color: 'var(--dl)' }}>
            Dit teamlid heeft de uitnodiging nog niet geaccepteerd. Rechten kunnen worden ingesteld zodra ze zijn ingelogd.
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '24px 0', color: 'var(--dl)' }}>Laden…</div>
        ) : (
          <>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <button className="btn btn-ghost btn-sm" onClick={allOn}>Alles aan</button>
              <button className="btn btn-ghost btn-sm" onClick={allOff}>Alles uit</button>
            </div>

            {PERMISSION_GROUPS.map(group => {
              const st = groupState(group);
              return (
                <div key={group.key} style={{ marginBottom: 14 }}>
                  {/* Hoofdrecht: master-vinkje dat naar alle subrechten cascadeert */}
                  <label style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6, cursor: 'pointer', userSelect: 'none' }}>
                    <input
                      type="checkbox"
                      checked={st.all}
                      ref={el => { if (el) el.indeterminate = st.some; }}
                      onChange={() => setGroup(group, !st.all)}
                      style={{ width: 16, height: 16, accentColor: 'var(--p)', flexShrink: 0 }}
                    />
                    <span style={{ fontWeight: 700, fontSize: '.74rem', color: 'var(--dk)', textTransform: 'uppercase', letterSpacing: '.06em' }}>{group.label}</span>
                  </label>
                  <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                    {group.subs.map((p, i, arr) => (
                      <div
                        key={p.key}
                        style={{ borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px' }}>
                          <label style={{ display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer', userSelect: 'none', flex: 1, minWidth: 0 }}>
                            <input
                              type="checkbox"
                              checked={perms[p.key] ?? false}
                              onChange={() => toggleSub(p.key)}
                              style={{ width: 16, height: 16, accentColor: 'var(--p)', flexShrink: 0 }}
                            />
                            <span style={{ minWidth: 0 }}>
                              <span style={{ display: 'block', fontSize: '.88rem', fontWeight: 500 }}>{p.label}</span>
                              {p.kort && (
                                <span style={{ display: 'block', fontSize: '.72rem', color: 'var(--dl)', marginTop: 1, lineHeight: 1.35 }}>{p.kort}</span>
                              )}
                            </span>
                          </label>
                          {p.uitleg && (
                            <button
                              type="button"
                              className="btn-icon"
                              aria-label={`Uitleg over ${p.label}`}
                              aria-expanded={openInfo === p.key}
                              onClick={() => setOpenInfo(k => (k === p.key ? null : p.key))}
                              style={{ flexShrink: 0, color: openInfo === p.key ? 'var(--p)' : 'var(--dl)' }}
                            >
                              {I.info}
                            </button>
                          )}
                        </div>
                        {openInfo === p.key && p.uitleg && (
                          <div style={{ padding: '0 14px 12px 42px' }}>
                            <div style={{ background: 'var(--bgs)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px', fontSize: '.78rem', color: 'var(--dm)', lineHeight: 1.5 }}>
                              {p.uitleg}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </>
        )}

        <div className="fa">
          <button className="btn btn-ghost" onClick={onClose}>Annuleren</button>
          <button className="btn btn-p" onClick={save} disabled={saving || loading || !member.profileId}>
            {saving ? 'Opslaan…' : 'Opslaan'}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TeamPage() {
  const toast = useToast();
  const { profile } = useProfile();
  const isAdmin = profile?.role === 'admin';
  const [members, setMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showInvite, setShowInvite] = useState(false);
  const [editingMember, setEditingMember] = useState(null);
  const [permsMember, setPermsMember] = useState(null);
  // Gebruikerslimiet + rollen&rechten uit de centrale matrix. Server-side dwingt
  // een restrictive policy op company_members (limiet) en user_permissions
  // (feature) hetzelfde af.
  const { plan, guardLimiet, guardFeature, planModal } = usePlanGuard();

  useEffect(() => {
    setLoading(true);
    getTeamMembers()
      .then(data => setMembers(data))
      .catch(err => toast.error(err.message || 'Laden mislukt'))
      .finally(() => setLoading(false));
  }, []);

  const handleActivate = async (member) => {
    try {
      const updated = await activateTeamMember(member.id);
      setMembers(ms => updated ? ms.map(m => m.id === updated.id ? updated : m) : ms.filter(m => m.id !== member.id));
      toast.success('Teamlid geactiveerd');
    } catch (err) {
      toast.error(err.message || 'Activeren mislukt');
    }
  };

  const handleDeactivate = async (member) => {
    try {
      const updated = await deactivateTeamMember(member.id);
      setMembers(ms => updated ? ms.map(m => m.id === updated.id ? updated : m) : ms.filter(m => m.id !== member.id));
      toast.success('Teamlid gedeactiveerd');
    } catch (err) {
      toast.error(err.message || 'Deactiveren mislukt');
    }
  };

  const handleDelete = async (member) => {
    if (!window.confirm('Teamlid verwijderen?')) return;
    try {
      await deleteTeamMember(member.id);
      setMembers(ms => ms.filter(m => m.id !== member.id));
      toast.success('Teamlid verwijderd');
    } catch (err) {
      toast.error(err.message || 'Verwijderen mislukt');
    }
  };

  const totalCount = members.length;
  const activeCount = members.filter(m => m.status === 'actief').length;
  const invitedCount = members.filter(m => m.status === 'uitgenodigd').length;

  const roleBadge = role => {
    if (role === 'admin') return <span className="badge b-blue">Admin</span>;
    if (role === 'planner') return <span className="badge b-green">Planner</span>;
    return <span className="badge b-gray">Medewerker</span>;
  };

  const statusBadge = (status, member) => {
    if (status === 'actief') return <span className="badge b-accepted">Actief</span>;
    // Mail mislukt? Dan is er niets aangekomen — "Uitgenodigd" zou misleiden.
    if (status === 'uitgenodigd' && member?.inviteEmailFailedAt) {
      return (
        <span className="badge b-red" title={member.inviteEmailError || 'De uitnodigingsmail kon niet worden verstuurd'}>
          Mail mislukt
        </span>
      );
    }
    if (status === 'uitgenodigd') return <span className="badge b-sent">Uitgenodigd</span>;
    return <span className="badge b-gray">Inactief</span>;
  };

  return (
    <div>
      <div className="page-hd afu">
        <div>
          <h1>Team</h1>
          <p style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
            Teamleden en uitnodigingen
            <PlanStand limiet="gebruikers" />
          </p>
        </div>
        <div className="page-hd-actions">
          {isAdmin && (
            <button className="btn btn-p" onClick={guardLimiet('gebruikers', () => setShowInvite(true))}>
              {I.plus} Teamlid uitnodigen
            </button>
          )}
        </div>
      </div>

      <div className="stats-row afu2" style={{ gridTemplateColumns: 'repeat(3,1fr)', marginBottom: 20 }}>
        <div className="sc">
          <div className="sc-top">
            <div className="sc-icon">{I.team}</div>
          </div>
          <div className="sc-val">{totalCount}</div>
          <div className="sc-label">Totaal</div>
        </div>
        <div className="sc">
          <div className="sc-top">
            <div className="sc-icon">{I.check}</div>
          </div>
          <div className="sc-val">{activeCount}</div>
          <div className="sc-label">Actief</div>
        </div>
        <div className="sc">
          <div className="sc-top">
            <div className="sc-icon">{I.mail}</div>
          </div>
          <div className="sc-val">{invitedCount}</div>
          <div className="sc-label">Uitgenodigd</div>
        </div>
      </div>

      {loading && (
        <div className="card card-p" style={{ textAlign: 'center', color: 'var(--dl)' }}>Laden…</div>
      )}

      {!loading && members.length === 0 && (
        <div className="card card-p afu3" style={{ textAlign: 'center', color: 'var(--dl)', padding: '40px 20px' }}>
          <div style={{ marginBottom: 10, opacity: .5 }}>{I.team}</div>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Nog geen teamleden</div>
          <div style={{ fontSize: '.83rem' }}>Nodig je eerste teamlid uit via de knop rechtsboven.</div>
        </div>
      )}

      {!loading && members.length > 0 && (
        <div className="tw afu3">
          <table className="dt">
            <thead>
              <tr>
                <th>Naam</th>
                <th>Rol</th>
                <th>Status</th>
                <th>E-mail</th>
                <th>Uren/week</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {members.map((member, idx) => (
                <tr key={member.id}>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 9 }}>
                      <TeamAvatar member={member} idx={idx} size="sm" />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: '.88rem' }}>
                          {member.fullName || <span style={{ color: 'var(--dl)', fontStyle: 'italic' }}>Geen naam</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{roleBadge(member.role)}</td>
                  <td>{statusBadge(member.status, member)}</td>
                  <td style={{ color: 'var(--dmu)', fontSize: '.83rem' }}>{member.email}</td>
                  <td style={{ color: 'var(--dm)' }}>{member.hoursPerWeek > 0 ? `${member.hoursPerWeek}u` : '—'}</td>
                  <td>
                    {isAdmin && (
                      <div style={{ display: 'flex', gap: 4, alignItems: 'center', flexWrap: 'wrap' }}>
                        <button
                          className="btn-icon"
                          title="Bewerken"
                          onClick={() => setEditingMember(member)}
                        >
                          {I.edit}
                        </button>
                        {member.role !== 'admin' && (
                          <button
                            className="btn btn-ghost btn-sm"
                            title={plan.has('rollen_rechten') ? 'Rechten instellen' : 'Rollen & rechten zit niet in je abonnement'}
                            onClick={guardFeature('rollen_rechten', () => setPermsMember(member))}
                            style={{ fontSize: '.78rem', opacity: plan.has('rollen_rechten') ? 1 : .6 }}
                          >
                            Rechten
                          </button>
                        )}
                        {member.profileId && member.profileId === profile?.id ? (
                          <span style={{ fontSize: '.78rem', color: 'var(--dl)' }}>Jij</span>
                        ) : (
                          <>
                            {member.status === 'actief' ? (
                              <button
                                className="btn btn-ghost btn-sm"
                                onClick={() => handleDeactivate(member)}
                              >
                                Deactiveren
                              </button>
                            ) : (
                              <button
                                className="btn btn-s btn-sm"
                                onClick={() => handleActivate(member)}
                              >
                                Activeren
                              </button>
                            )}
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => handleDelete(member)}
                            >
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
      )}

      {showInvite && (
        <InviteModal
          onClose={() => setShowInvite(false)}
          onSaved={created => setMembers(ms => [...ms, created])}
        />
      )}

      {editingMember && (
        <EditModal
          member={editingMember}
          onClose={() => setEditingMember(null)}
          onSaved={updated => setMembers(ms => ms.map(m => m.id === updated.id ? updated : m))}
        />
      )}

      {permsMember && (
        <PermissionsModal
          member={permsMember}
          onClose={() => setPermsMember(null)}
          onSaved={() => setPermsMember(null)}
        />
      )}
      {planModal}
    </div>
  );
}
