import { useState } from 'react'
import { searchDocuments } from '../services/api'
import { PageHeader, Alert, EmptyState, Spinner } from '../components/ui/Components'

const DEPARTMENTS = ['IT', 'HR', 'Finance', 'Academic', 'Admin', 'Legal', 'Research', 'General']
const DOC_TYPES = ['Document', 'Contract', 'Report', 'Certificate', 'Invoice', 'Memo', 'Policy', 'Other']

export default function Search() {
  const [query, setQuery] = useState('')
  const [department, setDepartment] = useState('')
  const [docType, setDocType] = useState('')
  const [tag, setTag] = useState('')
  const [results, setResults] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  async function handleSearch(e) {
    e?.preventDefault()
    setError('')
    setLoading(true)
    setSearched(true)
    try {
      const params = {}
      if (department) params.department = department
      if (docType) params.docType = docType
      if (tag) params.tag = tag

      // If no query but filters selected, use wildcard
      const q = query.trim() || '*'
      const res = await searchDocuments(q, params)
      setResults(res.data)
    } catch (err) {
      setError(err.response?.data?.error || 'Search failed.')
    } finally {
      setLoading(false)
    }
  }

  function clearFilters() {
    setQuery('')
    setDepartment('')
    setDocType('')
    setTag('')
    setResults(null)
    setSearched(false)
    setError('')
  }

  const hasFilters = department || docType || tag

  return (
    <div className="animate-in">
      <PageHeader title="Search Documents" sub="Full-text search across document contents and metadata" />

      {error && <Alert type="error">{error}</Alert>}

      {/* Search form */}
      <form onSubmit={handleSearch} style={{ marginBottom: '1.5rem' }}>

        {/* Search bar */}
        <div style={{ display: 'flex', gap: '10px', marginBottom: '12px' }}>
          <input
            placeholder="Search by filename, content, uploader... (leave empty to browse all)"
            value={query}
            onChange={e => setQuery(e.target.value)}
            style={{ flex: 1, fontSize: '14px', padding: '11px 16px' }}
          />
          <button type="submit" className="btn-primary" disabled={loading} style={{ padding: '11px 24px', flexShrink: 0 }}>
            {loading ? '...' : '⌕ Search'}
          </button>
          {(hasFilters || query || searched) && (
            <button type="button" className="btn-ghost" onClick={clearFilters} style={{ flexShrink: 0 }}>
              Clear
            </button>
          )}
        </div>

        {/* Filters row */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px' }}>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '5px', textTransform: 'uppercase' }}>Department</label>
            <select value={department} onChange={e => setDepartment(e.target.value)}>
              <option value="">All departments</option>
              {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '5px', textTransform: 'uppercase' }}>Document Type</label>
            <select value={docType} onChange={e => setDocType(e.target.value)}>
              <option value="">All types</option>
              {DOC_TYPES.map(d => <option key={d} value={d}>{d}</option>)}
            </select>
          </div>
          <div>
            <label style={{ display: 'block', fontSize: '10px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '5px', textTransform: 'uppercase' }}>Tag</label>
            <input
              placeholder="e.g. 2024, Q1, finance"
              value={tag}
              onChange={e => setTag(e.target.value)}
            />
          </div>
        </div>

        {/* Active filter badges */}
        {hasFilters && (
          <div style={{ display: 'flex', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
            <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Active filters:</span>
            {department && <span className="badge badge-blue">{department}</span>}
            {docType && <span className="badge badge-purple">{docType}</span>}
            {tag && <span className="badge badge-yellow">tag: {tag}</span>}
          </div>
        )}
      </form>

      {/* Results */}
      {loading && <Spinner />}

      {results && !loading && (
        <div className="animate-in">
          <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '1rem' }}>
            {results.totalHits} result{results.totalHits !== 1 ? 's' : ''}
            {query && query !== '*' ? ` for "${query}"` : ''}
            {hasFilters ? ' (filtered)' : ''}
          </div>

          {results.hits.length === 0 ? (
            <EmptyState icon="⌕" message="No documents found" sub="Try a different keyword or adjust the filters" />
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {results.hits.map((hit, i) => (
                <div key={hit.docId || i} className="card" style={{ padding: '1.25rem', cursor: 'default' }}
                  onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border2)'}
                  onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '8px' }}>
                    <div style={{ fontWeight: '500', color: 'var(--text)', fontSize: '15px' }}>{hit.filename}</div>
                    <div style={{ display: 'flex', gap: '6px', flexShrink: 0, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                      {hit.department && <span className="badge badge-blue">{hit.department}</span>}
                      {hit.docType && <span className="badge badge-purple">{hit.docType}</span>}
                    </div>
                  </div>

                  {/* Highlighted content */}
                  {hit._formatted?.content && hit._formatted.content !== hit.filename && (
                    <div
                      style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '10px', lineHeight: 1.6,
                        background: 'var(--bg3)', padding: '8px 12px', borderRadius: '6px',
                        borderLeft: '3px solid var(--accent)',
                        overflow: 'hidden', maxHeight: '60px' }}
                      dangerouslySetInnerHTML={{ __html: hit._formatted.content.slice(0, 300) + '...' }}
                    />
                  )}

                  {/* Tags */}
                  {hit.tags?.length > 0 && (
                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '8px' }}>
                      {hit.tags.map((t, ti) => (
                        <span key={ti} className="badge badge-yellow"
                          style={{ cursor: 'pointer' }}
                          onClick={() => { setTag(t); handleSearch() }}
                        >
                          🏷 {t}
                        </span>
                      ))}
                    </div>
                  )}

                  <div style={{ display: 'flex', gap: '16px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    <span>↑ {hit.uploader}</span>
                    <span>{hit.registeredAt?.slice(0, 10)}</span>
                    <span style={{ color: 'var(--text3)', fontSize: '10px' }}>{hit.docId}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {!results && !loading && !searched && (
        <EmptyState icon="⌕" message="Search or browse documents" sub="Enter a keyword, or use the filters and click Search to browse all documents" />
      )}
    </div>
  )
}