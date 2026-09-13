import { useState } from 'react'
import api, { getDocument } from '../services/api'
import { PageHeader, Alert, HashRow } from '../components/ui/Components'

export default function Verify() {
  const [docId, setDocId] = useState('')
  const [step, setStep] = useState('input')
  const [doc, setDoc] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [verifyFile, setVerifyFile] = useState(null)

  async function handleFetch() {
    if (!docId.trim()) return
    setError('')
    setLoading(true)
    try {
      const res = await getDocument(docId.trim())
      setDoc(res.data.document)
      setStep('fetched')
    } catch (err) {
      setError('Document not found on ledger. Check the ID and try again.')
    } finally {
      setLoading(false)
    }
  }

  async function handleVerify() {
    setError('')
    setLoading(true)
    try {
      const fd = new FormData()
      if (verifyFile) fd.append('file', verifyFile)
      const res = await api.post(`/documents/${docId.trim()}/verify`, fd)
      setResult(res.data)
      setStep('verified')
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setDocId('')
    setDoc(null)
    setResult(null)
    setStep('input')
    setError('')
    setVerifyFile(null)
  }

  return (
    <div className="animate-in">
      <PageHeader title="Verify Document" sub="Compare a document's current hash against the blockchain ledger record" />

      {error && <Alert type="error">{error}</Alert>}

      {step === 'input' && (
        <div className="card">
          <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '8px' }}>DOCUMENT ID</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              placeholder="e.g. 3f7a2c1d-..."
              value={docId}
              onChange={e => setDocId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetch()}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" onClick={handleFetch} disabled={!docId.trim() || loading} style={{ flexShrink: 0 }}>
              {loading ? '...' : 'Look up →'}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '10px' }}>
            The document ID is returned when you upload a document, or can be found in the dashboard.
          </p>
        </div>
      )}

      {step === 'fetched' && doc && (
        <div>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
              <div>
                <div style={{ fontWeight: '500', color: 'var(--text)', marginBottom: '4px' }}>{doc.filename}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-blue">{doc.department}</span>
                  <span className="badge badge-purple">{doc.docType}</span>
                  <span style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>Uploaded by {doc.uploader}</span>
                </div>
              </div>
              <span className="badge badge-green">Found on ledger</span>
            </div>

            <hr className="divider" />
            <h3 style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '1rem', textTransform: 'uppercase' }}>Stored Hashes (from blockchain)</h3>
            <HashRow label="MD5" value={doc.hashes?.md5} />
            <HashRow label="SHA-1" value={doc.hashes?.sha1} />
            <HashRow label="SHA-256 (integrity proof)" value={doc.hashes?.sha256} />

            <hr className="divider" />
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem', fontSize: '12px', marginBottom: '1.25rem' }}>
              <div><span style={{ color: 'var(--text3)' }}>Registered: </span><span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{doc.registeredAt?.slice(0, 19).replace('T', ' ')}</span></div>
              <div><span style={{ color: 'var(--text3)' }}>Last verified: </span><span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{doc.lastVerifiedAt ? doc.lastVerifiedAt.slice(0, 19).replace('T', ' ') : 'Never'}</span></div>
              <div><span style={{ color: 'var(--text3)' }}>Versions: </span><span>{doc.versionHistory?.length || 1}</span></div>
              <div><span style={{ color: 'var(--text3)' }}>Status: </span><span style={{ color: doc.tampered ? 'var(--red)' : 'var(--green)' }}>{doc.tampered ? '⚠ Previously tampered' : '✓ Clean'}</span></div>
            </div>

            <hr className="divider" />
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '8px' }}>
                UPLOAD FILE TO VERIFY (re-upload the original file to check its integrity)
              </label>
              <input type="file" onChange={e => setVerifyFile(e.target.files[0])} />
              {verifyFile
                ? <div style={{ fontSize: '12px', color: 'var(--green)', marginTop: '6px' }}>✓ {verifyFile.name} selected — will hash and compare against ledger</div>
                : <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>No file selected — will verify using stored hash only</div>
              }
            </div>
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-primary" onClick={handleVerify} disabled={loading}>
              {loading ? 'Verifying...' : '◎ Run Integrity Verification'}
            </button>
            <button className="btn-ghost" onClick={reset}>Cancel</button>
          </div>
        </div>
      )}

      {step === 'verified' && result && (
        <div className="animate-in">
          <div className="card" style={{
            marginBottom: '1rem',
            borderColor: result.isIntact ? 'var(--status-verified-border)' : 'var(--status-tampered-border)',
            background: result.isIntact ? 'var(--green-bg)' : 'var(--red-bg)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '36px' }}>{result.isIntact ? '✓' : '⚠'}</div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: result.isIntact ? 'var(--green)' : 'var(--red)', marginBottom: '4px' }}>
                  {result.isIntact ? 'Document is INTACT' : 'TAMPERING DETECTED'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                  {result.isIntact
                    ? 'The file hash matches the blockchain record. No modifications detected.'
                    : 'The file hash does NOT match the blockchain record. This document may have been modified.'}
                </div>
              </div>
            </div>
            <hr style={{ borderColor: result.isIntact ? 'var(--status-verified-border)' : 'var(--status-tampered-border)', margin: '1rem 0' }} />
            <HashRow label="Stored hash (ledger)" value={result.storedHash} />
            <HashRow label="Current hash (computed now)" value={result.providedHash} />
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginTop: '10px' }}>
              Verified at: {result.verifiedAt?.slice(0, 19).replace('T', ' ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-ghost" onClick={reset}>Verify another</button>
          </div>
        </div>
      )}
    </div>
  )
}
