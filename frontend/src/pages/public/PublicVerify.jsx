import { useState, useRef, useEffect } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { verifyPublicDocument, getPublicResolution } from '../../services/api'
import { Alert, HashRow } from '../../components/ui/Components'
import PublicLayout from '../../components/public/PublicLayout'

export default function PublicVerify() {
  const [params] = useSearchParams()
  const [docId, setDocId] = useState(params.get('doc') || '')
  const [file, setFile] = useState(null)
  const [drag, setDrag] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState(null)
  const [error, setError] = useState('')
  const inputRef = useRef()
  const [target, setTarget] = useState(null)
  // The resolution ID is optional: hidden unless asked for, or opened from a resolution
  const [showId, setShowId] = useState(!!params.get('doc'))

  // Opened from a resolution's "Verify a copy" button: show which one
  useEffect(() => {
    const id = params.get('doc')
    if (!id) return
    getPublicResolution(id).then(res => setTarget(res.data.resolution)).catch(() => setTarget(null))
  }, [params])

  async function handleVerify() {
    if (!file) return
    setError('')
    setResult(null)
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      if (showId && docId.trim()) fd.append('docId', docId.trim())
      const res = await verifyPublicDocument(fd)
      setResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  function reset() {
    setFile(null)
    setResult(null)
    setError('')
  }

  const ok = result?.result === 'authentic'
  const outdated = result?.result === 'outdated'
  const sameText = result?.result === 'content_match' || result?.result === 'renamed' || outdated
  const ident = result?.identification
  const resName = result?.resolution ? (result.resolution.resolutionNumber ? `Resolution No. ${result.resolution.resolutionNumber}` : result.resolution.title) : ''
  const tone = ok ? 'green' : sameText ? 'yellow' : 'red'
  const border = ok ? 'var(--status-verified-border)' : sameText ? 'var(--status-warning-border)' : 'var(--status-tampered-border)'

  return (
    <PublicLayout>
      <section style={{ marginBottom: '1.75rem' }}>
        <h1 style={{ fontSize: '26px', fontWeight: '600', marginBottom: '4px' }}>Verify a document</h1>
        <p style={{ color: 'var(--text2)', fontSize: '14px' }}>
          Got a copy of a resolution? Just upload it. No resolution ID needed: DocuChain computes the file's SHA-256 fingerprint and finds the matching resolution on the blockchain by itself. Your file is not stored.
        </p>
      </section>

      {error && <Alert type="error">{error}</Alert>}

      {!result && (
        <>
          {showId && target && target.docId === docId.trim() && (
            <div className="card public-verify-target">
              <div className="public-field-label">Checking against</div>
              <div style={{ fontWeight: 600 }}>{target.resolutionNumber ? `Resolution No. ${target.resolutionNumber} · ` : ''}{target.title}</div>
              <Link to={`/public/resolutions/${encodeURIComponent(target.docId)}`} className="public-link" style={{ fontSize: '12px' }}>View this resolution</Link>
            </div>
          )}
          <div
            onClick={() => inputRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) setFile(e.dataTransfer.files[0]) }}
            style={{
              border: `2px dashed ${drag ? 'var(--accent)' : file ? 'var(--green)' : 'var(--border2)'}`,
              borderRadius: 'var(--radius-lg)', padding: '2.5rem 1.5rem', textAlign: 'center', cursor: 'pointer',
              background: drag ? 'var(--brand-surface)' : file ? 'var(--green-bg)' : 'var(--bg2)', marginBottom: '1rem',
            }}
          >
            <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && setFile(e.target.files[0])} />
            <div style={{ fontSize: '30px', marginBottom: '0.5rem', opacity: file ? 1 : 0.5 }}>{file ? '📄' : '◎'}</div>
            <div style={{ fontWeight: '500' }}>{file ? file.name : 'Drop the file here or click to choose'}</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{file ? `${(file.size / 1024).toFixed(1)} KB` : 'PDF or any file published on this site'}</div>
          </div>

          <button className="btn-primary" onClick={handleVerify} disabled={!file || loading} style={{ padding: '11px 28px', opacity: (!file || loading) ? 0.5 : 1 }}>
            {loading ? 'Checking the blockchain...' : '◎ Verify document'}
          </button>

          <div style={{ marginTop: '1.25rem' }}>
            {!showId ? (
              <button type="button" onClick={() => setShowId(true)}
                style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}>
                Advanced: check against a specific resolution ID
              </button>
            ) : (
              <div className="card">
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>
                  RESOLUTION ID (optional, advanced)
                </label>
                <input placeholder="e.g. 3f7a2c1d-..." value={docId} onChange={e => setDocId(e.target.value)} />
                <button type="button" onClick={() => { setShowId(false); setDocId('') }}
                  style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', marginTop: '8px' }}>
                  Remove the ID and search all published resolutions
                </button>
              </div>
            )}
          </div>
        </>
      )}

      {result && (
        <div className="animate-in">
          <div className="card" style={{
            marginBottom: '1rem',
            borderColor: border,
            background: `var(--${tone}-bg)`,
          }}>
            <div style={{ display: 'flex', gap: '14px', alignItems: 'center', marginBottom: '1rem' }}>
              <div style={{ fontSize: '34px' }}>{ok ? '✓' : '⚠'}</div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: `var(--${tone})` }}>
                  {ok ? 'Authentic document'
                    : result.result === 'renamed' ? 'File name changed — waiting for confirmation'
                    : outdated ? `Genuine, but an OUTDATED version (v${ident?.version} of ${ident?.currentVersion})`
                    : sameText ? 'Not the original file, but the text matches'
                    : result.result === 'tampered' ? (ident?.matchedBy === 'content' || ident?.matchedBy === 'filename' ? `ALTERED copy of ${resName}` : 'Does not match the official copy')
                    : 'No matching resolution'}
                </div>
                <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{result.message}</div>
              </div>
            </div>

            {result.resolution && (
              <div style={{ fontSize: '13px', marginBottom: '1rem' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase', marginBottom: '2px' }}>
                  {ident?.match === 'exact' ? 'Identified as' : ident?.match === 'similar' ? 'Most likely original' : 'Checked against'}
                  {ident?.match === 'exact' && ' · exact SHA-256 match'}
                  {ident?.matchedBy === 'content' && ` · text ${Math.round((ident.similarity || 0) * 100)}% similar`}
                  {ident?.matchedBy === 'filename' && ' · same file name'}
                  {ident?.currentVersion > 1 && ` · version ${ident.version} of ${ident.currentVersion}`}
                </div>
                <div style={{ fontWeight: '500' }}>{result.resolution.title}</div>
                <div style={{ color: 'var(--text2)' }}>
                  {result.resolution.resolutionNumber && `Resolution No. ${result.resolution.resolutionNumber} · `}
                  {result.resolution.blockNumber !== null && result.resolution.blockNumber !== undefined ? `Block ${result.resolution.blockNumber}` : 'On ledger'}
                  {result.resolution.txId && ` · Tx ${result.resolution.txId.slice(0, 12)}…`}
                </div>
              </div>
            )}

            <HashRow label="SHA-256 of your file" value={result.providedHash} />
            {result.expectedHash && <HashRow label={outdated ? `SHA-256 of version ${ident?.version} on record` : 'SHA-256 on record'} value={result.expectedHash} />}
            {outdated && result.currentHash && <HashRow label={`SHA-256 of the current version (v${ident?.currentVersion})`} value={result.currentHash} />}
            {result.nameCheck?.renamed && (
              <div style={{ fontSize: '12px', color: 'var(--text2)', margin: '0.5rem 0' }}>
                <div><span style={{ color: 'var(--text3)' }}>Official file name: </span>{result.nameCheck.registeredName}</div>
                <div><span style={{ color: 'var(--text3)' }}>Your file name: </span>{result.nameCheck.providedName}</div>
              </div>
            )}
            {result.contentCheck?.status === 'changed' && (
              <div style={{ fontSize: '12px', color: 'var(--text2)', margin: '0.5rem 0' }}>
                <div style={{ marginBottom: '4px' }}>The text was changed{result.contentCheck.comparedWithVersion ? ` (compared with version ${result.contentCheck.comparedWithVersion})` : ''}. First difference:</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace' }}><span style={{ color: 'var(--text3)' }}>Official: </span>{result.contentCheck.firstDifference?.original}</div>
                <div style={{ fontFamily: 'IBM Plex Mono, monospace' }}><span style={{ color: 'var(--text3)' }}>Your file: </span>{result.contentCheck.firstDifference?.provided}</div>
              </div>
            )}
            {result.resolution && !result.ledgerChecked && (
              <div style={{ fontSize: '12px', color: 'var(--yellow)' }}>
                The blockchain network could not be reached just now, so this was checked against the hash recorded when the resolution was published.
              </div>
            )}
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <button className="btn-ghost" onClick={reset}>Verify another file</button>
            {result.resolution?.docId && <Link to={`/public/resolutions/${encodeURIComponent(result.resolution.docId)}`}><button className="btn-ghost">{outdated ? 'Get the current version' : 'View the official resolution'}</button></Link>}
            <Link to="/public/resolutions"><button className="btn-ghost">Back to resolutions</button></Link>
          </div>
        </div>
      )}
    </PublicLayout>
  )
}
