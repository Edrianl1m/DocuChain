import { useState, useRef } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { uploadDocument, quarterOfDate, filingLabel } from '../services/api'
import { PageHeader, Alert, HashRow } from '../components/ui/Components'
import { PublicSwitch } from './Publishing'

import { DOC_TYPE_GROUPS, OFFICE_GROUPS, GroupedOptions, isResolution } from '../constants/tor'

const ALL_TYPES = DOC_TYPE_GROUPS.flatMap(g => g.items)
const ALL_OFFICES = OFFICE_GROUPS.flatMap(g => g.items)
const THIS_YEAR = new Date().getFullYear()
const YEARS = Array.from({ length: 12 }, (_, i) => THIS_YEAR + 1 - i)
const labelStyle = { display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }

// Filing follows the approval date until staff pick a year / quarter themselves
function autoFiling(date) {
  const quarter = quarterOfDate(date)
  if (quarter) return { year: Number(date.slice(0, 4)), quarter }
  const now = new Date()
  return { year: now.getFullYear(), quarter: Math.ceil((now.getMonth() + 1) / 3) }
}

export default function Upload() {
  const [file, setFile] = useState(null)
  const [drag, setDrag] = useState(false)
  // Opened from a Repository folder (Upload to this quarter): start with its year, quarter, type and office
  const [params] = useSearchParams()
  const presetYear = Number(params.get('year'))
  const presetQuarter = Number(params.get('quarter'))
  const preset = presetYear >= 1900 && presetYear <= 2100 && [1, 2, 3, 4].includes(presetQuarter) ? { year: presetYear, quarter: presetQuarter } : null
  const presetType = ALL_TYPES.includes(params.get('type')) ? params.get('type') : null
  const presetOffice = ALL_OFFICES.includes(params.get('dept')) ? params.get('dept') : null
  const fromRepository = params.get('from') === 'repository'
  const [form, setForm] = useState({ department: presetOffice || 'Office of the Board Secretary', docType: presetType || 'Board Resolution', tags: '' })
  const [pub, setPub] = useState({ isPublic: false, isConfidential: false, title: '', resolutionNumber: '', resolutionDate: '', summary: '' })
  const [filingChosen, setFilingChosen] = useState(null) // { year, quarter } once staff change it by hand
  // Order: picked by hand > date approved > Repository folder > today
  const filing = filingChosen || (pub.resolutionDate || !preset ? autoFiling(pub.resolutionDate) : preset)
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
      fd.append('recordYear', filing.year)
      fd.append('recordQuarter', filing.quarter)
      Object.entries(pub).forEach(([k, v]) => fd.append(k, v))
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

        {result.publication?.recordYear && (
          <div className="filing-preview" style={{ marginBottom: '1.25rem' }}>
            Filed under <b>{filingLabel(result.publication.recordYear, result.publication.recordQuarter)}</b>
            {' · '}{form.docType}{' · '}{form.department}
            <a href={`/repository?year=${result.publication.recordYear}&quarter=${result.publication.recordQuarter}`} style={{ marginLeft: 'auto', color: 'var(--accent)', textDecoration: 'underline', fontSize: '12px' }}>Open in Repository →</a>
          </div>
        )}

        <HashRow label="MD5" value={result.hashes?.md5} />
        <HashRow label="SHA-1" value={result.hashes?.sha1} />
        <HashRow label="SHA-256 (stored on ledger)" value={result.hashes?.sha256} />

        {result.publication?.isPublic && (
          <div style={{ marginTop: '1rem', fontSize: '13px', color: 'var(--green)' }}>
            ● Published on the public page{result.publication.blockNumber !== null && result.publication.blockNumber !== undefined ? ` · Block ${result.publication.blockNumber}` : ''}.{' '}
            <a href="/public" target="_blank" rel="noreferrer" style={{ color: 'var(--accent)', textDecoration: 'underline' }}>Open public page ↗</a>
          </div>
        )}
        {result.publicationError && (
          <div style={{ marginTop: '1rem' }}><Alert type="warning">Uploaded, but the public page setting was not saved: {result.publicationError}</Alert></div>
        )}
      </div>

      <div style={{ display: 'flex', gap: '10px' }}>
        <button className="btn-primary" onClick={() => { setResult(null); setFile(null); setPub(p => ({ ...p, isPublic: false, title: '', resolutionNumber: '', summary: '' })); setFilingChosen(null) }}>Upload another</button>
        {fromRepository && preset
          ? <button className="btn-ghost" onClick={() => navigate(`/repository?year=${filing.year}&quarter=${filing.quarter}`)}>Back to Repository</button>
          : <button className="btn-ghost" onClick={() => navigate('/')}>Back to dashboard</button>}
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
          background: drag ? 'var(--brand-surface)' : file ? 'var(--green-bg)' : 'var(--bg2)',
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

      {/* Records filing */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <h2 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '0.35rem', color: 'var(--text2)', fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Records Filing</h2>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '1.25rem' }}>Where this document is kept in the Repository, so it can be found quickly when it is requested.</div>
        <div className="filing-grid">
          <div>
            <label style={labelStyle}>DOCUMENT TYPE</label>
            <select value={form.docType} onChange={e => setForm(f => ({ ...f, docType: e.target.value }))}>
              <GroupedOptions groups={DOC_TYPE_GROUPS} />
            </select>
          </div>
          <div>
            <label style={labelStyle}>OFFICE</label>
            <select value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))}>
              <GroupedOptions groups={OFFICE_GROUPS} />
            </select>
          </div>
          <div>
            <label style={labelStyle}>{isResolution(form.docType) ? 'RESOLUTION NO.' : 'REFERENCE NO.'} (optional)</label>
            <input placeholder={isResolution(form.docType) ? 'e.g. 045, s. 2026' : 'e.g. Memo 2026-031'} value={pub.resolutionNumber} onChange={e => setPub(p => ({ ...p, resolutionNumber: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>DATE APPROVED / ISSUED</label>
            <input type="date" value={pub.resolutionDate} onChange={e => setPub(p => ({ ...p, resolutionDate: e.target.value }))} />
          </div>
          <div>
            <label style={labelStyle}>YEAR</label>
            <select value={filing.year} onChange={e => setFilingChosen({ ...filing, year: Number(e.target.value) })}>
              {Array.from(new Set([filing.year, ...YEARS])).sort((a, b) => b - a).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </div>
          <div>
            <label style={labelStyle}>QUARTER</label>
            <select value={filing.quarter} onChange={e => setFilingChosen({ ...filing, quarter: Number(e.target.value) })}>
              {[1, 2, 3, 4].map(n => <option key={n} value={n}>Quarter {n}</option>)}
            </select>
            <div className="filing-hint">
              {filingChosen
                ? <>Chosen by you. <button type="button" onClick={() => setFilingChosen(null)} style={{ border: 0, background: 'none', padding: 0, color: 'var(--accent)', fontSize: '11px', cursor: 'pointer', textDecoration: 'underline' }}>Use the date instead</button></>
                : pub.resolutionDate
                  ? (preset && (preset.year !== filing.year || preset.quarter !== filing.quarter)
                    ? `Set from the date approved (you opened ${filingLabel(preset.year, preset.quarter)} in the Repository).`
                    : 'Set from the date approved.')
                  : preset
                    ? `Set from the Repository folder you were in (${filingLabel(preset.year, preset.quarter)}).`
                    : 'Set from today. Enter the date approved to file it in its quarter.'}
            </div>
          </div>
        </div>
        <div className="filing-preview">
          Will be filed under <b>{filingLabel(filing.year, filing.quarter)}</b> › {form.docType} › {form.department}
        </div>
        <div>
          <label style={labelStyle}>TAGS (comma-separated, optional)</label>
          <input placeholder="e.g. budget, FY2027" value={form.tags} onChange={e => setForm(f => ({ ...f, tags: e.target.value }))} />
        </div>
      </div>

      {/* Public page */}
      <div className="card" style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '1rem', flexWrap: 'wrap', marginBottom: '1.25rem' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '500', color: 'var(--text2)', fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Public Page</h2>
          <div style={{ display: 'flex', gap: '1.5rem', alignItems: 'center', flexWrap: 'wrap' }}>
            <PublicSwitch checked={pub.isPublic && !pub.isConfidential} disabled={pub.isConfidential} onChange={v => setPub(p => ({ ...p, isPublic: v }))} />
            <label style={{ display: 'flex', gap: '8px', alignItems: 'center', fontSize: '13px', cursor: 'pointer' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={pub.isConfidential}
                onChange={e => setPub(p => ({ ...p, isConfidential: e.target.checked, isPublic: e.target.checked ? false : p.isPublic }))} />
              Confidential
            </label>
          </div>
        </div>
        {pub.isPublic && !pub.isConfidential && (
          <>
            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>PUBLIC TITLE (defaults to filename)</label>
              <input placeholder={file?.name || 'e.g. Approval of the FY 2026 Budget'} value={pub.title} onChange={e => setPub(p => ({ ...p, title: e.target.value }))} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>SUMMARY</label>
              <textarea rows={2} placeholder="One or two sentences for the public page" value={pub.summary} onChange={e => setPub(p => ({ ...p, summary: e.target.value }))} />
            </div>
          </>
        )}
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '0.75rem' }}>
          Off by default. Confidential documents can never be published, downloaded or verified from the public page.
        </div>
      </div>

      {/* Hashing info */}
      <div style={{ background: 'var(--brand-surface)', border: '1px solid var(--brand-border)', borderRadius: 'var(--radius)', padding: '1rem 1.25rem', marginBottom: '1.5rem', fontSize: '12px', color: 'var(--text2)' }}>
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
