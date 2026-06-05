import { useRef, useState, useEffect } from 'react'
import { initials as initialsOf } from '../bb-shared.jsx'
import { validateAvatarFile } from '../services/avatarService.js'

// Reusable profile photo control.
//
// Shows the current avatar (or fallback initials) plus a small toolbar with
// "Foto kiezen" and "Verwijderen". Validates locally before invoking onUpload,
// which is expected to perform the actual upload + persist to the row. The
// component owns the loading/error state and exposes a preview while the
// upload is in flight.
//
// Props:
//   src         — current public photo URL ('' / null when none)
//   name        — display name used for initials fallback
//   size        — 'lg' | 'xl' (CSS classes match .av-lg / .av-xl)
//   onUpload    — async (file) => void; should throw on failure
//   onRemove    — async () => void; should throw on failure
//   disabled    — disables all interaction (eg. read-only role)
//   helperText  — small line shown under the toolbar (optional)
export function AvatarUpload({
  src,
  name = '',
  size = 'xl',
  onUpload,
  onRemove,
  disabled = false,
  helperText = 'JPG, PNG of WEBP · max. 5 MB',
}) {
  const inputRef = useRef(null)
  const [preview, setPreview] = useState(null)
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState(null)

  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const visibleSrc = preview || src || null
  const showInitials = !visibleSrc
  const sizeClass = `av av-${size} av-0`

  const handlePick = e => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      validateAvatarFile(file)
    } catch (validationErr) {
      setErr(validationErr.message || 'Ongeldig bestand')
      return
    }
    setErr(null)
    const url = URL.createObjectURL(file)
    if (preview) URL.revokeObjectURL(preview)
    setPreview(url)
    setBusy(true)
    Promise.resolve(onUpload(file))
      .catch(uploadErr => {
        setErr(uploadErr.message || 'Uploaden mislukt')
        if (preview) URL.revokeObjectURL(preview)
        setPreview(null)
      })
      .finally(() => setBusy(false))
  }

  const handleRemove = () => {
    if (!onRemove || busy) return
    setErr(null)
    setBusy(true)
    Promise.resolve(onRemove())
      .catch(removeErr => setErr(removeErr.message || 'Verwijderen mislukt'))
      .finally(() => setBusy(false))
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
      <div style={{ position: 'relative', flexShrink: 0 }}>
        {showInitials ? (
          <div className={sizeClass} aria-label={name || 'Profielfoto'}>
            {initialsOf(name || '?')}
          </div>
        ) : (
          <img
            src={visibleSrc}
            alt={name || 'Profielfoto'}
            className={`av av-${size}`}
            onError={e => { e.currentTarget.style.display = 'none' }}
            style={{ objectFit: 'cover', background: 'var(--bgs)', border: '1px solid var(--border)' }}
          />
        )}
        {busy && (
          <div
            aria-hidden="true"
            style={{
              position: 'absolute', inset: 0, borderRadius: '50%',
              background: 'rgba(255,255,255,0.65)', display: 'flex',
              alignItems: 'center', justifyContent: 'center',
              fontSize: '.72rem', fontWeight: 700, color: '#15A34A',
            }}
          >…</div>
        )}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, minWidth: 0 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button
            type="button"
            className="btn btn-ghost btn-sm"
            onClick={() => inputRef.current?.click()}
            disabled={disabled || busy}
          >
            {src ? 'Foto wijzigen' : 'Foto kiezen'}
          </button>
          {src && onRemove && (
            <button
              type="button"
              className="btn btn-ghost btn-sm"
              onClick={handleRemove}
              disabled={disabled || busy}
              style={{ color: '#dc2626' }}
            >
              Verwijderen
            </button>
          )}
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            style={{ display: 'none' }}
            onChange={handlePick}
            disabled={disabled || busy}
          />
        </div>
        {err
          ? <div style={{ fontSize: '.78rem', color: '#dc2626' }}>{err}</div>
          : <div style={{ fontSize: '.75rem', color: 'var(--dmu)' }}>{helperText}</div>}
      </div>
    </div>
  )
}
