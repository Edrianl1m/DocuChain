import { useState, useEffect } from 'react'
import { getTamperedDocuments, getDocuments } from '../services/api'
import { PageHeader, Spinner, EmptyState } from '../components/ui/Components'

export default function AuditTrail() {
  const [tampered, setTampered] = useState([])
  const [all, setAll] = useState([])
  const [loading, setLoading] = useState(true)
  const [tab, setTab] = useState('all') // all | tampered

  useEffect(() => {
    async function load() {
      try {
        const [tampRes, allRes] = await Promise.allSettled([
          getTamperedDocuments(),
          getDocuments(),
        ])
        if (tampRes.status === 'fulfilled') setTampered(tampRes.value.data.tampered || [])
        if (allRes.status === 'fulfilled') setAll(allRes.value.data.documents || [])
      } finally {
        setLoading(false)
      }
    }
    load()
  }, [])

  const display = tab === 'tampered' ? tampered : all

  if (loading) return <Spinner />

  return (
    <div className="animate-in">
      <PageHeader title="Audit Trail" sub="Full ledger history and integrity status of all documents" />

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
          { id: 'tampered', label: `Tampered (${tampered.length})` },
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

      {/* Table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
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
                    <td style={{ padding: '12px 16px', color: 'var(--text3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap' }}>{doc.lastVerifiedAt ? doc.lastVerifiedAt.slice(0, 10) : '—'}</td>
                    <td style={{ padding: '12px 16px', color: 'var(--text2)', fontSize: '13px', textAlign: 'center' }}>{doc.versionHistory?.length || 1}</td>
                    <td style={{ padding: '12px 16px' }}>
                      {doc.tampered
                        ? <span className="badge badge-red">⚠ TAMPERED</span>
                        : <span className="badge badge-green">● INTACT</span>
                      }
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
