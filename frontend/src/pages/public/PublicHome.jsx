import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Search, BookOpen, Eye, ShieldCheck, ArrowRight, Fingerprint, Blocks, FileCheck2, Info } from 'lucide-react'
import { getPublicResolutions } from '../../services/api'
import { Spinner } from '../../components/ui/Components'
import PublicLayout from '../../components/public/PublicLayout'
import ResolutionCard, { formatDate } from '../../components/public/ResolutionCard'

const browse = params => `/public/resolutions?${new URLSearchParams(params)}`

function Feature({ icon: Icon, title, children, to, cta }) {
  return (
    <div className="card public-feature">
      <span className="public-feature-icon"><Icon size={22} strokeWidth={1.8} /></span>
      <h3>{title}</h3>
      <p>{children}</p>
      <Link to={to} className="public-link">{cta} <ArrowRight size={14} /></Link>
    </div>
  )
}

function Step({ n, icon: Icon, title, children }) {
  return (
    <div className="public-step">
      <div className="public-step-num">{n}</div>
      <div>
        <div className="public-step-title"><Icon size={16} strokeWidth={2} /> {title}</div>
        <p>{children}</p>
      </div>
    </div>
  )
}

export default function PublicHome() {
  const navigate = useNavigate()
  const [query, setQuery] = useState('')
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    getPublicResolutions({ limit: 3, sort: 'newest' })
      .then(res => setData(res.data))
      .catch(() => setFailed(true))
      .finally(() => setLoading(false))
  }, [])

  function search(e) {
    e.preventDefault()
    navigate(query.trim() ? browse({ q: query.trim() }) : '/public/resolutions')
  }

  const latest = data?.resolutions?.[0]
  const years = data?.years || []
  const yearSpan = years.length ? (years.length === 1 ? String(years[0]) : `${years[years.length - 1]}–${years[0]}`) : '—'

  const hero = (
    <section className="public-hero">
      <div className="public-hero-inner">
        <div className="public-hero-copy">
          <div className="public-eyebrow">Board of Trustees · Public Records</div>
          <h1>Official resolutions, open to everyone and protected by blockchain</h1>
          <p>
            Welcome to DocuChain. This is where the Board of Trustees Records Office publishes its approved resolutions.
            You can search, read and download them for free, and see the blockchain record that proves each one is the version the Board approved.
          </p>
          <form onSubmit={search} className="public-hero-search">
            <Search size={18} className="public-hero-search-icon" />
            <input
              placeholder="Search titles, numbers or words inside the documents"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Search resolutions"
            />
            <button type="submit" className="btn-primary">Search</button>
          </form>
          <div className="public-hero-actions">
            <Link to="/public/resolutions"><button className="public-hero-btn is-solid"><BookOpen size={16} /> Browse all resolutions</button></Link>
            <Link to="/public/about"><button className="public-hero-btn"><Info size={16} /> About DocuChain</button></Link>
          </div>
        </div>
        <div className="public-hero-art" aria-hidden="true">
          <img src="/logo.png" alt="" />
        </div>
      </div>
    </section>
  )

  return (
    <PublicLayout hero={hero}>
      <section className="public-stats">
        <div className="card public-stat">
          <div className="public-stat-label">Published resolutions</div>
          <div className="public-stat-value">{loading ? '…' : data?.overall ?? data?.total ?? 0}</div>
        </div>
        <div className="card public-stat">
          <div className="public-stat-label">Latest resolution</div>
          <div className="public-stat-value is-small">{loading ? '…' : latest ? formatDate(latest.resolutionDate || latest.publishedAt) : '—'}</div>
        </div>
        <div className="card public-stat">
          <div className="public-stat-label">Years covered</div>
          <div className="public-stat-value is-small">{loading ? '…' : yearSpan}</div>
        </div>
        <div className="card public-stat">
          <div className="public-stat-label">Every file</div>
          <div className="public-stat-value is-small" style={{ color: 'var(--green)' }}>✓ Registered on blockchain</div>
        </div>
      </section>

      <section className="public-section">
        <h2 className="public-section-title">What you can do here</h2>
        <div className="public-features">
          <Feature icon={Search} title="Find a resolution" to="/public/resolutions" cta="Browse resolutions">
            Look through every published resolution. Search by title, resolution number or keyword, and narrow the list by year, quarter or office.
          </Feature>
          <Feature icon={Eye} title="Read and download" to="/public/resolutions" cta="See the latest">
            Open any resolution in your browser or save a copy. Each file is checked against the blockchain before it is shown to you.
          </Feature>
          <Feature icon={ShieldCheck} title="See the blockchain proof" to="/public/resolutions" cta="Open a resolution">
            Every resolution page shows the file's SHA-256 fingerprint, the block it is stored in and its transaction ID on the ledger.
          </Feature>
        </div>
      </section>

      <section className="public-section">
        <div className="public-section-head">
          <h2 className="public-section-title">Latest resolutions</h2>
          <Link to="/public/resolutions" className="public-link">See all resolutions <ArrowRight size={14} /></Link>
        </div>
        {loading ? <Spinner /> : failed ? (
          <div className="card" style={{ color: 'var(--text2)' }}>The resolutions could not be loaded just now. Please try again in a moment.</div>
        ) : data.resolutions.length === 0 ? (
          <div className="card" style={{ color: 'var(--text2)' }}>No resolutions have been published yet.</div>
        ) : (
          data.resolutions.map(r => <ResolutionCard key={r.docId} r={r} />)
        )}
      </section>

      {(data?.categories?.length > 0 || years.length > 0) && (
        <section className="public-section">
          <h2 className="public-section-title">Browse by topic</h2>
          <div className="card public-browse">
            {data.categories?.length > 0 && (
              <div>
                <div className="public-browse-label">Office</div>
                <div className="public-chips">
                  {data.categories.map(c => (
                    <Link key={c.value} to={browse({ category: c.value })} className="public-chip">{c.value} <span>{c.count}</span></Link>
                  ))}
                </div>
              </div>
            )}
            {years.length > 0 && (
              <div>
                <div className="public-browse-label">Year</div>
                <div className="public-chips">
                  {years.map(y => <Link key={y} to={browse({ year: y })} className="public-chip">{y}</Link>)}
                </div>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="public-section">
        <h2 className="public-section-title">How DocuChain keeps resolutions trustworthy</h2>
        <div className="card public-steps">
          <Step n="1" icon={FileCheck2} title="The Records Office uploads the signed resolution">
            Only authorised staff can add documents. Confidential items, such as personnel matters, are never shown on this site.
          </Step>
          <Step n="2" icon={Fingerprint} title="A unique fingerprint is recorded on the blockchain">
            DocuChain computes the file's SHA-256 hash and stores it on a Hyperledger Fabric ledger. Changing even one character changes the fingerprint.
          </Step>
          <Step n="3" icon={Blocks} title="Every file is checked before you get it">
            When you view or download a file, its fingerprint is compared with the one on the ledger. A file that was altered is flagged and withheld.
          </Step>
        </div>
      </section>

      <section className="public-section">
        <div className="card public-about-teaser">
          <div>
            <h2 className="public-section-title" style={{ marginBottom: '4px' }}>New here?</h2>
            <p>Learn what DocuChain is, and what each part of a resolution page means.</p>
          </div>
          <Link to="/public/about"><button className="btn-ghost public-btn"><Info size={14} /> About DocuChain</button></Link>
        </div>
      </section>
    </PublicLayout>
  )
}
