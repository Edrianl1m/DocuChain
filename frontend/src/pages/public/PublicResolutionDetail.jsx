import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, ArrowRight } from 'lucide-react'
import { getPublicResolution, getPublicResolutions, publicFileUrl } from '../../services/api'
import { Spinner, Alert, HashRow } from '../../components/ui/Components'
import PublicLayout from '../../components/public/PublicLayout'
import PdfPreview from '../../components/public/PdfPreview'
import { ResolutionActions, ResolutionRow, formatDate } from '../../components/public/ResolutionCard'

function Field({ label, children }) {
  if (!children) return null
  return (
    <div className="public-field">
      <div className="public-field-label">{label}</div>
      <div className="public-field-value">{children}</div>
    </div>
  )
}

export default function PublicResolutionDetail() {
  const { id } = useParams()
  const [r, setR] = useState(null)
  const [related, setRelated] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setR(null)
    setError('')
    setRelated([])
    getPublicResolution(id)
      .then(res => {
        if (cancelled) return
        const found = res.data.resolution
        setR(found)
        // A few other resolutions from the same category, so visitors can keep browsing
        return getPublicResolutions({ category: found.category || undefined, limit: 4 })
          .then(list => { if (!cancelled) setRelated(list.data.resolutions.filter(x => x.docId !== found.docId).slice(0, 3)) })
          .catch(() => {})
      })
      .catch(err => { if (!cancelled) setError(err.response?.status === 404 ? 'This resolution is not published, or the link is incorrect.' : 'Could not load this resolution. Please try again later.') })
    return () => { cancelled = true }
  }, [id])

  return (
    <PublicLayout>
      <Link to="/public/resolutions" className="public-back"><ArrowLeft size={14} /> All resolutions</Link>

      {error && <Alert type="error">{error}</Alert>}
      {!r && !error && <Spinner />}

      {r && (
        <div className="animate-in">
          <div className="public-detail">
            <a href={publicFileUrl(r.docId, 'view')} target="_blank" rel="noreferrer" title="Open the document" className="public-detail-preview">
              <PdfPreview url={publicFileUrl(r.docId, 'preview')} fileType={r.fileType} width={260} />
            </a>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="public-meta">
                {r.resolutionNumber && <span className="badge badge-blue">Resolution No. {r.resolutionNumber}</span>}
                <span className="badge badge-green">✓ Verified on blockchain</span>
              </div>
              <h1 className="public-page-title" style={{ marginTop: '8px' }}>{r.title}</h1>
              {r.summary && <p className="public-page-lead" style={{ whiteSpace: 'pre-line' }}>{r.summary}</p>}

              <div className="public-fields">
                <Field label="Date approved">{formatDate(r.resolutionDate)}</Field>
                {r.recordYear && r.recordQuarter && <Field label="Filed under">{`${r.recordYear} · Quarter ${r.recordQuarter}`}</Field>}
                <Field label="Office">{r.category}</Field>
                <Field label="Document type">{r.docType}</Field>
                <Field label="Published on this site">{formatDate(r.publishedAt)}</Field>
                <Field label="File">{r.filename}</Field>
              </div>

              <ResolutionActions r={r} details={false} />
            </div>
          </div>

          <div className="card public-proof-card">
            <h2 className="public-section-title" style={{ marginBottom: '4px' }}>Blockchain record</h2>
            <p className="public-muted" style={{ marginBottom: '1rem' }}>
              This is the fingerprint of the official file, as stored on the DocuChain ledger. The file is checked against it every time you open or download it.
            </p>
            <HashRow label="SHA-256 fingerprint" value={r.sha256} />
            <div className="public-fields" style={{ marginTop: '0.5rem' }}>
              <Field label="Stored in block">{r.blockNumber !== null && r.blockNumber !== undefined ? String(r.blockNumber) : 'On ledger'}</Field>
              <Field label="Transaction ID"><span className="mono" style={{ wordBreak: 'break-all', fontSize: '12px' }}>{r.txId}</span></Field>
            </div>
          </div>


          {related.length > 0 && (
            <section className="public-section" style={{ marginTop: '1.5rem' }}>
              <div className="public-section-head">
                <h2 className="public-section-title">{r.category ? `More in ${r.category}` : 'More resolutions'}</h2>
                <Link to={r.category ? `/public/resolutions?category=${encodeURIComponent(r.category)}` : '/public/resolutions'} className="public-link">See all <ArrowRight size={14} /></Link>
              </div>
              <div className="card public-rows">{related.map(x => <ResolutionRow key={x.docId} r={x} />)}</div>
            </section>
          )}
        </div>
      )}
    </PublicLayout>
  )
}
