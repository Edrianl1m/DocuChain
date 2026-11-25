import { useState, useEffect } from 'react'
import { getAnalytics, getBotActivity } from '../services/api'
import { PageHeader, Spinner, StatCard, EmptyState, Alert } from '../components/ui/Components'

// Two series, fixed order: Downloads then Views (validated for colour-blind separation)
const SERIES = [
  { key: 'downloads', label: 'Downloaded', color: '#2f74df' },
  { key: 'views', label: 'Viewed', color: '#e08a00' },
]
const RANGES = [7, 30, 90, 365]
const mono = { fontFamily: 'IBM Plex Mono, monospace' }
const th = { textAlign: 'left', padding: '10px 14px', fontSize: '11px', color: 'var(--text3)', fontWeight: 500, borderBottom: '1px solid var(--border)', ...mono, textTransform: 'uppercase' }
const td = { padding: '10px 14px', fontSize: '13px', borderBottom: '1px solid var(--border)' }

function Legend() {
  return (
    <div style={{ display: 'flex', gap: '16px', fontSize: '12px', color: 'var(--text2)' }}>
      {SERIES.map(s => (
        <span key={s.key} style={{ display: 'inline-flex', alignItems: 'center', gap: '6px' }}>
          <span style={{ width: '10px', height: '10px', borderRadius: '2px', background: s.color }} />{s.label}
        </span>
      ))}
    </div>
  )
}

// Daily downloads and views as grouped bars, with a hover tooltip per day
function DailyChart({ daily }) {
  const [hover, setHover] = useState(null)
  const max = Math.max(1, ...daily.map(d => Math.max(d.downloads, d.views)))
  const H = 180
  const showEvery = daily.length > 60 ? 30 : daily.length > 14 ? 7 : 1
  return (
    <div style={{ position: 'relative' }}>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: daily.length > 60 ? '1px' : '4px', height: H, borderBottom: '1px solid var(--border2)', padding: '0 2px' }}>
        {daily.map((d, i) => (
          <div key={d.day}
            onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}
            style={{ flex: 1, height: '100%', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', gap: '2px', background: hover === i ? 'var(--bg4)' : 'transparent', borderRadius: '4px 4px 0 0', cursor: 'default' }}>
            {SERIES.map(s => (
              <div key={s.key} style={{ width: '45%', maxWidth: '14px', height: `${(d[s.key] / max) * (H - 8)}px`, minHeight: d[s.key] ? '2px' : 0, background: s.color, borderRadius: '4px 4px 0 0' }} />
            ))}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', padding: '0 2px', marginTop: '6px' }}>
        {daily.map((d, i) => (
          <div key={d.day} style={{ flex: 1, fontSize: '10px', color: 'var(--text3)', textAlign: 'center', whiteSpace: 'nowrap', overflow: 'visible', ...mono }}>
            {i % showEvery === 0 ? d.day.slice(5) : ''}
          </div>
        ))}
      </div>
      <div style={{ position: 'absolute', top: 0, left: 0, fontSize: '10px', color: 'var(--text3)', ...mono }}>{max}</div>
      {hover !== null && (
        <div style={{ position: 'absolute', top: '8px', left: `min(calc(${(hover / daily.length) * 100}% + 12px), calc(100% - 170px))`, background: 'var(--bg2)', border: '1px solid var(--border2)', borderRadius: '8px', padding: '8px 10px', fontSize: '12px', boxShadow: '0 4px 14px rgba(0,0,0,.12)', pointerEvents: 'none', minWidth: '150px' }}>
          <div style={{ fontWeight: 600, marginBottom: '4px' }}>{daily[hover].day}</div>
          {SERIES.map(s => (
            <div key={s.key} style={{ display: 'flex', justifyContent: 'space-between', gap: '10px', color: 'var(--text2)' }}>
              <span><span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '2px', background: s.color, marginRight: '6px' }} />{s.label}</span>
              <span style={{ color: 'var(--text)', ...mono }}>{daily[hover][s.key]}</span>
            </div>
          ))}
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text3)', marginTop: '2px' }}><span>Verified</span><span style={mono}>{daily[hover].verifications}</span></div>
          <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text3)' }}><span>Uploaded</span><span style={mono}>{daily[hover].uploads}</span></div>
        </div>
      )}
    </div>
  )
}

// Horizontal bar used inside tables (single measure, so a single hue)
function InlineBar({ value, max, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
      <div style={{ flex: 1, minWidth: '60px', height: '8px', background: 'var(--bg3)', borderRadius: '4px' }}>
        <div style={{ width: `${max ? (value / max) * 100 : 0}%`, height: '100%', background: color, borderRadius: '4px' }} />
      </div>
      <span style={{ width: '32px', textAlign: 'right', ...mono }}>{value}</span>
    </div>
  )
}

function TopTable({ title, rows, metric, color }) {
  const max = Math.max(0, ...rows.map(r => r[metric]))
  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ padding: '14px 16px', fontWeight: 600 }}>{title}</div>
      {rows.length === 0
        ? <div style={{ padding: '0 16px 16px', fontSize: '13px', color: 'var(--text3)' }}>No activity in this period.</div>
        : <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead><tr><th style={th}>#</th><th style={th}>Document</th><th style={th}>Department</th><th style={{ ...th, width: '40%' }}>{metric === 'downloads' ? 'Times downloaded' : 'Times viewed'}</th></tr></thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.docId}>
                    <td style={{ ...td, color: 'var(--text3)' }}>{i + 1}</td>
                    <td style={td} title={r.docId}>{r.filename}</td>
                    <td style={{ ...td, color: 'var(--text2)' }}>{r.department}</td>
                    <td style={td}><InlineBar value={r[metric]} max={max} color={color} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>}
    </div>
  )
}

// YYYY-MM-DD of a timestamp in the browser's time zone (matches <input type="date">)
function localDay(ts) {
  const d = new Date(ts)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

const RULE_LABELS = {
  rapid_burst: 'Rapid hopping',
  high_rate: 'Too many in 1 minute',
}

// Possible automated (non-human) access, e.g. opening a new document every second
function BotActivity({ bot, error }) {
  const r = bot?.rules
  return (
    <div className="card" style={{ padding: 0, marginBottom: '1.25rem' }}>
      <div style={{ padding: '14px 16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px', flexWrap: 'wrap' }}>
        <div>
          <div style={{ fontWeight: 600 }}>Possible automated (non-human) activity</div>
          {r && (
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>
              Flagged when {r.fastRun}+ documents are accessed in a row, each within {r.fastGapMs / 1000} s of the last, or {r.rateLimit}+ accesses happen within {r.rateWindowSec} s.
              Checked {bot.accessesChecked} accesses.
            </div>
          )}
        </div>
        {bot && (
          <span className="badge" style={{ background: bot.incidents.length ? 'var(--red-bg)' : 'var(--green-bg, transparent)', color: bot.incidents.length ? 'var(--red)' : 'var(--green)' }}>
            {bot.incidents.length ? `${bot.incidents.length} flagged · ${bot.flaggedActors} source${bot.flaggedActors === 1 ? '' : 's'}` : 'None detected'}
          </span>
        )}
      </div>
      {error && <div style={{ padding: '0 16px 14px' }}><Alert type="error">{error}</Alert></div>}
      {bot && bot.incidents.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead><tr>{['Detected', 'Who', 'Pattern', 'Accesses', 'Documents', 'Fastest gap', 'Average gap', 'When'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
            <tbody>
              {bot.incidents.map((i, n) => (
                <tr key={n}>
                  <td style={td}><span className="badge" style={{ background: 'var(--red-bg)', color: 'var(--red)' }}>{RULE_LABELS[i.rule] || i.rule}</span></td>
                  <td style={td}>{i.who}<div style={{ fontSize: '11px', color: 'var(--text3)' }}>{i.source === 'public' ? 'Public visitor (IP)' : 'Staff account'}</div></td>
                  <td style={{ ...td, color: 'var(--text2)', fontSize: '12px' }}>{Object.entries(i.actions).map(([a, c]) => `${a.replace('public_', 'public ')} ×${c}`).join(', ')}</td>
                  <td style={{ ...td, ...mono }}>{i.events} in {i.durationSec} s</td>
                  <td style={{ ...td, fontSize: '12px' }} title={i.documents.join('\n')}>{i.distinctDocuments}</td>
                  <td style={{ ...td, ...mono }}>{i.fastestGapMs != null ? `${(i.fastestGapMs / 1000).toFixed(1)} s` : '—'}</td>
                  <td style={{ ...td, ...mono }}>{i.averageGapMs != null ? `${(i.averageGapMs / 1000).toFixed(1)} s` : '—'}</td>
                  <td style={{ ...td, color: 'var(--text2)', ...mono, fontSize: '12px' }}>{new Date(i.start).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {bot && bot.incidents.length === 0 && (
        <div style={{ padding: '0 16px 16px', fontSize: '13px', color: 'var(--text2)' }}>No bot-like access patterns in this period.</div>
      )}
    </div>
  )
}

export default function Analytics() {
  const [days, setDays] = useState(30)
  const [data, setData] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [bot, setBot] = useState(null)
  const [botError, setBotError] = useState('')
  // Filters for the "All documents with activity" table (client side)
  const [docFilter, setDocFilter] = useState({ q: '', department: '', docType: '', activity: '', from: '', to: '' })
  const user = JSON.parse(localStorage.getItem('user') || '{}')

  useEffect(() => {
    setLoading(true)
    setError('')
    getAnalytics(days)
      .then(res => setData(res.data))
      .catch(err => setError(err.response?.data?.error || 'Could not load analytics.'))
      .finally(() => setLoading(false))
    setBotError('')
    getBotActivity(days)
      .then(res => setBot(res.data))
      .catch(err => { setBot(null); setBotError(err.response?.data?.error || 'Could not check for automated activity.') })
  }, [days])

  const t = data?.totals
  const maxDept = data ? Math.max(0, ...data.byDepartment.map(d => d.downloads + d.views)) : 0
  const maxUser = data ? Math.max(0, ...data.byUser.map(u => u.downloads + u.views)) : 0
  const docs = data?.documents || []
  const departments = [...new Set(docs.map(d => d.department).filter(Boolean))].sort()
  const docTypes = [...new Set(docs.map(d => d.docType).filter(Boolean))].sort()
  const filteredDocs = docs.filter(d => {
    const f = docFilter
    if (f.q && !(d.filename || '').toLowerCase().includes(f.q.trim().toLowerCase())) return false
    if (f.department && d.department !== f.department) return false
    if (f.docType && d.docType !== f.docType) return false
    if (f.activity === 'downloaded' && !d.downloads) return false
    if (f.activity === 'viewed' && !d.views) return false
    if (f.activity === 'verified' && !d.verifications) return false
    if (f.activity === 'never' && (d.downloads || d.views)) return false
    if (f.from || f.to) {
      // Compare by the calendar day of "Last accessed" in the viewer's own time zone
      if (!d.lastAccessAt) return false
      const day = localDay(d.lastAccessAt)
      if (f.from && day < f.from) return false
      if (f.to && day > f.to) return false
    }
    return true
  })
  const filtersOn = Object.values(docFilter).some(Boolean)
  const setF = (k, v) => setDocFilter(f => ({ ...f, [k]: v }))
  const peakHour = data ? data.byHour.reduce((a, b) => (b.count > a.count ? b : a), { hour: null, count: 0 }) : null

  return (
    <div className="animate-in">
      <PageHeader
        title="Audit Analytics"
        sub={user.role === 'admin' ? 'Document downloads, views and verifications from the audit trail' : 'Activity on the documents you uploaded'}
        action={
          <div style={{ display: 'flex', gap: '6px' }}>
            {RANGES.map(r => (
              <button key={r} className={r === days ? 'btn-primary' : 'btn-ghost'} onClick={() => setDays(r)} style={{ padding: '6px 12px', fontSize: '12px' }}>
                {r === 365 ? '1 year' : `${r} days`}
              </button>
            ))}
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}
      {loading && !data && <Spinner />}

      {data && (
        <div style={{ opacity: loading ? 0.6 : 1, transition: 'opacity .2s' }}>
          {!data.ledgerAvailable && <Alert type="warning">The blockchain is offline, so departments show as "Unknown". Counts still come from the audit log.</Alert>}

          {/* Stat cards in one row, related pairs side by side */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '1.25rem' }}>
            <StatCard label="Downloaded" value={t.downloads} sub={`Last ${data.days} days`} color="var(--accent)" />
            <StatCard label="Uploaded" value={t.uploads} sub="Registered on ledger" color="var(--accent)" />
            <StatCard label="Verified" value={t.verifications} sub="Staff and public" color="var(--purple)" />
            <StatCard label="Failed checks" value={t.failedChecks} sub={`${t.blockedAccess} access attempts blocked`} color={t.failedChecks ? 'var(--red)' : 'var(--text3)'} />
            <StatCard label="Viewed" value={t.views} sub="File opened" color="var(--accent2)" />
            <StatCard label="Never accessed" value={t.neverAccessed} sub={`of ${t.documents} documents`} color="var(--text2)" />
          </div>

          <div className="card" style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '8px', marginBottom: '1rem' }}>
              <div>
                <div style={{ fontWeight: 600 }}>Daily document access</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>
                  Staff {t.staffAccess} · Public {t.publicAccess}{peakHour?.count ? ` · Busiest hour ${String(peakHour.hour).padStart(2, '0')}:00` : ''} ({data.timezone})
                </div>
              </div>
              <Legend />
            </div>
            {t.downloads + t.views + t.verifications + t.uploads === 0
              ? <EmptyState icon="◔" message="No activity in this period" sub="Downloaded, viewed and verified documents appear here" />
              : <DailyChart daily={data.daily} />}
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <TopTable title="Most downloaded documents" rows={data.topDownloaded} metric="downloads" color={SERIES[0].color} />
            <TopTable title="Most viewed documents" rows={data.topViewed} metric="views" color={SERIES[1].color} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '1.25rem', marginBottom: '1.25rem' }}>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', fontWeight: 600 }}>Access by department</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>Department</th><th style={th}>Downloaded</th><th style={th}>Viewed</th><th style={{ ...th, width: '40%' }}>Times accessed</th></tr></thead>
                <tbody>
                  {data.byDepartment.length === 0 && <tr><td style={{ ...td, color: 'var(--text3)' }} colSpan={4}>No activity in this period.</td></tr>}
                  {data.byDepartment.map(d => (
                    <tr key={d.department}>
                      <td style={td}>{d.department}</td>
                      <td style={{ ...td, ...mono }}>{d.downloads}</td>
                      <td style={{ ...td, ...mono }}>{d.views}</td>
                      <td style={td}><InlineBar value={d.downloads + d.views} max={maxDept} color="var(--text2)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', fontWeight: 600 }}>Most active users</div>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr><th style={th}>User</th><th style={th}>Downloaded</th><th style={th}>Viewed</th><th style={th}>Verified</th><th style={{ ...th, width: '30%' }}>Times accessed</th></tr></thead>
                <tbody>
                  {data.byUser.length === 0 && <tr><td style={{ ...td, color: 'var(--text3)' }} colSpan={5}>No activity in this period.</td></tr>}
                  {data.byUser.map(u => (
                    <tr key={u.user}>
                      <td style={td}>{u.user}</td>
                      <td style={{ ...td, ...mono }}>{u.downloads}</td>
                      <td style={{ ...td, ...mono }}>{u.views}</td>
                      <td style={{ ...td, ...mono }}>{u.verifications}</td>
                      <td style={td}><InlineBar value={u.downloads + u.views} max={maxUser} color="var(--text2)" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <BotActivity bot={bot} error={botError} />

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px 10px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <div style={{ fontWeight: 600 }}>All documents with activity</div>
              <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Showing {filteredDocs.length} of {docs.length}</div>
            </div>
            <div style={{ padding: '0 16px 14px', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px', alignItems: 'center' }}>
              <input type="text" placeholder="Search document name" value={docFilter.q} onChange={e => setF('q', e.target.value)} aria-label="Search document name" />
              <select value={docFilter.department} onChange={e => setF('department', e.target.value)} aria-label="Department">
                <option value="">All departments</option>
                {departments.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={docFilter.docType} onChange={e => setF('docType', e.target.value)} aria-label="Type">
                <option value="">All types</option>
                {docTypes.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
              <select value={docFilter.activity} onChange={e => setF('activity', e.target.value)} aria-label="Activity">
                <option value="">All activity</option>
                <option value="downloaded">Downloaded</option>
                <option value="viewed">Viewed</option>
                <option value="verified">Verified</option>
                <option value="never">Never accessed</option>
              </select>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', gridColumn: 'span 2' }} title="Last accessed date range">
                <input type="date" value={docFilter.from} max={docFilter.to || undefined} onChange={e => setF('from', e.target.value)} aria-label="Last accessed from" />
                <span style={{ color: 'var(--text3)' }}>–</span>
                <input type="date" value={docFilter.to} min={docFilter.from || undefined} onChange={e => setF('to', e.target.value)} aria-label="Last accessed to" />
              </div>
              <button type="button" className="btn-ghost" onClick={() => setDocFilter({ q: '', department: '', docType: '', activity: '', from: '', to: '' })} disabled={!filtersOn}>Clear</button>
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead><tr>{['Document', 'Department', 'Type', 'Downloaded', 'Viewed', 'Verified', 'Last accessed'].map(h => <th key={h} style={th}>{h}</th>)}</tr></thead>
                <tbody>
                  {filteredDocs.length === 0 && <tr><td style={{ ...td, color: 'var(--text3)' }} colSpan={7}>{docs.length === 0 ? 'No activity in this period.' : 'No documents match these filters.'}</td></tr>}
                  {filteredDocs.map(d => (
                    <tr key={d.docId}>
                      <td style={td} title={d.docId}>{d.filename}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{d.department}</td>
                      <td style={{ ...td, color: 'var(--text2)' }}>{d.docType}</td>
                      <td style={{ ...td, ...mono }}>{d.downloads}</td>
                      <td style={{ ...td, ...mono }}>{d.views}</td>
                      <td style={{ ...td, ...mono }}>{d.verifications}</td>
                      <td style={{ ...td, color: 'var(--text2)', ...mono, fontSize: '12px' }}>{d.lastAccessAt ? new Date(d.lastAccessAt).toLocaleString() : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
