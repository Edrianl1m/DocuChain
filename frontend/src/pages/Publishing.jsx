import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getDocuments, getPublications, savePublication } from '../services/api'
import { PageHeader, Spinner, EmptyState, Alert } from '../components/ui/Components'

const labelStyle = { display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }

export function PublicSwitch({ checked, disabled, onChange, label = 'Publish on public page' }) {
  return (
    <label className={`switch${disabled ? ' is-disabled' : ''}`}>
      <input type="checkbox" checked={checked} disabled={disabled} onChange={e => onChange(e.target.checked)} />
      <span className="switch-track"><span className="switch-thumb" /></span>
      <span style={{ fontSize: '13px', color: 'var(--text)' }}>{label}</span>
    </label>
  )
}

function EditRow({ doc, pub, onSaved, onCancel }) {
  const [form, setForm] = useState({
    isPublic: pub?.isPublic || false,
    isConfidential: pub?.isConfidential || false,
    title: pub?.title || '',
    resolutionNumber: pub?.resolutionNumber || '',
    resolutionDate: pub?.resolutionDate || '',
    summary: pub?.summary || '',
  })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  async function save() {
    setSaving(true)
    setError('')
    try {
      const res = await savePublication(doc.docId, form)
      onSaved(res.data.publication, res.data.message)
    } catch (err) {
      setError(err.response?.data?.error || 'Save failed.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <tr style={{ background: 'var(--bg3)' }}>
      <td colSpan={5} style={{ padding: '1rem 1.25rem' }}>
        {error && <Alert type="error">{error}</Alert>}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={labelStyle}>TITLE (defaults to filename)</label>
            <input value={form.title} placeholder={doc.filename} onChange={e => set('title', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>RESOLUTION NO.</label>
            <input value={form.resolutionNumber} placeholder="e.g. 2026-014" onChange={e => set('resolutionNumber', e.target.value)} />
          </div>
          <div>
            <label style={labelStyle}>RESOLUTION DATE</label>
            <input type="date" value={form.resolutionDate} onChange={e => set('resolutionDate', e.target.value)} />
          </div>
        </div>
        <div style={{ marginBottom: '1rem' }}>
          <label style={labelStyle}>SUMMARY</label>
          <textarea rows={2} value={form.summary} placeholder="One or two sentences for the public page" onChange={e => set('summary', e.target.value)} />
        </div>
        <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
          <PublicSwitch checked={form.isPublic && !form.isConfidential} disabled={form.isConfidential} onChange={v => set('isPublic', v)} />
          <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
            <input type="checkbox" style={{ width: 'auto' }} checked={form.isConfidential}
              onChange={e => setForm(f => ({ ...f, isConfidential: e.target.checked, isPublic: e.target.checked ? false : f.isPublic }))} />
            Confidential (never shown publicly)
          </label>
        </div>
        <div style={{ display: 'flex', gap: '8px' }}>
          <button className="btn-primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save'}</button>
          <button className="btn-ghost" onClick={onCancel}>Cancel</button>
        </div>
      </td>
    </tr>
  )
}

export default function Publishing() {
  const [docs, setDocs] = useState([])
  const [pubs, setPubs] = useState({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [editing, setEditing] = useState(null)
  const [toggling, setToggling] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [docsRes, pubsRes] = await Promise.allSettled([getDocuments(), getPublications()])
        if (docsRes.status === 'fulfilled') setDocs(docsRes.value.data.documents || [])
        else setError(docsRes.reason?.response?.data?.error || 'Could not load documents from the ledger. Is the Fabric network running?')
        if (pubsRes.status === 'fulfilled') {
          const map = {}
          for (const p of pubsRes.value.data.publications || []) map[p.docId] = p
          setPubs(map)
        }
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  function saved(pub, message) {
    setPubs(p => ({ ...p, [pub.docId]: pub }))
    setEditing(null)
    setNotice(message)
  }

  async function quickToggle(doc, isPublic) {
    setToggling(doc.docId)
    setError('')
    try {
      const res = await savePublication(doc.docId, { isPublic })
      saved(res.data.publication, res.data.message)
    } catch (err) {
      setError(err.response?.data?.error || 'Update failed.')
    } finally {
      setToggling(null)
    }
  }

  if (loading) return <Spinner />

  const publicCount = Object.values(pubs).filter(p => p.isPublic && !p.isConfidential).length

  return (
    <div className="animate-in">
      <PageHeader
        title="Public Page"
        sub={`Choose which resolutions appear on the public page · ${publicCount} published`}
        action={<Link to="/public" target="_blank"><button className="btn-ghost">Open public page ↗</button></Link>}
      />

      {error && <Alert type="error">{error}</Alert>}
      {notice && <Alert type="success">{notice}</Alert>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {docs.length === 0 ? (
          <EmptyState message="No documents on the ledger" sub="Upload a document first." />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Document', 'Resolution', 'Status', 'Public page', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: '400', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map(doc => {
                  const pub = pubs[doc.docId]
                  const isPublic = !!pub?.isPublic && !pub?.isConfidential
                  return [
                    <tr key={doc.docId} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', maxWidth: '260px' }}>
                        <div style={{ fontWeight: '500', fontSize: '13px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pub?.title || doc.filename}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{doc.filename} · {doc.uploader}</div>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text2)' }}>
                        {pub?.resolutionNumber ? `No. ${pub.resolutionNumber}` : '—'}
                        {pub?.resolutionDate && <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{pub.resolutionDate}</div>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        {pub?.isConfidential
                          ? <span className="badge badge-red">Confidential</span>
                          : isPublic
                            ? <span className="badge badge-green">● Public</span>
                            : <span className="badge badge-yellow">Hidden</span>}
                      </td>
                      <td style={{ padding: '12px 16px' }}>
                        <PublicSwitch
                          label={isPublic ? 'Shown' : 'Off'}
                          checked={isPublic}
                          disabled={!!pub?.isConfidential || toggling === doc.docId}
                          onChange={v => quickToggle(doc, v)}
                        />
                      </td>
                      <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                        <button className="btn-ghost" style={{ fontSize: '12px', padding: '5px 12px' }} onClick={() => setEditing(editing === doc.docId ? null : doc.docId)}>Edit details</button>
                      </td>
                    </tr>,
                    editing === doc.docId && (
                      <EditRow key={`${doc.docId}-edit`} doc={doc} pub={pub} onSaved={saved} onCancel={() => setEditing(null)} />
                    ),
                  ]
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
