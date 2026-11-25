import { useState, useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Search, LayoutGrid, List, X } from 'lucide-react'
import { getPublicResolutions } from '../../services/api'
import { Spinner, EmptyState, Alert } from '../../components/ui/Components'
import PublicLayout from '../../components/public/PublicLayout'
import ResolutionCard, { ResolutionRow } from '../../components/public/ResolutionCard'

const PAGE_SIZE = 10
const SORT_LABELS = { newest: 'Newest first', oldest: 'Oldest first', number: 'Resolution number', title: 'Title (A–Z)' }

function readView() {
  try { return localStorage.getItem('publicListView') === 'list' ? 'list' : 'cards' } catch { return 'cards' }
}

export default function PublicResolutions() {
  // Filters live in the address bar, so links from the home page and shared
  // links open the same filtered list
  const [params, setParams] = useSearchParams()
  const q = params.get('q') || ''
  const year = params.get('year') || ''
  const quarter = params.get('quarter') || ''
  const category = params.get('category') || ''
  const type = params.get('type') || ''
  const sort = SORT_LABELS[params.get('sort')] ? params.get('sort') : 'newest'
  const page = Math.max(1, parseInt(params.get('page')) || 1)

  const [query, setQuery] = useState(q)
  const [view, setView] = useState(readView)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => { setQuery(q) }, [q])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    getPublicResolutions({
      q: q || undefined, year: year || undefined, quarter: quarter || undefined, category: category || undefined,
      type: type || undefined, sort, page, limit: PAGE_SIZE,
    })
      .then(res => { if (!cancelled) setData(res.data) })
      .catch(err => { if (!cancelled) setError(err.response?.data?.error || 'Could not load resolutions. Please try again later.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [q, year, quarter, category, type, sort, page])

  function update(changes) {
    const next = new URLSearchParams(params)
    for (const [k, v] of Object.entries(changes)) {
      if (v === '' || v === null || v === undefined) next.delete(k)
      else next.set(k, v)
    }
    if (!('page' in changes)) next.delete('page')
    if (next.get('sort') === 'newest') next.delete('sort')
    setParams(next)
  }

  function chooseView(v) {
    setView(v)
    try { localStorage.setItem('publicListView', v) } catch {}
  }

  function handleSearch(e) {
    e.preventDefault()
    update({ q: query.trim() })
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1
  const filters = [
    q && { key: 'q', label: `“${q}”` },
    year && { key: 'year', label: year },
    quarter && { key: 'quarter', label: `Quarter ${quarter}` },
    category && { key: 'category', label: category },
    type && { key: 'type', label: type },
  ].filter(Boolean)
  const categories = data?.categories || []
  const types = data?.types || []

  return (
    <PublicLayout>
      <section style={{ marginBottom: '1.25rem' }}>
        <h1 className="public-page-title">Resolutions</h1>
        <p className="public-page-lead">
          Every resolution the Board of Trustees has released to the public. Use the search and filters to find what you need, then open a resolution to read or download it.
        </p>
      </section>

      <form onSubmit={handleSearch} className="card public-filters">
        <div className="public-filter-search">
          <Search size={16} className="public-filter-search-icon" />
          <input
            placeholder="Search titles, resolution numbers or any words inside the documents"
            value={query}
            onChange={e => setQuery(e.target.value)}
            aria-label="Search"
          />
          <button type="submit" className="btn-primary">Search</button>
        </div>
        <div className="public-filter-hint">
          Searches the full text of every published document, for example a name, an amount or a phrase such as “Finance Committee”.
        </div>
        <div className="public-filter-row">
          <label>
            <span>Year</span>
            <select value={year} onChange={e => update({ year: e.target.value })}>
              <option value="">All years</option>
              {(data?.years || []).map(y => <option key={y} value={y}>{y}</option>)}
            </select>
          </label>
          <label>
            <span>Quarter</span>
            <select value={quarter} onChange={e => update({ quarter: e.target.value })}>
              <option value="">All quarters</option>
              {[1, 2, 3, 4].map(n => {
                const c = (data?.quarters || []).find(x => x.value === n)?.count || 0
                return <option key={n} value={n}>Quarter {n} ({c})</option>
              })}
            </select>
          </label>
          <label>
            <span>Office</span>
            <select value={category} onChange={e => update({ category: e.target.value })}>
              <option value="">All offices</option>
              {categories.map(c => <option key={c.value} value={c.value}>{c.value} ({c.count})</option>)}
            </select>
          </label>
          {(types.length > 1 || type) && (
            <label>
              <span>Document type</span>
              <select value={type} onChange={e => update({ type: e.target.value })}>
                <option value="">All types</option>
                {types.map(t => <option key={t.value} value={t.value}>{t.value} ({t.count})</option>)}
              </select>
            </label>
          )}
          <label>
            <span>Sort by</span>
            <select value={sort} onChange={e => update({ sort: e.target.value })}>
              {Object.entries(SORT_LABELS).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </label>
        </div>
      </form>

      {error && <Alert type="error">{error}</Alert>}

      {loading && !data ? <Spinner /> : data && (
        <>
          <div className="public-results-bar">
            <div className="public-results-count">
              {data.total} of {data.overall ?? data.total} resolution{(data.overall ?? data.total) === 1 ? '' : 's'}
              {q && data.resolutions.some(r => r.excerpt) && <span> · {data.resolutions.filter(r => r.excerpt).length} with the words inside the file</span>}
              {filters.length > 0 && (
                <span className="public-active-filters">
                  {filters.map(f => (
                    <button key={f.key} type="button" className="public-chip is-active" onClick={() => update({ [f.key]: '' })} title="Remove this filter">
                      {f.label} <X size={12} />
                    </button>
                  ))}
                  <button type="button" className="public-clear" onClick={() => setParams(new URLSearchParams())}>Clear all</button>
                </span>
              )}
            </div>
            <div className="public-view-toggle" role="group" aria-label="Layout">
              <button type="button" className={view === 'cards' ? 'is-active' : ''} onClick={() => chooseView('cards')} title="Cards with preview"><LayoutGrid size={15} /> Cards</button>
              <button type="button" className={view === 'list' ? 'is-active' : ''} onClick={() => chooseView('list')} title="Compact list"><List size={15} /> List</button>
            </div>
          </div>

          <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .15s' }}>
            {data.resolutions.length === 0 ? (
              <div className="card"><EmptyState icon="◈" message="No resolutions found" sub="Try other words, or remove a filter." /></div>
            ) : view === 'list' ? (
              <div className="card public-rows">{data.resolutions.map(r => <ResolutionRow key={r.docId} r={r} />)}</div>
            ) : (
              data.resolutions.map(r => <ResolutionCard key={r.docId} r={r} />)
            )}
          </div>

          {totalPages > 1 && (
            <div className="public-pager">
              <button className="btn-ghost" disabled={page <= 1} onClick={() => update({ page: page - 1 })}>← Previous</button>
              <span>Page {page} of {totalPages}</span>
              <button className="btn-ghost" disabled={page >= totalPages} onClick={() => update({ page: page + 1 })}>Next →</button>
            </div>
          )}
        </>
      )}
    </PublicLayout>
  )
}
