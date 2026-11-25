import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import toast from 'react-hot-toast'
import { Archive, ChevronDown, ChevronRight, FolderClosed, FolderOpen, Search as SearchIcon } from 'lucide-react'
import {
  getRecords, updateFiling, downloadDocument, triggerDownload, readBlobError,
  filingLabel, TAMPER_REASON_LABELS,
} from '../services/api'
import { PageHeader, Spinner, Alert } from '../components/ui/Components'
import { isResolution } from '../constants/tor'

const ACCESS_BADGE = {
  public: <span className="badge badge-green">Public</span>,
  internal: <span className="badge badge-blue">Internal</span>,
  confidential: <span className="badge badge-yellow">Confidential</span>,
}

const label = { display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }

// Resolution numbers like "045, s. 2026" sort by number
function refKey(r) {
  const n = parseInt(String(r.resolutionNumber || '').replace(/\D.*$/, ''), 10)
  return Number.isFinite(n) ? n : 99999
}

export default function Repository() {
  const [params, setParams] = useSearchParams()
  const [data, setData] = useState(null)
  const [error, setError] = useState('')
  const [open, setOpen] = useState({})
  const [busy, setBusy] = useState(null)
  const [refiling, setRefiling] = useState(null)

  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin = user.role === 'admin'

  const year = params.get('year') ? Number(params.get('year')) : null
  const quarter = params.get('quarter') ? Number(params.get('quarter')) : null
  const type = params.get('type') || ''
  const dept = params.get('dept') || ''
  const access = params.get('access') || ''
  const q = params.get('q') || ''

  function setFilter(changes) {
    const next = new URLSearchParams(params)
    Object.entries(changes).forEach(([k, v]) => (v === null || v === '' || v === undefined ? next.delete(k) : next.set(k, v)))
    setParams(next, { replace: true })
  }

  async function load() {
    try {
      const res = await getRecords()
      setData(res.data)
      setError('')
      // Open the newest year in the index
      const newest = res.data.years?.[0]?.year
      if (newest) setOpen(o => (Object.keys(o).length ? o : { [year || newest]: true }))
    } catch (err) {
      setError(err.response?.data?.error || 'Could not load the repository.')
    }
  }
  useEffect(() => { load() }, [])

  const records = data?.records || []

  // Filters other than year/quarter (search, type, category, access)
  const matchesOther = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
    return r => {
      if (type && r.docType !== type) return false
      if (dept && r.department !== dept) return false
      if (access && r.classification !== access) return false
      if (words.length) {
        const hay = [r.title, r.filename, r.resolutionNumber, r.department, r.docType, r.uploader, `${r.recordYear} q${r.recordQuarter}`, `q${r.recordQuarter}`, `quarter ${r.recordQuarter}`, `${r.recordYear} quarter ${r.recordQuarter}`]
          .join(' ').toLowerCase()
        if (!words.every(w => hay.includes(w))) return false
      }
      return true
    }
  }, [q, type, dept, access])

  const scoped = useMemo(() => records.filter(matchesOther), [records, matchesOther])
  const inPeriod = r => (!year || r.recordYear === year) && (!quarter || r.recordQuarter === quarter)
  const shown = useMemo(() => scoped.filter(inPeriod)
    .sort((a, b) => (b.recordYear - a.recordYear) || (b.recordQuarter - a.recordQuarter) || ((isResolution(a.docType) ? 0 : 1) - (isResolution(b.docType) ? 0 : 1)) || a.docType.localeCompare(b.docType) || (refKey(a) - refKey(b)) || a.filename.localeCompare(b.filename)),
  [scoped, year, quarter])

  // Index counts follow the search / type / category filters
  const index = useMemo(() => {
    const years = {}
    for (const r of scoped) {
      const y = (years[r.recordYear] = years[r.recordYear] || { year: r.recordYear, count: 0, q: { 1: 0, 2: 0, 3: 0, 4: 0 } })
      y.count += 1
      y.q[r.recordQuarter] += 1
    }
    // Keep every year that has any document, even when the filter empties it
    for (const y of data?.years || []) if (!years[y.year]) years[y.year] = { year: y.year, count: 0, q: { 1: 0, 2: 0, 3: 0, 4: 0 } }
    return Object.values(years).sort((a, b) => b.year - a.year)
  }, [scoped, data])

  // Documents per type in the selected period (chips)
  const typeCounts = useMemo(() => {
    const base = records.filter(r => inPeriod(r) && (!dept || r.department === dept) && (!access || r.classification === access))
    const counts = {}
    base.forEach(r => { counts[r.docType] = (counts[r.docType] || 0) + 1 })
    return { total: base.length, list: Object.entries(counts).sort((a, b) => a[0].localeCompare(b[0])) }
  }, [records, year, quarter, dept, access])

  // Group the results by year + quarter
  const groups = useMemo(() => {
    const out = []
    for (const r of shown) {
      const key = `${r.recordYear}-${r.recordQuarter}`
      let g = out[out.length - 1]
      if (!g || g.key !== key) out.push((g = { key, year: r.recordYear, quarter: r.recordQuarter, items: [] }))
      g.items.push(r)
    }
    return out
  }, [shown])

  async function open_(doc, inline) {
    setBusy(doc.docId)
    const tab = inline ? window.open('', '_blank') : null
    try {
      let res
      try {
        res = await downloadDocument(doc.docId, { inline })
      } catch (err) {
        const body = await readBlobError(err)
        if (err.response?.status === 409 && body.tampered) {
          if (!(isAdmin && body.canOverride && window.confirm(`${body.error}\n\nThis file is blocked. Open it anyway for investigation? (This is logged.)`))) {
            tab?.close()
            toast.error(isAdmin ? 'Tampered — file blocked.' : 'Tampered — this file is blocked. An administrator has been notified.', { duration: 6000 })
            load()
            return
          }
          res = await downloadDocument(doc.docId, { inline, override: true })
        } else {
          throw Object.assign(err, { body })
        }
      }
      if (inline) {
        const url = URL.createObjectURL(res.data)
        if (tab) tab.location.href = url
        else window.open(url, '_blank')
        setTimeout(() => URL.revokeObjectURL(url), 60000)
      } else {
        triggerDownload(res.data, doc.filename)
      }
    } catch (err) {
      tab?.close()
      toast.error(err.body?.error || err.response?.data?.error || 'Download failed.')
    } finally {
      setBusy(null)
    }
  }

  async function saveFiling() {
    try {
      const res = await updateFiling(refiling.docId, { recordYear: refiling.year, recordQuarter: refiling.quarter })
      setData(d => ({ ...d, records: d.records.map(r => (r.docId === refiling.docId ? res.data.record : r)) }))
      toast.success(`Filed under ${filingLabel(res.data.record.recordYear, res.data.record.recordQuarter)}`)
      setRefiling(null)
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not change the filing.')
    }
  }

  if (!data && !error) return <Spinner />

  const anyFilter = q || type || dept || access
  const thisYear = new Date().getFullYear()
  const yearChoices = Array.from(new Set([thisYear + 1, ...index.map(y => y.year), thisYear, thisYear - 1, thisYear - 2])).sort((a, b) => b - a)
  const selectedYear = index.find(y => y.year === year)
  // Upload straight into the folder being viewed: year + quarter, and the type / office filters
  const uploadLink = (() => {
    if (!year || !quarter) return '/upload'
    const p = new URLSearchParams({ year, quarter, from: 'repository' })
    if (type) p.set('type', type)
    if (dept) p.set('dept', dept)
    return `/upload?${p}`
  })()

  return (
    <div className="animate-in">
      <PageHeader
        title="Records Repository"
        sub="Board documents filed by year and quarter, so a requested document can be found in a few clicks"
        action={<Link to={uploadLink}><button className="btn-primary">↑ {year && quarter ? `Upload to ${year} · Quarter ${quarter}` : 'Upload Document'}</button></Link>}
      />

      {error && <Alert type="error">{error}</Alert>}
      {data && !data.ledgerAvailable && <Alert type="warning">The blockchain network is offline. The filing index below comes from the database; downloads need the network.</Alert>}

      {/* Search + filters */}
      <div className="card repo-filters">
        <div className="repo-search">
          <SearchIcon size={16} aria-hidden="true" />
          <input
            placeholder="Find a document: resolution no., title, file name, or “2026 Quarter 3”"
            value={q}
            onChange={e => setFilter({ q: e.target.value })}
            autoFocus
          />
        </div>
        <div className="repo-filter-row">
          <label><span style={label}>DOCUMENT TYPE</span>
            <select value={type} onChange={e => setFilter({ type: e.target.value })}>
              <option value="">All types</option>
              {(data?.types || []).map(t => <option key={t.value} value={t.value}>{t.value} ({t.count})</option>)}
            </select>
          </label>
          <label><span style={label}>OFFICE</span>
            <select value={dept} onChange={e => setFilter({ dept: e.target.value })}>
              <option value="">All offices</option>
              {(data?.departments || []).map(t => <option key={t.value} value={t.value}>{t.value} ({t.count})</option>)}
            </select>
          </label>
          <label><span style={label}>ACCESS</span>
            <select value={access} onChange={e => setFilter({ access: e.target.value })}>
              <option value="">Any</option>
              <option value="public">Public</option>
              <option value="internal">Internal</option>
              <option value="confidential">Confidential</option>
            </select>
          </label>
          {anyFilter && <button className="btn-ghost" onClick={() => setFilter({ q: '', type: '', dept: '', access: '' })}>Clear filters</button>}
        </div>
      </div>

      <div className="repo-layout">
        {/* Filing index: year > quarter */}
        <aside className="card repo-index" aria-label="Filing index">
          <div className="repo-index-title">FILING INDEX</div>
          <button className={`repo-node${!year ? ' is-active' : ''}`} onClick={() => setFilter({ year: '', quarter: '' })}>
            <Archive size={15} aria-hidden="true" /> <span>All records</span> <b>{scoped.length}</b>
          </button>
          {index.map(y => {
            const isOpen = !!open[y.year]
            return (
              <div key={y.year}>
                <button
                  className={`repo-node${year === y.year && !quarter ? ' is-active' : ''}`}
                  onClick={() => { setOpen(o => ({ ...o, [y.year]: year === y.year && !quarter ? !isOpen : true })); setFilter({ year: y.year, quarter: '' }) }}
                >
                  {isOpen ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
                  {isOpen ? <FolderOpen size={15} aria-hidden="true" /> : <FolderClosed size={15} aria-hidden="true" />}
                  <span>{y.year}</span> <b>{y.count}</b>
                </button>
                {isOpen && [1, 2, 3, 4].map(n => (
                  <button
                    key={n}
                    className={`repo-node repo-node-q${year === y.year && quarter === n ? ' is-active' : ''}${y.q[n] ? '' : ' is-empty'}`}
                    onClick={() => setFilter({ year: y.year, quarter: n })}
                  >
                    <span>Quarter {n}</span> <b>{y.q[n]}</b>
                  </button>
                ))}
              </div>
            )
          })}
        </aside>

        <section className="repo-main">
          {/* Where am I */}
          <div className="repo-crumbs">
            <button onClick={() => setFilter({ year: '', quarter: '' })}>All records</button>
            {year && <><span>›</span><button onClick={() => setFilter({ quarter: '' })}>{year}</button></>}
            {quarter && <><span>›</span><b>Quarter {quarter}</b></>}
            <span className="repo-crumbs-count">{shown.length} document{shown.length === 1 ? '' : 's'}</span>
            {year && quarter && <Link to={uploadLink} className="repo-upload-here">↑ Upload to this quarter</Link>}
          </div>

          {/* Year selected: the four quarters at a glance */}
          {selectedYear && !quarter && (
            <div className="repo-quarters">
              {[1, 2, 3, 4].map(n => {
                const docs = scoped.filter(r => r.recordYear === year && r.recordQuarter === n)
                const types = {}
                docs.forEach(r => { types[r.docType] = (types[r.docType] || 0) + 1 })
                return (
                  <button key={n} className={`repo-quarter${docs.length ? '' : ' is-empty'}`} onClick={() => setFilter({ quarter: n })}>
                    <div className="repo-quarter-head"><b>Quarter {n}</b><span>{year}</span></div>
                    <div className="repo-quarter-count">{docs.length}</div>
                    <div className="repo-quarter-types">
                      {Object.keys(types).length ? Object.entries(types).map(([t, c]) => <span key={t}>{c} {t}</span>) : <span>Nothing filed</span>}
                    </div>
                  </button>
                )
              })}
            </div>
          )}

          {/* Type chips for the selected period */}
          {typeCounts.total > 0 && (
            <div className="public-chips repo-chips">
              <button className={`public-chip${!type ? ' is-active' : ''}`} onClick={() => setFilter({ type: '' })}>All types <span>{typeCounts.total}</span></button>
              {typeCounts.list.map(([t, c]) => (
                <button key={t} className={`public-chip${type === t ? ' is-active' : ''}`} onClick={() => setFilter({ type: type === t ? '' : t })}>{t} <span>{c}</span></button>
              ))}
            </div>
          )}

          {shown.length === 0 ? (
            <div className="card" style={{ textAlign: 'center', padding: '3rem', color: 'var(--text3)' }}>
              <div style={{ color: 'var(--text2)', marginBottom: '4px' }}>No documents filed here{anyFilter ? ' that match the filters' : ''}</div>
              <Link to={uploadLink} style={{ fontSize: '13px', color: 'var(--accent)' }}>{year && quarter ? `Upload a document to ${year} · Quarter ${quarter} →` : 'Upload a document →'}</Link>
            </div>
          ) : groups.map(g => (
            <div key={g.key} className="card repo-group">
              <div className="repo-group-head">
                <FolderOpen size={16} aria-hidden="true" />
                <b>{g.year} · Quarter {g.quarter}</b>
                <span className="repo-group-count">{g.items.length} document{g.items.length === 1 ? '' : 's'}</span>
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table className="repo-table">
                  <thead>
                    <tr>{['Reference no.', 'Title / file', 'Type / office', 'Date', 'Access', 'Integrity'].map(h => <th key={h}>{h}</th>)}</tr>
                  </thead>
                  <tbody>
                    {g.items.map(r => (
                      <tr key={r.docId}>
                        <td className="repo-ref">{r.resolutionNumber || '—'}</td>
                        <td className="repo-title">
                          <Link to={`/documents/${r.docId}`} title="Details and version history">{r.title || r.filename}</Link>
                          {r.title && <div className="repo-file">{r.filename}{r.versions > 1 && <span className="badge badge-purple" style={{ marginLeft: '6px', fontSize: '10px' }}>v{r.versions}</span>}</div>}
                          <div style={{ marginTop: '8px' }}>
                          {refiling?.docId === r.docId ? (
                            <div className="repo-refile">
                              <select value={refiling.year} onChange={e => setRefiling(f => ({ ...f, year: Number(e.target.value) }))} aria-label="Year">
                                {yearChoices.map(y => <option key={y} value={y}>{y}</option>)}
                              </select>
                              <select value={refiling.quarter} onChange={e => setRefiling(f => ({ ...f, quarter: Number(e.target.value) }))} aria-label="Quarter">
                                {[1, 2, 3, 4].map(n => <option key={n} value={n}>Quarter {n}</option>)}
                              </select>
                              <button className="repo-btn is-primary" onClick={saveFiling}>Save</button>
                              <button className="repo-btn" onClick={() => setRefiling(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div className="repo-actions">
                              <button className="repo-btn" disabled={busy === r.docId} onClick={() => open_(r, true)} title="Open in a new tab (integrity-checked first)">View</button>
                              <button className="repo-btn is-accent" disabled={busy === r.docId} onClick={() => open_(r, false)}>{busy === r.docId ? '...' : '↓ Download'}</button>
                              {(isAdmin || r.uploader === user.username) && (
                                <button className="repo-btn" onClick={() => setRefiling({ docId: r.docId, year: r.recordYear, quarter: r.recordQuarter })} title="File under another year or quarter">Re-file</button>
                              )}
                            </div>
                          )}
                          </div>
                        </td>
                        <td className="repo-type">{r.docType}<div>{r.department}</div></td>
                        <td className="repo-date">{r.resolutionDate || r.registeredAt?.slice(0, 10)}</td>
                        <td>{ACCESS_BADGE[r.classification]}</td>
                        <td>
                          {r.tampered
                            ? <span className="badge badge-red" title={(r.tamperReasons || []).map(x => TAMPER_REASON_LABELS[x] || x).join(', ')}>⚠ TAMPERED</span>
                            : <span className="badge badge-green">INTACT</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </section>
      </div>
    </div>
  )
}
