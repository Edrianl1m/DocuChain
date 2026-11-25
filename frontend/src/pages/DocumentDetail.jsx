import { useState, useEffect, useRef } from 'react'
import { useParams, Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { filingLabel, getDocumentVersions, uploadDocumentVersion, downloadDocumentVersion, readBlobError, triggerDownload, TAMPER_REASON_LABELS } from '../services/api'
import { PageHeader, Spinner, Alert, HashRow } from '../components/ui/Components'

const mono = { fontFamily: 'IBM Plex Mono, monospace' }
const label = { fontSize: '11px', color: 'var(--text3)', ...mono, textTransform: 'uppercase', marginBottom: '4px' }
const th = { textAlign: 'left', padding: '10px 14px', fontSize: '11px', color: 'var(--text3)', fontWeight: 500, borderBottom: '1px solid var(--border)', ...mono, textTransform: 'uppercase', whiteSpace: 'nowrap' }
const td = { padding: '10px 14px', fontSize: '13px', borderBottom: '1px solid var(--border)', verticalAlign: 'middle' }
const smallBtn = { background: 'var(--bg4)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', cursor: 'pointer' }

function fmt(ts) {
  return ts ? ts.slice(0, 19).replace('T', ' ') : '—'
}

export default function DocumentDetail() {
  const { id } = useParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [file, setFile] = useState(null)
  const [uploading, setUploading] = useState(false)
  const [busy, setBusy] = useState(null)
  const inputRef = useRef()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin = user.role === 'admin'

  function load() {
    return getDocumentVersions(id)
      .then(res => { setData(res.data); setError('') })
      .catch(err => setError(err.response?.data?.error || 'Document not found on the ledger.'))
  }
  useEffect(() => { load() }, [id])

  async function handleUpload() {
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await uploadDocumentVersion(id, fd)
      toast.success(res.data.message)
      setFile(null)
      if (inputRef.current) inputRef.current.value = ''
      await load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  async function handleGet(v, inline) {
    setBusy(`${v.version}-${inline}`)
    const tab = inline ? window.open('', '_blank') : null
    try {
      let res
      try {
        res = await downloadDocumentVersion(id, v.version, { inline })
      } catch (err) {
        const body = await readBlobError(err)
        if (err.response?.status === 409 && body.tampered && isAdmin && body.canOverride &&
            window.confirm(`${body.error}\n\nOpen it anyway for investigation? (This is logged.)`)) {
          res = await downloadDocumentVersion(id, v.version, { inline, override: true })
        } else {
          throw Object.assign(err, { body })
        }
      }
      if (inline) {
        const url = URL.createObjectURL(res.data)
        if (tab) tab.location.href = url
        else window.open(url, '_blank')
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      } else {
        triggerDownload(res.data, v.filename || `version-${v.version}`)
      }
    } catch (err) {
      tab?.close()
      toast.error(err.body?.error || err.response?.data?.error || 'Download failed.', { duration: 6000 })
    } finally {
      setBusy(null)
    }
  }

  if (error) return <div className="animate-in"><PageHeader title="Document details" /><Alert type="error">{error}</Alert><Link to="/" style={{ color: 'var(--accent)', fontSize: '13px' }}>← Back to dashboard</Link></div>
  if (!data) return <Spinner />

  const doc = data.document
  const versions = [...data.versions].reverse()
  const canEdit = (isAdmin || doc.uploader === user.username) && doc.status === 'active'

  return (
    <div className="animate-in">
      <PageHeader
        title={doc.filename}
        sub="Document details, blockchain hashes and version history"
        action={<Link to={`/verify?id=${doc.docId}`}><button className="btn-primary">◎ Verify integrity</button></Link>}
      />

      {doc.tampered && (
        <Alert type="error">⚠ This document is flagged as TAMPERED ({(doc.tamperReasons || []).map(r => TAMPER_REASON_LABELS[r] || r).join(', ') || 'see audit trail'}).</Alert>
      )}

      {/* Metadata */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1.25rem' }}>
          <div><div style={label}>Document type</div><span className="badge badge-purple">{doc.docType}</span></div>
          <div><div style={label}>Office</div><span className="badge badge-blue">{doc.department}</span></div>
          {data.filing && (
            <div><div style={label}>Filed under</div>
              <Link to={`/repository?year=${data.filing.recordYear}&quarter=${data.filing.recordQuarter}`} style={{ fontSize: '14px', color: 'var(--brand-primary)', fontWeight: 500, textDecoration: 'none' }}>
                {filingLabel(data.filing.recordYear, data.filing.recordQuarter)}
              </Link>
              {data.filing.resolutionNumber && <div style={{ fontSize: '12px', color: 'var(--text3)' }}>No. {data.filing.resolutionNumber}</div>}
            </div>
          )}
          <div><div style={label}>Owner</div><div style={{ fontSize: '14px' }}>{doc.uploader}</div></div>
          <div><div style={label}>Uploaded (ledger time)</div><div style={{ fontSize: '13px', ...mono }}>{fmt(doc.registeredAt)}</div></div>
          <div><div style={label}>Current version</div><div style={{ fontSize: '14px', fontWeight: 600 }}>v{data.currentVersion}</div></div>
          <div><div style={label}>Status</div>
            <span className={`badge ${doc.status !== 'active' ? 'badge-purple' : doc.tampered ? 'badge-red' : 'badge-green'}`}>
              {doc.status !== 'active' ? 'INACTIVE' : doc.tampered ? '⚠ TAMPERED' : 'INTACT'}
            </span>
          </div>
        </div>
        <hr className="divider" />
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem', fontSize: '12px' }}>
          <div><span style={{ color: 'var(--text3)' }}>Document ID: </span><span style={mono}>{doc.docId}</span></div>
          <div><span style={{ color: 'var(--text3)' }}>Registration transaction: </span><span style={mono}>{doc.registeredTxId ? `${doc.registeredTxId.slice(0, 20)}…` : '—'}</span></div>
          <div><span style={{ color: 'var(--text3)' }}>Last verified: </span><span style={mono}>{fmt(doc.lastVerifiedAt)}</span></div>
        </div>
      </div>

      {/* Hashes */}
      <div className="card" style={{ marginBottom: '1.25rem' }}>
        <h3 style={{ fontSize: '12px', color: 'var(--text3)', ...mono, marginBottom: '1rem', textTransform: 'uppercase' }}>Current version hashes (stored on the blockchain)</h3>
        <HashRow label="MD5" value={doc.hashes?.md5} />
        <HashRow label="SHA-1" value={doc.hashes?.sha1} />
        <HashRow label="SHA-256 (integrity proof)" value={doc.hashes?.sha256} />
      </div>

      {/* Version history */}
      <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: '1.25rem' }}>
        <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px' }}>
          <div style={{ fontWeight: 600 }}>Version history</div>
          <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Each version's SHA-256 is kept on the ledger; files are checked before they are served</div>
        </div>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Version', 'File name', 'Uploaded by', 'Date', 'SHA-256', ''].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {versions.map(v => (
                <tr key={v.version} style={{ background: v.isCurrent ? 'var(--bg3)' : 'transparent' }}>
                  <td style={td}>
                    <span style={{ fontWeight: 600 }}>v{v.version}</span>
                    {v.isCurrent && <span className="badge badge-green" style={{ marginLeft: '8px' }}>CURRENT</span>}
                  </td>
                  <td style={td}>{v.filename || <span style={{ color: 'var(--text3)' }}>—</span>}</td>
                  <td style={{ ...td, color: 'var(--text2)' }}>{v.updatedBy}</td>
                  <td style={{ ...td, color: 'var(--text2)', ...mono, fontSize: '12px', whiteSpace: 'nowrap' }}>{fmt(v.updatedAt)}</td>
                  <td style={{ ...td, ...mono, fontSize: '12px' }} title={v.sha256}>{v.sha256 ? `${v.sha256.slice(0, 16)}…` : '—'}</td>
                  <td style={{ ...td, whiteSpace: 'nowrap' }}>
                    {v.fileAvailable ? (
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button style={smallBtn} disabled={!!busy} onClick={() => handleGet(v, true)}>View</button>
                        <button style={{ ...smallBtn, color: 'var(--accent)' }} disabled={!!busy} onClick={() => handleGet(v, false)}>
                          {busy === `${v.version}-false` ? '...' : '↓ Download'}
                        </button>
                      </div>
                    ) : <span style={{ fontSize: '12px', color: 'var(--text3)' }}>file not kept</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Upload new version */}
      {canEdit && (
        <div className="card">
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>Upload a new version</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '1rem' }}>
            The new file's MD5, SHA-1 and SHA-256 are written to the blockchain as version {data.currentVersion + 1}. Earlier versions and their hashes stay on record.
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input ref={inputRef} type="file" onChange={e => setFile(e.target.files[0] || null)} style={{ flex: 1, minWidth: '220px' }} />
            <button className="btn-primary" onClick={handleUpload} disabled={!file || uploading}>
              {uploading ? 'Registering on blockchain...' : `↑ Upload as v${data.currentVersion + 1}`}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
