import { useState, useEffect } from 'react'
import toast from 'react-hot-toast'
import { getTamperedDocuments, getDocuments, getPublicAccessLog, getIntegritySummary, getIntegrityLogs, runIntegrityScan, anchorMetadata, TAMPER_REASON_LABELS } from '../services/api'
import { PageHeader, Spinner, EmptyState } from '../components/ui/Components'

const ACTION_LABELS = {
  register: 'UPLOAD', download: 'DOWNLOAD', view: 'VIEW', verify: 'VERIFY', scan: 'SCAN',
  public_view: 'PUBLIC VIEW', public_download: 'PUBLIC DOWNLOAD', public_preview: 'PUBLIC PREVIEW',
  public_verify: 'PUBLIC VERIFY', metadata_update: 'METADATA EDIT',
}
const RESULT_BADGE = { pass: 'badge-green', fail: 'badge-red', warning: 'badge-yellow', unverified: 'badge-yellow', error: 'badge-yellow' }
const mono = { fontFamily: 'IBM Plex Mono, monospace' }
const fmt = d => (d ? String(d).slice(0, 19).replace('T', ' ') : '—')

export default function AuditTrail() {
  const [tampered, setTampered] = useState([])
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all') // all | tampered | public
  const [accessLog, setAccessLog] = useState([])
  const [summary, setSummary] = useState({ latest: {}, lastScan: null })
  const [checks, setChecks] = useState([])
  const [checkFilter, setCheckFilter] = useState('all') // all | fail
  const [scanning, setScanning] = useState(false)
  const isAdmin = JSON.parse(localStorage.getItem('user') || '{}').role === 'admin'

  async function load() {
    try {
      const [tampRes, allRes, logRes, sumRes, checkRes] = await Promise.allSettled([
        getTamperedDocuments(),
        getDocuments(),
        isAdmin ? getPublicAccessLog() : Promise.resolve(null),
        getIntegritySummary(),
        isAdmin ? getIntegrityLogs({ limit: 300 }) : Promise.resolve(null),
      ])
      if (tampRes.status === 'fulfilled') setTampered(tampRes.value.data.tampered || [])
      if (allRes.status === 'fulfilled') setAll(allRes.value.data.documents || [])
      if (logRes.status === 'fulfilled' && logRes.value) setAccessLog(logRes.value.data.logs || [])
      if (sumRes.status === 'fulfilled') setSummary(sumRes.value.data)
      if (checkRes.status === 'fulfilled' && checkRes.value) setChecks(checkRes.value.data.logs || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [])

  async function handleScan() {
    setScanning(true)
    try {
      const res = await runIntegrityScan()
      const sc = res.data.scan
      if (sc) {
        const text = `Scan finished: ${sc.total} checked, ${sc.passed} passed, ${sc.failed} tampered${sc.unverified ? `, ${sc.unverified} unverified` : ''}${sc.errors ? `, ${sc.errors} errors` : ''}`
        sc.failed > 0 ? toast.error(text, { duration: 6000 }) : toast.success(text)
      } else {
        toast(res.data.message || 'Scan started.')
      }
      setTab('checks')
      await load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Scan failed.')
    } finally {
      setScanning(false)
    }
  }

  async function handleAnchor() {
    if (!window.confirm('Write the metadata hash to the blockchain for documents uploaded before metadata protection existed? Their CURRENT database details will be treated as correct.')) return
    try {
      const res = await anchorMetadata()
      toast.success(`Anchored ${res.data.anchored} document(s).`)
      await load()
    } catch (err) {
      toast.error(err.response?.data?.error || 'Could not anchor metadata.')
    }
  }

  const shownChecks = checkFilter === 'fail' ? checks.filter(c => c.result === 'fail') : checks
  const unanchored = all.filter(d => !d.metadataHash).length

  const display = tab === 'tampered' ? tampered : all

  if (loading) return <Spinner />

  return (
    <div className="animate-in">
      <PageHeader
        title="Audit Trail"
        sub="Full ledger history and integrity status of all documents"
        action={isAdmin && (
          <div style={{ display: 'flex', gap: '8px' }}>
            {unanchored > 0 && <button className="btn-ghost" onClick={handleAnchor} title="Documents uploaded before metadata hashing">Anchor metadata ({unanchored})</button>}
            <button className="btn-primary" onClick={handleScan} disabled={scanning}>{scanning ? 'Scanning…' : '◎ Run integrity scan'}</button>
          </div>
        )}
      />

      {/* Scheduled scan status */}
      <div style={{ fontSize: '12px', color: 'var(--text3)', ...mono, marginBottom: '1rem' }}>
        {summary.lastScan
          ? <>Last integrity scan: {fmt(summary.lastScan.finishedAt || summary.lastScan.createdAt)} ({summary.lastScan.trigger}) · {summary.lastScan.total} checked · <span style={{ color: summary.lastScan.failed ? 'var(--red)' : 'var(--green)' }}>{summary.lastScan.failed} tampered</span></>
          : 'No integrity scan has run yet.'}
        {summary.scanIntervalMinutes > 0 ? ` · runs automatically every ${summary.scanIntervalMinutes} min` : ' · automatic scan is off'}
      </div>

      {/* Summary */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '12px', marginBottom: '1.5rem' }}>
        {[
          { label: 'Total records', value: all.length, color: 'var(--accent)' },
          { label: 'Intact', value: all.filter(d => !d.tampered).length, color: 'var(--green)' },
          { label: 'Tampered', value: tampered.length, color: tampered.length > 0 ? 'var(--red)' : 'var(--text3)' },
        ].map(s => (
          <div key={s.label} className="card" style={{ padding: '1rem', textAlign: 'center' }}>
            <div style={{ fontSize: '24px', fontWeight: '600', color: s.color }}>{s.value}</div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginTop: '4px' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '4px', marginBottom: '1.25rem', background: 'var(--bg2)', padding: '4px', borderRadius: 'var(--radius)', width: 'fit-content', border: '1px solid var(--border)' }}>
        {[
          { id: 'all', label: 'All documents' },
          { id: 'tampered', label: 'Tampered' },
          ...(isAdmin ? [{ id: 'checks', label: 'Integrity checks' }] : []),
          ...(isAdmin ? [{ id: 'public', label: 'Public access' }] : []),
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)} style={{
            padding: '7px 16px', borderRadius: '6px', fontSize: '13px',
            background: tab === t.id ? 'var(--bg4)' : 'transparent',
            color: tab === t.id ? 'var(--text)' : 'var(--text2)',
            border: tab === t.id ? '1px solid var(--border2)' : '1px solid transparent',
            cursor: 'pointer', transition: 'all 0.15s',
          }}>{t.label}</button>
        ))}
      </div>

      {/* Public access log: views, downloads and verifications from the public page */}
      {tab === 'public' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          {accessLog.length === 0 ? (
            <EmptyState icon="◉" message="No public access yet" sub="Views, downloads and verifications from the public page appear here" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Time', 'Action', 'Result', 'Document', 'Visitor IP'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: '400', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {accessLog.map(l => (
                    <tr key={l.id} style={{ borderBottom: '1px solid var(--border)' }}>
                      <td style={{ padding: '12px 16px', color: 'var(--text3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap' }}>{l.createdAt?.slice(0, 19).replace('T', ' ')}</td>
                      <td style={{ padding: '12px 16px' }}><span className="badge badge-blue">{l.action.toUpperCase()}</span></td>
                      <td style={{ padding: '12px 16px' }}>
                        <span className={`badge ${l.result === 'tampered' ? 'badge-red' : l.result === 'authentic' || l.result === 'served' ? 'badge-green' : 'badge-yellow'}`}>{l.result}</span>
                      </td>
                      <td style={{ padding: '12px 16px', fontSize: '10px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{l.docId ? `${l.docId.slice(0, 16)}...` : '—'}</td>
                      <td style={{ padding: '12px 16px', fontSize: '12px', color: 'var(--text2)' }}>{l.ip}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Integrity checks: every verification, pass or fail */}
      {tab === 'checks' && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', gap: '8px', padding: '12px 16px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            {['all', 'fail'].map(f => (
              <button key={f} className="btn-ghost" onClick={() => setCheckFilter(f)} style={{ padding: '4px 12px', fontSize: '12px', background: checkFilter === f ? 'var(--bg4)' : 'transparent' }}>
                {f === 'all' ? 'All results' : `Failures only (${checks.filter(c => c.result === 'fail').length})`}
              </button>
            ))}
            <span style={{ fontSize: '11px', color: 'var(--text3)', marginLeft: 'auto' }}>Every upload, download, view, verification and scan is checked against the blockchain</span>
          </div>
          {shownChecks.length === 0 ? (
            <EmptyState icon="◎" message="No integrity checks yet" sub="Downloads, views, verifications and scans appear here" />
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                <thead>
                  <tr style={{ borderBottom: '1px solid var(--border)' }}>
                    {['Time', 'Check', 'Result', 'Document', 'File', 'Metadata', 'Details', 'By'].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', color: 'var(--text3)', ...mono, fontWeight: '400', whiteSpace: 'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {shownChecks.map(c => (
                    <tr key={c.id} style={{ borderBottom: '1px solid var(--border)', background: c.result === 'fail' ? 'var(--red-bg)' : 'transparent' }}>
                      <td style={{ padding: '10px 16px', color: 'var(--text3)', fontSize: '11px', ...mono, whiteSpace: 'nowrap' }}>{fmt(c.createdAt)}</td>
                      <td style={{ padding: '10px 16px' }}><span className="badge badge-blue">{ACTION_LABELS[c.action] || c.action}</span></td>
                      <td style={{ padding: '10px 16px', whiteSpace: 'nowrap' }}>
                        <span className={`badge ${RESULT_BADGE[c.result] || 'badge-yellow'}`}>{c.result === 'fail' ? '⚠ TAMPERED' : c.result.toUpperCase()}</span>
                        {c.blocked && <div style={{ fontSize: '10px', color: 'var(--red)', marginTop: '3px' }}>file blocked</div>}
                        {c.ledgerRecorded && c.action !== 'register' && c.action !== 'metadata_update' && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>recorded on ledger</div>}
                      </td>
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontSize: '12px', color: 'var(--text)' }}>{c.filename || '—'}</div>
                        <div style={{ fontSize: '10px', color: 'var(--text3)', ...mono }}>{c.docId ? `${c.docId.slice(0, 16)}...` : ''}</div>
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '12px', color: c.fileIntact === false ? 'var(--red)' : c.fileIntact ? 'var(--green)' : 'var(--text3)' }} title={c.computedHash ? `computed ${c.computedHash}\nledger ${c.expectedHash || ''}` : ''}>
                        {c.fileIntact === null || c.fileIntact === undefined ? '—' : c.fileIntact ? '✓ match' : '✗ mismatch'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '12px', color: c.metadataIntact === false ? 'var(--red)' : c.metadataIntact ? 'var(--green)' : 'var(--text3)' }}>
                        {c.metadataIntact === null || c.metadataIntact === undefined ? '—' : c.metadataIntact ? '✓ match' : '✗ changed'}
                      </td>
                      <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text2)', maxWidth: '340px' }}>{c.message}</td>
                      <td style={{ padding: '10px 16px', fontSize: '12px', color: 'var(--text2)', whiteSpace: 'nowrap' }}>{c.actor}{c.ip && c.actor === 'public' ? <div style={{ fontSize: '10px', color: 'var(--text3)' }}>{c.ip}</div> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Table */}
      {tab !== 'public' && tab !== 'checks' && <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {display.length === 0 ? (
          <EmptyState
            icon={tab === 'tampered' ? '✓' : '◈'}
            message={tab === 'tampered' ? 'No tampered documents' : 'No documents on ledger'}
            sub={tab === 'tampered' ? 'All documents have passed integrity checks' : 'Upload documents to see them here'}
          />
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                  {['Filename', 'Department', 'Uploader', 'Registered', 'Last Verified', 'Versions', 'Status'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: '400', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {display.map((doc, i) => (
                  <tr key={doc.docId || i}
                    style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                    onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: '500', color: 'var(--text)', fontSize: '13px', marginBottom: '2px' }}>{doc.filename}</div>
                      <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{doc.docId?.slice(0, 16)}...</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}><span className="badge badge-blue">{doc.department}</span></td>
                    <td style={{ padding: '12px 16px', color: 'var(--text2)', fontSize: '13px' }}>{doc.uploader}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap' }}>{doc.registeredAt?.slice(0, 19).replace('T', ' ')}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap' }}>
                      {summary.latest?.[doc.docId]
                        ? <>{fmt(summary.latest[doc.docId].createdAt)}<div style={{ fontSize: '10px' }}>{ACTION_LABELS[summary.latest[doc.docId].action] || summary.latest[doc.docId].action} · {summary.latest[doc.docId].result}</div></>
                        : (doc.lastVerifiedAt ? doc.lastVerifiedAt.slice(0, 10) : '—')}
                    </td>
                    <td style={{ padding: '12px 16px', color: 'var(--text2)', fontSize: '13px', textAlign: 'center' }}>{doc.versionHistory?.length || 1}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {doc.tampered
                        ? <span className="badge badge-red">⚠ TAMPERED</span>
                        : <span className="badge badge-green">● INTACT</span>
                      }
                      {doc.tampered && (
                        <div style={{ fontSize: '10px', color: 'var(--red)', marginTop: '3px', whiteSpace: 'nowrap' }}>
                          {(doc.tamperReasons || []).map(r => TAMPER_REASON_LABELS[r] || r).join(', ')}{doc.tamperedAt ? ` · ${fmt(doc.tamperedAt)}` : ''}
                        </div>
                      )}
                      {!doc.tampered && doc.restoredAt && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>restored {fmt(doc.restoredAt)}</div>}
                      {!doc.metadataHash && <div style={{ fontSize: '10px', color: 'var(--text3)', marginTop: '3px' }}>metadata not anchored</div>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>}
    </div>
  )
}
