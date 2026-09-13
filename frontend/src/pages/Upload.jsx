import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { uploadDocument } from '../services/api'
import { PageHeader, Alert, HashRow } from '../components/ui/Components'

const DEPARTMENTS = ['General', 'IT', 'HR', 'Finance', 'Academic', 'Admin', 'Legal', 'Research']
const DOC_TYPES = ['Document', 'Contract', 'Report', 'Certificate', 'Invoice', 'Memo', 'Policy', 'Other']

export default function Upload() {
  const [file, setFile] = useState(null)
  const [drag, setDrag] = useState(false)
  const [form, setForm] = useState({ department: 'General', docType: 'Document', tags: '' })
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef()
  const navigate = useNavigate()

  function handleDrop(e) {
    e.preventDefault()
    setDrag(false)
    const f = e.dataTransfer.files[0]
    if (f) setFile(f)
  }

  function handleFile(e) {
    if (e.target.files[0]) setFile(e.target.files[0])
  }

  function formatSize(bytes) {
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB'
  }

  async function handleUpload() {
    if (!file) return
    setError('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      fd.append('department', form.department)
      fd.append('docType', form.docType)
      fd.append('tags', form.tags)
      const res = await uploadDocument(fd)
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed.')
    } finally {
      setLoading(false)
    }
  }

  if (result) return (
    <div className="animate-in">
      <PageHeader title="Upload Complete" sub="Document registered on the blockchain ledger" />
      <div className="card" style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '1.5rem' }}>
          <div style={{ width: '40px', height: '40px', borderRadius: '10px', background: 'var(--green-bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '20px' }}>✓</div>
          <div>
            <div style={{ fontWeight: '500', color: 'var(--green)', marginBottom: '2px' }}>Successfully registered</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{result.filename}</div>
          </div>
        </div>

        <div style={{ marginBottom: '1.25rem' }}>
          <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>DOCUMENT ID</div>
          <div className="hash-highlight">{result.docId}</div>
        </div>

        <HashRow label="MD5" value={result.hashes?.md5} />
        <HashRow label="SHA-1" value={result.hashes?.sha1} />
        <HashRow label="SHA-256 (stored on ledger)" value={result.hashes?.sha256} />
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="btn-primary" onClick={() => { setResult(null); setFile(null) }}>Upload another</button>
        <button className="btn-ghost" onClick={() => navigate('/')}>Back to dashboard</button>
      </div>
    </div>
  )

  return (
    <div className="animate-in">
      <PageHeader title="Upload Document" sub="Files are hashed and registered on the blockchain ledger" />

      {error && <Alert type="error">{error}</Alert>}

      {/* Drop zone */}
      <div
        onClick={() => inputRef.current.click()}
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${drag ? 'var(--accent)' : file ? 'var(--green)' : 'var(--border2)'}`,
          borderRadius: 'var(--radius-lg)', padding: '3rem 2rem',
          textAlign: 'center', cursor: 'pointer',
          background: drag ? '#0d1a2d' : file ? 'var(--green-bg)' : 'var(--bg2)',
          transition: 'all 0.15s', marginBottom: '1.5rem',
        }}
      >
        <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={handleFile} />
        {file ? (
          <div>
            <div style={{ fontSize: '32px', marginBottom: '0.75rem' }}>📄</div>
            <div style={{ fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>{file.name}</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)' }}>{formatSize(file.size)}</div>
            <button className="btn-ghost" style={{ marginTop: '1rem', fontSize: '12px' }} onClick={e => { e.stopPropagation(); setFile(null) }}>Remove</button>
          </div>
        ) : (
          <div>
            <div style={{ fontSize: '32px', marginBottom: '0.75rem', opacity: 0.5 }}>↑</div>
            <div style={{ fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>Drop file here or click to browse</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>PDF, DOCX, XLSX, PPTX, TXT, CSV, images — max 50MB</div>
          </div>
        )}
      </div>

      {/* Metadata */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1.25rem', color: 'var(--text2)', fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Document Metadata</h2>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>DEPARTMENT</label>
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
              {DEPARTMENTS.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>DOCUMENT TYPE</label>
            <select value={form.docType} onChange={e => setForm(f => ({ ...f, docType: e.target.value }))}>
              {DOC_TYPES.map(d => <option key={d}>{d}</option>)}
            </select>
          </div>
        </div>
        <div>
          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>TAGS (comma-separated)</label>
          <input placeholder="e.g. 2024, Q1, finance" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
        </div>
      </div>

      {/* Hashing info */}
      <div style={{ background: '#0d1a2d', border: '1px solid #1a3050', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: '12px', color: 'var(--text2)' }}>
        <span style={{ color: 'var(--accent)', fontWeight: '500' }}>ℹ Hashing: </span>
        DocuChain computes MD5, SHA-1, and SHA-256 on upload. The SHA-256 hash is stored on the Hyperledger Fabric ledger as the integrity proof.
      </div>

      <button
        className="btn-primary"
        onClick={handleUpload}
        disabled={!file || loading}
        style={{ padding: '11px 28px', opacity: (!file || loading) ? 0.5 : 1 }}
      >
        {loading ? 'Uploading & registering on ledger...' : '↑ Upload & Register'}
      </button>
    </div>
  )
}
