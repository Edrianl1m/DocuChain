import { useState, useEffect, useRef } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import api, { getDocument, verifyByFile, TAMPER_REASON_LABELS } from '../services/api'
import { PageHeader, Alert, HashRow } from '../components/ui/Components'

const mono = { fontFamily: 'IBM Plex Mono, monospace' }
const label11 = { display: 'block', fontSize: '11px', color: 'var(--text3)', ...mono, marginBottom: '8px' }

export default function Verify() {
  const [docId, setDocId] = useState('')
  const [step, setStep] = useState('input')
  // simple = upload the file only (default); advanced = check against a document ID
  const [mode, setMode] = useState('simple')
  const [doc, setDoc] = useState(null)
  const [result, setResult] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [verifyFile, setVerifyFile] = useState(null)
  const [drag, setDrag] = useState(false)
  const inputRef = useRef()
  const [searchParams] = useSearchParams()

  // /verify?id=<docId> (from the document details page) looks the document up directly
  useEffect(() => {
    const id = searchParams.get('id')
    if (id) { setMode('advanced'); setDocId(id); handleFetch(id) }
  }, [])

  async function handleFetch(idArg) {
    const id = (typeof idArg === 'string' ? idArg : docId).trim()
    if (!id) return
    setError('')
    setLoading(true)
    try {
      const res = await getDocument(id)
      setDoc(res.data.document)
      setStep('fetched')
    } catch (err) {
      setError('Document not found on ledger. Check the ID and try again.')
    } finally {
      setLoading(false)
    }
  }

  // Upload only: the server finds the document by the file itself
  async function handleSimpleVerify() {
    if (!verifyFile) return
    setError('')
    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('file', verifyFile)
      const res = await verifyByFile(fd)
      setResult(res.data)
      setStep('verified')
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed.')
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
    setMode('simple')
    setError('')
    setVerifyFile(null)
  }

  return (
    <div className="animate-in">
      <PageHeader title="Verify Document" sub="Upload a document to check it against the blockchain. No document ID needed." />

      {error && <Alert type="error">{error}</Alert>}

      {step === 'input' && mode === 'simple' && (
        <div>
          <div
            onClick={() => inputRef.current.click()}
            onDragOver={e => { e.preventDefault(); setDrag(true) }}
            onDragLeave={() => setDrag(false)}
            onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files[0]) setVerifyFile(e.dataTransfer.files[0]) }}
            style={{
              border: `2px dashed ${drag ? 'var(--accent)' : verifyFile ? 'var(--green)' : 'var(--border2)'}`,
              borderRadius: 'var(--radius-lg)', padding: '2.75rem 1.5rem', textAlign: 'center', cursor: 'pointer',
              background: drag ? 'var(--brand-surface)' : verifyFile ? 'var(--green-bg)' : 'var(--bg2)', marginBottom: '1rem',
            }}
          >
            <input ref={inputRef} type="file" style={{ display: 'none' }} onChange={e => e.target.files[0] && setVerifyFile(e.target.files[0])} />
            <div style={{ fontSize: '32px', marginBottom: '0.5rem', opacity: verifyFile ? 1 : 0.5 }}>{verifyFile ? '📄' : '◎'}</div>
            <div style={{ fontWeight: '500', marginBottom: '4px' }}>{verifyFile ? verifyFile.name : 'Drop the document here or click to choose'}</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
              {verifyFile ? `${(verifyFile.size / 1024).toFixed(1)} KB` : 'No document ID needed. DocuChain finds the matching record on the blockchain by itself.'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <button className="btn-primary" onClick={handleSimpleVerify} disabled={!verifyFile || loading}>
              {loading ? 'Checking the blockchain...' : '◎ Verify document'}
            </button>
            {verifyFile && !loading && <button className="btn-ghost" onClick={() => setVerifyFile(null)}>Clear</button>}
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '12px' }}>
            The file's MD5, SHA-1 and SHA-256 are computed and compared with every registered document and every version.
            If nothing matches exactly, DocuChain looks for the registered document with the most similar text, so an edited copy is reported as an altered copy of its original.
          </p>
          <p style={{ fontSize: '12px', marginTop: '6px' }}>
            <button type="button" className="link-button" onClick={() => { setMode('advanced'); setVerifyFile(null) }}
              style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: '12px' }}>
              Advanced: check against a specific document ID →
            </button>
          </p>
        </div>
      )}

      {step === 'input' && mode === 'advanced' && (
        <div className="card">
          <label style={label11}>DOCUMENT ID</label>
          <div style={{ display: 'flex', gap: '10px' }}>
            <input
              placeholder="e.g. 3f7a2c1d-..."
              value={docId}
              onChange={e => setDocId(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleFetch()}
              style={{ flex: 1 }}
            />
            <button className="btn-primary" onClick={() => handleFetch()} disabled={!docId.trim() || loading} style={{ flexShrink: 0 }}>
              {loading ? '...' : 'Look up →'}
            </button>
          </div>
          <p style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '10px' }}>
            Use this to check the copy stored on the server, or to compare a file with one particular document. The ID is on the document's details page.
          </p>
          <button type="button" onClick={reset}
            style={{ background: 'none', border: 'none', padding: 0, color: 'var(--accent)', cursor: 'pointer', fontSize: '12px', marginTop: '4px' }}>
            ← Back to simple verification (upload only)
          </button>
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
              <div><span style={{ color: 'var(--text3)' }}>Versions: </span><span>{doc.versionHistory?.length || 1}</span> <Link to={`/documents/${doc.docId}`} style={{ color: 'var(--accent)', marginLeft: '6px' }}>history →</Link></div>
              <div><span style={{ color: 'var(--text3)' }}>Status: </span><span style={{ color: doc.tampered ? 'var(--red)' : 'var(--green)' }}>{doc.tampered ? `⚠ TAMPERED (${(doc.tamperReasons || []).map(r => TAMPER_REASON_LABELS[r] || r).join(', ') || 'see audit trail'})` : doc.restoredAt ? '✓ Clean (restored after tampering)' : '✓ Clean'}</span></div>
              <div><span style={{ color: 'var(--text3)' }}>Metadata hash: </span><span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{doc.metadataHash ? `${doc.metadataHash.slice(0, 16)}…` : 'not anchored'}</span></div>
            </div>

            <hr className="divider" />
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '8px' }}>
                UPLOAD FILE TO VERIFY (re-upload the original file to check its integrity)
              </label>
              <input type="file" onChange={e => setVerifyFile(e.target.files[0])} />
              {verifyFile
                ? <div style={{ fontSize: '12px', color: 'var(--green)', marginTop: '6px' }}>✓ {verifyFile.name} selected — will hash and compare against ledger</div>
                : <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '6px' }}>No file selected — will re-hash the copy stored on the server and check it against the blockchain</div>
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

      {step === 'verified' && result && (() => {
        const content = result.contentCheck
        const ident = result.identification
        const notRegistered = !!result.notRegistered
        const altered = !!ident && ident.match === 'similar'
        const docName = result.document?.filename || ident?.document?.filename
        const outdated = !result.isIntact && !!result.versionCheck
        const sameText = !result.isIntact && !outdated && content?.status === 'identical'
        const renamed = !!result.nameCheck?.renamed
        const meta = result.metadataCheck
        const metaTampered = meta?.intact === false
        const stored = result.checkedStoredCopy
        const unverified = stored && result.integrityStatus === 'unverified'
        const green = { color: 'var(--green)', bg: 'var(--green-bg)', border: 'var(--status-verified-border)' }
        const yellow = { color: 'var(--yellow)', bg: 'var(--yellow-bg)', border: 'var(--status-warning-border)' }
        const red = { color: 'var(--red)', bg: 'var(--red-bg)', border: 'var(--status-tampered-border)' }
        const tone = notRegistered || metaTampered || (stored && result.integrityStatus === 'fail') ? red
          : unverified ? yellow
          : result.isIntact && !renamed ? green
          : result.isIntact || sameText || outdated ? yellow : red
        const title = notRegistered ? 'NOT REGISTERED — no matching document on the blockchain'
          : stored
          ? (result.integrityStatus === 'fail' ? 'TAMPERED — stored document failed verification' : unverified ? 'Stored copy could not be checked' : 'Stored document is INTACT')
          : metaTampered && result.isIntact ? 'File intact, but DOCUMENT DETAILS TAMPERED'
          : result.isIntact && renamed ? 'File name CHANGED — waiting for confirmation' : result.isIntact ? 'Document is INTACT'
          : outdated ? `OUTDATED VERSION — this is v${result.versionCheck.matchesVersion}, current is v${result.versionCheck.currentVersion}` : sameText ? 'Different file, SAME CONTENT' : altered ? `ALTERED COPY of ${docName}` : 'TAMPERING DETECTED'
        const description = notRegistered
          ? `This file's hash does not match any of the ${ident?.checked ?? ''} registered documents or their versions, and no registered document has similar text or the same file name. It was never uploaded to DocuChain, or it is not an official copy.`
          : stored
          ? (result.message || '').replace(/^⚠ TAMPERED — /, '')
          : metaTampered && result.isIntact
            ? 'The uploaded file matches the blockchain record, but the title, classification or owner stored in the database no longer match the hash on the blockchain. Someone changed them outside DocuChain.'
          : result.isIntact && renamed
            ? 'The file hash matches the blockchain record, so the content was not modified. However, the file was renamed. Confirm with the uploader that this copy is legitimate.'
            : result.isIntact
            ? 'The file hash matches the blockchain record. No modifications detected.'
            : outdated
              ? `This file is not tampered: its hash matches version ${result.versionCheck.matchesVersion} on the blockchain (uploaded by ${result.versionCheck.updatedBy}). But it is not the latest version — a newer version (v${result.versionCheck.currentVersion}) has been registered since.`
            : sameText
              ? 'This is not the original file (its hash does not match the blockchain record), but its text is identical to the registered original. It was likely re-saved or copied into a new document.'
              : altered
                ? `The file hash does not match any registered document. ${ident.matchedBy === 'content' ? `Its text is ${Math.round((ident.similarity || 0) * 100)}% similar to ${docName}` : `It has the same file name as ${docName}`}${ident.document && !ident.document.isCurrent ? ` (version ${ident.document.version})` : ''}, so it is most likely a modified copy of that document.`
              : 'The file hash does NOT match the blockchain record. This document may have been modified.'
        return (
        <div className="animate-in">
          <div className="card" style={{ marginBottom: '1rem', borderColor: tone.border, background: tone.bg }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '1.25rem' }}>
              <div style={{ fontSize: '36px' }}>{tone === green ? '✓' : '⚠'}</div>
              <div>
                <div style={{ fontSize: '18px', fontWeight: '600', color: tone.color, marginBottom: '4px' }}>{title}</div>
                <div style={{ fontSize: '13px', color: 'var(--text2)' }}>{description}</div>
                {!stored && result.tampered && (
                  <div style={{ fontSize: '12px', color: 'var(--red)', marginTop: '6px' }}>
                    Note: the record on the blockchain is flagged as tampered ({(result.tamperReasons || []).map(r => TAMPER_REASON_LABELS[r] || r).join(', ')}).
                  </div>
                )}
              </div>
            </div>
            {ident?.document && (
              <div style={{ background: 'var(--bg)', border: `1px solid ${tone.border}`, borderRadius: 'var(--radius)', padding: '0.85rem 1rem', marginBottom: '0.5rem' }}>
                <div style={{ fontSize: '11px', color: 'var(--text3)', ...mono, marginBottom: '4px', textTransform: 'uppercase' }}>
                  {ident.match === 'exact' ? 'Identified as' : 'Most likely original'}
                </div>
                <div style={{ fontWeight: 600, marginBottom: '6px' }}>{docName}</div>
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', fontSize: '12px' }}>
                  <span className={`badge ${ident.match === 'exact' ? 'badge-green' : 'badge-yellow'}`}>
                    {ident.match === 'exact' ? 'Exact SHA-256 match' : ident.matchedBy === 'content' ? `Text ${Math.round((ident.similarity || 0) * 100)}% similar` : 'Same file name'}
                  </span>
                  <span className={`badge ${ident.document.isCurrent ? 'badge-blue' : 'badge-yellow'}`}>
                    Version {ident.document.version} of {ident.document.currentVersion}{ident.document.isCurrent ? ' (current)' : ' (outdated)'}
                  </span>
                  {result.document?.department && <span className="badge badge-blue">{result.document.department}</span>}
                  {result.document?.docType && <span className="badge badge-purple">{result.document.docType}</span>}
                  <Link to={`/documents/${ident.document.docId}`} style={{ color: 'var(--accent)' }}>Open document →</Link>
                </div>
                <div style={{ fontSize: '11px', color: 'var(--text3)', ...mono, marginTop: '6px' }}>ID {ident.document.docId}</div>
                {ident.alsoMatches > 0 && (
                  <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '4px' }}>The same file is registered {ident.alsoMatches} more time{ident.alsoMatches > 1 ? 's' : ''}.</div>
                )}
              </div>
            )}
            <hr style={{ borderColor: tone.border, margin: '1rem 0' }} />
            {notRegistered ? (
              <>
                <h3 style={{ fontSize: '12px', color: 'var(--text3)', ...mono, marginBottom: '0.75rem', textTransform: 'uppercase' }}>Hashes of the uploaded file (computed now)</h3>
                <HashRow label="MD5" value={result.providedHashes?.md5} />
                <HashRow label="SHA-1" value={result.providedHashes?.sha1} />
                <HashRow label="SHA-256" value={result.providedHashes?.sha256} />
              </>
            ) : (
              <>
                <HashRow label="Stored hash (ledger)" value={result.storedHash} />
                <HashRow label={stored ? 'Current hash of stored file (computed now)' : 'Current hash (computed now)'} value={result.providedHash} />
              </>
            )}
            {Array.isArray(result.hashComparison) && (
              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Hash comparison (MD5, SHA-1, SHA-256 vs blockchain)</h3>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '12px' }}>
                    <thead>
                      <tr>
                        {['Algorithm', 'Stored on ledger', 'Computed now', 'Result'].map(h => (
                          <th key={h} style={{ textAlign: 'left', padding: '6px 8px', color: 'var(--text3)', fontWeight: 500, borderBottom: '1px solid var(--border)' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {result.hashComparison.map(h => (
                        <tr key={h.algorithm}>
                          <td style={{ padding: '6px 8px', fontWeight: 500 }}>{h.label}</td>
                          <td title={h.stored || ''} style={{ padding: '6px 8px', fontFamily: 'IBM Plex Mono, monospace' }}>{h.stored ? `${h.stored.slice(0, 16)}…` : 'not stored'}</td>
                          <td title={h.computed || ''} style={{ padding: '6px 8px', fontFamily: 'IBM Plex Mono, monospace' }}>{h.computed ? `${h.computed.slice(0, 16)}…` : '—'}</td>
                          <td style={{ padding: '6px 8px', fontWeight: 600, color: h.match === true ? 'var(--green)' : h.match === false ? 'var(--red)' : 'var(--text3)' }}>
                            {h.match === true ? '✓ Match' : h.match === false ? '✗ Mismatch' : 'n/a'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {outdated && (
                  <div style={{ fontSize: '13px', color: 'var(--green)', marginTop: '8px' }}>
                    ✓ The SHA-256 of this file matches <b>version {result.versionCheck.matchesVersion}</b> in the blockchain version history. The table above compares it with the current version (v{result.versionCheck.currentVersion}).
                  </div>
                )}
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>
                  All three hashes were computed at upload and stored on the blockchain. SHA-256 is the integrity proof used for the tamper decision.
                </div>
              </div>
            )}
            {meta && (
              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Metadata check (title, classification, owner in the database)</h3>
                {!meta.anchored
                  ? <div style={{ fontSize: '13px', color: 'var(--text2)' }}>No metadata hash on the blockchain for this document yet (uploaded before metadata protection). An admin can anchor it from the Audit Trail.</div>
                  : <>
                      <div style={{ fontSize: '13px', color: metaTampered ? 'var(--red)' : 'var(--green)', marginBottom: '0.5rem' }}>{metaTampered ? '✗ The database details do not match the blockchain — changed outside DocuChain.' : '✓ Database details match the blockchain.'}</div>
                      <HashRow label="Metadata hash (ledger)" value={meta.storedHash} />
                      <HashRow label="Metadata hash (computed now)" value={meta.computedHash} />
                    </>}
              </div>
            )}
            {renamed && (
              <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '0.75rem' }}>
                <div><span style={{ color: 'var(--text3)' }}>Registered file name: </span>{result.nameCheck.registeredName}</div>
                <div><span style={{ color: 'var(--text3)' }}>Uploaded file name: </span>{result.nameCheck.providedName}</div>
              </div>
            )}
            {content && (
              <div style={{ marginTop: '1rem' }}>
                <h3 style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '0.75rem', textTransform: 'uppercase' }}>Content check (text compared with the registered original)</h3>
                {content.status === 'identical' && (
                  <div style={{ fontSize: '13px', color: 'var(--text2)' }}>✓ Text is identical. Only the file itself differs (metadata, formatting, spacing or file type).</div>
                )}
                {content.status === 'changed' && (
                  <div style={{ fontSize: '13px', color: 'var(--text2)' }}>
                    <div style={{ marginBottom: '6px' }}>✗ The text was changed{content.comparedWithVersion ? ` (compared with version ${content.comparedWithVersion})` : ''}. First difference:</div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px', marginBottom: '4px' }}><span style={{ color: 'var(--text3)' }}>Original: </span>{content.firstDifference?.original}</div>
                    <div style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' }}><span style={{ color: 'var(--text3)' }}>Uploaded: </span>{content.firstDifference?.provided}</div>
                  </div>
                )}
                {content.status === 'unavailable' && (
                  <div style={{ fontSize: '13px', color: 'var(--text2)' }}>Content could not be compared: {content.reason}</div>
                )}
              </div>
            )}
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginTop: '10px' }}>
              Verified at: {result.verifiedAt?.slice(0, 19).replace('T', ' ')}
            </div>
          </div>
          <div style={{ display: 'flex', gap: '10px' }}>
            <button className="btn-primary" onClick={reset}>Verify another file</button>
          </div>
        </div>
        )
      })()}
    </div>
  )
}
