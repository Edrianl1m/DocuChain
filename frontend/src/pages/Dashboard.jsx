import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { getDocuments, healthCheck, getTamperedDocuments, downloadDocument, deleteDocument, triggerDownload } from '../services/api'
import { StatCard, Spinner, PageHeader } from '../components/ui/Components'

export default function Dashboard() {
  const [docs, setDocs] = useState([])
  const [tampered, setTampered] = useState([])
  const [health, setHealth] = useState(null)
  const [loading, setLoading] = useState(true)
  const [downloading, setDownloading] = useState(null)
  const [copied, setCopied] = useState(null)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin = user.role === 'admin'

  useEffect(() => {
    async function load() {
      try {
        const [docsRes, tamperedRes, healthRes] = await Promise.allSettled([
          getDocuments(),
          getTamperedDocuments(),
          healthCheck(),
        ])
        if (docsRes.status === 'fulfilled') setDocs(docsRes.value.data.documents || [])
        if (tamperedRes.status === 'fulfilled') setTampered(tamperedRes.value.data.tampered || [])
        if (healthRes.status === 'fulfilled') setHealth(healthRes.value.data)
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  async function handleDownload(doc) {
    setDownloading(doc.docId)
    try {
      const res = await downloadDocument(doc.docId)
      triggerDownload(res.data, doc.filename)
    } catch (err) {
      alert(err.response?.data?.error || 'Download failed.')
    } finally {
      setDownloading(null)
    }
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
          background: 'var(--red-bg)', border: '1px solid #3a1515',
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
                  {['Filename', 'Department', 'Type', 'Uploader', 'Date', 'Status', 'Doc ID', 'Actions'].map(h => (
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
                      {doc.filename}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      <span className="badge badge-blue">{doc.department}</span>
                    </td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: '12px' }}>{doc.docType}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text2)', fontSize: '12px' }}>{doc.uploader}</td>
                    <td style={{ padding: '10px 12px', color: 'var(--text3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap' }}>
                      {doc.registeredAt?.slice(0, 10)}
                    </td>
                    <td style={{ padding: '10px 12px' }}>
                      {doc.tampered
                        ? <span className="badge badge-red">TAMPERED</span>
                        : <span className="badge badge-green">INTACT</span>
                      }
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
                        {/* Delete: admin only */}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(doc.docId)}
                            style={{
                              background: 'var(--red-bg)', border: '1px solid #3a1515',
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
