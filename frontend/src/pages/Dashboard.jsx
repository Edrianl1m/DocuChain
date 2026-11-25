import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import toast from 'react-hot-toast'
import { getDocuments, getRecords, filingLabel, healthCheck, getTamperedDocuments, downloadDocument, deleteDocument, triggerDownload, readBlobError, TAMPER_REASON_LABELS } from '../services/api'
import { StatCard, Spinner, PageHeader } from '../components/ui/Components'
import { isResolution } from '../constants/tor'

export default function Dashboard() {
  const [docs, setDocs] = useState([])
  const [tampered, setTampered] = useState([])
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(null)
  const [copied, setCopied] = useState(null)
  const [filing, setFiling] = useState({}) // docId -> { recordYear, recordQuarter }
  const [records, setRecords] = useState([])

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin = user.role === 'admin'

  useEffect(() => {
    async function load() {
      try {
        const [docsRes, tamperedRes, healthRes, recordsRes] = await Promise.allSettled([
          getDocuments(),
          getTamperedDocuments(),
          healthCheck(),
          getRecords(),
        ])
        if (recordsRes.status === 'fulfilled') {
          const list = recordsRes.value.data.records || []
          setRecords(list)
          setFiling(Object.fromEntries(list.map(r => [r.docId, r])))
        }
        if (docsRes.status === 'fulfilled') setDocs(docsRes.value.data.documents || [])
        if (tamperedRes.status === 'fulfilled') setTampered(tamperedRes.value.data.tampered || [])
        if (healthRes.status === 'fulfilled') setHealth(healthRes.value.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  // The server re-hashes the file and checks it on the blockchain first.
  // A tampered document is blocked (409); admins may fetch it to investigate.
  async function handleDownload(doc, { inline = false } = {}) {
    setDownloading(doc.docId)
    // Open the tab now so the browser doesn't block it as a pop-up
    const tab = inline ? window.open('', '_blank') : null
    try {
      let res
      try {
        res = await downloadDocument(doc.docId, { inline })
      } catch (err) {
        const body = await readBlobError(err)
        if (err.response?.status === 409 && body.tampered) {
          markTampered(doc.docId, body.reasons)
          if (!(isAdmin && body.canOverride && window.confirm(`${body.error}\n\nThis file is blocked. Open it anyway for investigation? (This is logged.)`))) {
            tab?.close()
            toast.error(isAdmin ? 'Tampered — file blocked.' : 'Tampered — this file is blocked. An administrator has been notified.', { duration: 6000 })
            return
          }
          res = await downloadDocument(doc.docId, { inline, override: true })
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
        triggerDownload(res.data, doc.filename)
      }
    } catch (err) {
      tab?.close()
      toast.error(err.body?.error || err.response?.data?.error || 'Download failed.')
    } finally {
      setDownloading(null)
    }
  }

  function markTampered(docId, reasons = []) {
    setDocs(list => list.map(d => d.docId === docId ? { ...d, tampered: true, tamperReasons: reasons } : d))
    setTampered(list => list.some(d => d.docId === docId) ? list : [...list, { ...docs.find(d => d.docId === docId), tampered: true, tamperReasons: reasons }])
  }

  async function handleDelete(docId) {
    if (!window.confirm('Deactivate this document? This cannot be undone.')) return
    try {
      await deleteDocument(docId)
      setDocs(d => d.filter(doc => doc.docId !== docId))
    } catch (err) {
      alert(err.response?.data?.error || 'Delete failed.')
    }
  }

  function copyId(docId) {
    navigator.clipboard.writeText(docId)
    setCopied(docId)
    setTimeout(() => setCopied(null), 1500)
  }

  if (loading) return <Spinner />

  return (
    <div className="animate-in">
      <PageHeader
        title="Dashboard"
        sub={isAdmin ? 'System overview — all documents' : `My documents — ${user.username}`}
        action={<Link to="/upload"><button className="btn-primary">↑ Upload Document</button></Link>}
      />

      {/* System status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '2rem' }}>
        <div style={{ width: '8px', height: '8px', borderRadius: '50%', background: health ? 'var(--green)' : 'var(--red)' }} />
        <span style={{ fontSize: '12px', color: 'var(--text2)', fontFamily: 'IBM Plex Mono, monospace' }}>
          {health ? `System operational` : 'Backend offline'}
        </span>
        {isAdmin && <span className="badge badge-blue" style={{ marginLeft: '8px' }}>Admin</span>}
      </div>

      {/* Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '2rem' }}>
        <StatCard label="Total Documents" value={docs.length} sub={isAdmin ? 'On blockchain ledger' : 'Your documents'} color="var(--accent)" />
        <StatCard label="Intact" value={docs.filter(d => !d.tampered).length} sub="Verified clean" color="var(--green)" />
        {isAdmin && <StatCard label="Tampered" value={tampered.length} sub="Integrity violations" color={tampered.length > 0 ? 'var(--red)' : 'var(--text3)'} />}
        <StatCard label="Active" value={docs.filter(d => d.status === 'active').length} sub="Accessible" color="var(--purple)" />
      </div>

      {/* Tampered alert — admin only */}
      {isAdmin && tampered.length > 0 && (
        <div style={{
          background: 'var(--red-bg)', border: '1px solid var(--status-tampered-border)',
          borderRadius: 'var(--radius-lg)', padding: '1rem 1.25rem',
          marginBottom: '2rem', display: 'flex', alignItems: 'center', gap: '12px',
        }}>
          <span style={{ fontSize: '20px' }}>⚠</span>
          <div>
            <div style={{ color: 'var(--red)', fontWeight: '500', marginBottom: '2px' }}>Integrity Alert</div>
            <div style={{ color: 'var(--text2)', fontSize: '13px' }}>
              {tampered.length} document(s) failed integrity verification.{' '}
              <Link to="/audit" style={{ color: 'var(--red)', textDecoration: 'underline' }}>View audit trail →</Link>
            </div>
          </div>
        </div>
      )}

      {/* Records by quarter (latest year with documents) */}
      {records.length > 0 && (() => {
        const year = Math.max(...records.map(r => r.recordYear || 0))
        const inYear = records.filter(r => r.recordYear === year)
        return (
          <div className="card" style={{ marginBottom: '1.5rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '500' }}>Records filed in {year}</h2>
              <Link to="/repository" style={{ fontSize: '12px', color: 'var(--accent)' }}>Open Repository →</Link>
            </div>
            <div className="dash-quarters">
              {[1, 2, 3, 4].map(q => {
                const docs = inYear.filter(r => r.recordQuarter === q)
                const resolutions = docs.filter(r => isResolution(r.docType)).length
                return (
                  <Link key={q} to={`/repository?year=${year}&quarter=${q}`} className="dash-quarter">
                    <b>Quarter {q}</b>
                    <div>{docs.length}</div>
                    <span>{docs.length ? `${resolutions} resolution${resolutions === 1 ? '' : 's'} · ${docs.length - resolutions} other` : 'Nothing filed'}</span>
                  </Link>
                )
              })}
            </div>
          </div>
        )
      })()}

      {/* Documents table */}
      <div className="card">
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '15px', fontWeight: '500' }}>
            {isAdmin ? 'All Documents' : 'My Documents'}
          </h2>
          <Link to="/search" style={{ fontSize: '12px', color: 'var(--accent)' }}>Search →</Link>
        </div>

        {docs.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '3rem', color: 'var(--text3)' }}>
            <div style={{ fontSize: '32px', marginBottom: '0.75rem', opacity: 0.3 }}>◈</div>
            <div style={{ color: 'var(--text2)', marginBottom: '4px' }}>No documents yet</div>
            <Link to="/upload" style={{ fontSize: '13px', color: 'var(--accent)' }}>Upload your first document →</Link>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr>
                  {['Filename', 'Office', 'Type', 'Filed under', 'Uploader', 'Date', 'Status', 'Doc ID', 'Actions'].map(h => (
                    <th key={h} style={{
                      textAlign: 'left', padding: '8px 12px',
                      fontSize: '11px', color: 'var(--text3)',
                      fontFamily: 'IBM Plex Mono, monospace', fontWeight: '400',
                      borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap'
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {docs.map((doc, i) => (
                  <tr key={doc.docId || i}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '10px 12px', fontSize: '13px', color: 'var(--text)', maxWidth: '180px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <Link to={`/documents/${doc.docId}`} title="Details and version history" style={{ color: 'var(--text)', textDecoration: 'none', borderBottom: '1px dotted var(--text3)' }}>{doc.filename}</Link>
                      {doc.versionHistory?.length > 1 && <span className="badge badge-purple" style={{ marginLeft: '6px', fontSize: '10px' }}>v{doc.versionHistory.length}</span>}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className="badge badge-blue">{doc.department}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: '12px' }}>{doc.docType}</td>
                    <td style={{ padding: '10px 12px', fontSize: '12px', whiteSpace: 'nowrap' }}>
                      {filing[doc.docId]
                        ? <Link to={`/repository?year=${filing[doc.docId].recordYear}&quarter=${filing[doc.docId].recordQuarter}`} style={{ color: 'var(--brand-primary)', textDecoration: 'none' }}>{filingLabel(filing[doc.docId].recordYear, filing[doc.docId].recordQuarter)}</Link>
                        : <span style={{ color: 'var(--text3)' }}>—</span>}
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: '12px' }}>{doc.uploader}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap' }}>
                      {doc.registeredAt?.slice(0, 10)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {doc.tampered
                        ? <span className="badge badge-red" title={(doc.tamperReasons || []).map(r => TAMPER_REASON_LABELS[r] || r).join(', ')}>⚠ TAMPERED</span>
                        : <span className="badge badge-green">INTACT</span>
                      }
                      {doc.tampered && doc.tamperReasons?.length > 0 && (
                        <div style={{ fontSize: '10px', color: 'var(--red)', marginTop: '3px' }}>{doc.tamperReasons.map(r => TAMPER_REASON_LABELS[r] || r).join(', ')}</div>
                      )}
                    </td>
                    {/* Doc ID with copy button */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                          {doc.docId?.slice(0, 8)}...
                        </span>
                        <button
                          onClick={() => copyId(doc.docId)}
                          style={{
                            background: copied === doc.docId ? 'var(--green-bg)' : 'var(--bg4)',
                            border: '1px solid var(--border)',
                            color: copied === doc.docId ? 'var(--green)' : 'var(--text3)',
                            borderRadius: '4px', padding: '2px 6px',
                            fontSize: '10px', cursor: 'pointer',
                          }}
                        >
                          {copied === doc.docId ? '✓' : 'copy'}
                        </button>
                      </div>
                    </td>
                    {/* Actions */}
                    <td style={{ padding: '10px 12px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        {/* Download: admin sees all, user sees own */}
                        {(isAdmin || doc.uploader === user.username) && (
                          <button
                            onClick={() => handleDownload(doc, { inline: true })}
                            disabled={downloading === doc.docId}
                            title="Open in a new tab (integrity-checked first)"
                            style={{
                              background: 'var(--bg4)', border: '1px solid var(--border)',
                              color: 'var(--text2)', borderRadius: '4px',
                              padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                              opacity: downloading === doc.docId ? 0.5 : 1,
                            }}
                          >
                            View
                          </button>
                        )}
                        {(isAdmin || doc.uploader === user.username) && (
                          <button
                            onClick={() => handleDownload(doc)}
                            disabled={downloading === doc.docId}
                            style={{
                              background: 'var(--bg4)', border: '1px solid var(--border)',
                              color: 'var(--accent)', borderRadius: '4px',
                              padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                              opacity: downloading === doc.docId ? 0.5 : 1,
                            }}
                          >
                            {downloading === doc.docId ? '...' : '↓ Download'}
                          </button>
                        )}
                        {(isAdmin || doc.uploader === user.username) && (
                          <Link to={`/documents/${doc.docId}`} title="Details, version history and new version upload"
                            style={{ background: 'var(--bg4)', border: '1px solid var(--border)', color: 'var(--text2)', borderRadius: '4px', padding: '4px 10px', fontSize: '11px', textDecoration: 'none', whiteSpace: 'nowrap' }}>
                            Versions
                          </Link>
                        )}
                        {/* Delete: admin only */}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(doc.docId)}
                            style={{
                              background: 'var(--red-bg)', border: '1px solid var(--status-tampered-border)',
                              color: 'var(--red)', borderRadius: '4px',
                              padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                            }}
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
