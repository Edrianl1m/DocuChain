import { Link } from 'react-router-dom'
import { Eye, Download, FileText, TextSearch } from 'lucide-react'
import { publicFileUrl } from '../../services/api'
import PdfPreview from './PdfPreview'

export function formatDate(value) {
  if (!value) return null
  const d = new Date(value.length === 10 ? `${value}T00:00:00` : value)
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })
}

export const detailUrl = id => `/public/resolutions/${encodeURIComponent(id)}`

const iconProps = { size: 14, strokeWidth: 2 }

// The buttons every resolution offers, wherever it is listed
export function ResolutionActions({ r, details = true, size = 'normal' }) {
  const small = size === 'small'
  const pad = small ? '6px 12px' : '7px 16px'
  return (
    <div className="public-actions">
      {details && (
        <Link to={detailUrl(r.docId)}>
          <button className="btn-primary public-btn" style={{ padding: pad }}><FileText {...iconProps} /> Details</button>
        </Link>
      )}
      <a href={publicFileUrl(r.docId, 'view')} target="_blank" rel="noreferrer">
        <button className={details ? 'btn-ghost public-btn' : 'btn-primary public-btn'} style={{ padding: pad }}><Eye {...iconProps} /> View</button>
      </a>
      <a href={publicFileUrl(r.docId, 'download')}>
        <button className="btn-ghost public-btn" style={{ padding: pad }}><Download {...iconProps} /> Download</button>
      </a>
    </div>
  )
}

export function ResolutionMeta({ r }) {
  return (
    <div className="public-meta">
      {r.resolutionNumber && <span className="badge badge-blue">Resolution No. {r.resolutionNumber}</span>}
      {r.recordYear && r.recordQuarter && <span className="public-chip-static" title={`Filed under ${r.recordYear}, Quarter ${r.recordQuarter}`}>{r.recordYear} · Quarter {r.recordQuarter}</span>}
      {r.category && <span className="public-chip-static">{r.category}</span>}
      <span className="public-date">{formatDate(r.resolutionDate || r.publishedAt)}</span>
    </div>
  )
}

// Where a search matched inside the file's text
export function TextMatch({ r }) {
  if (!r.excerpt) return null
  return (
    <div className="public-text-match">
      <div className="public-text-match-label"><TextSearch size={13} /> Found in the document text</div>
      <div className="public-text-match-body">
        {r.excerpt.before}<mark>{r.excerpt.match}</mark>{r.excerpt.after}
      </div>
    </div>
  )
}

// Large card: thumbnail, title, summary and actions
export default function ResolutionCard({ r }) {
  return (
    <article className="card public-card">
      <Link to={detailUrl(r.docId)} title="Open details">
        <PdfPreview url={publicFileUrl(r.docId, 'preview')} fileType={r.fileType} width={140} />
      </Link>
      <div style={{ flex: 1, minWidth: 0 }}>
        <ResolutionMeta r={r} />
        <h2 className="public-card-title">
          <Link to={detailUrl(r.docId)}>{r.title}</Link>
        </h2>
        {r.summary && <p className="public-card-summary">{r.summary}</p>}
        <TextMatch r={r} />
        <div className="public-proof">
          <span className="badge badge-green">✓ Verified on blockchain</span>
        </div>
        <ResolutionActions r={r} />
      </div>
    </article>
  )
}

// One line per resolution, for the compact list view
export function ResolutionRow({ r }) {
  return (
    <div className="public-row">
      <div className="public-row-main">
        <Link to={detailUrl(r.docId)} className="public-row-title">{r.title}</Link>
        <ResolutionMeta r={r} />
        <TextMatch r={r} />
      </div>
      <ResolutionActions r={r} size="small" />
    </div>
  )
}
