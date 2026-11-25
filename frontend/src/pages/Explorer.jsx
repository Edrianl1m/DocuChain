import { useState, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { getExplorerBlocks, validateChain } from '../services/api'
import { PageHeader, Spinner, EmptyState, Alert, StatCard } from '../components/ui/Components'

const PAGE_SIZE = 20

export function shortHash(hash, size = 10) {
  if (!hash) return '—'
  return hash.length > size * 2 ? `${hash.slice(0, size)}…${hash.slice(-6)}` : hash
}

export function formatTime(iso) {
  return iso ? iso.slice(0, 19).replace('T', ' ') : '—'
}

export const ACTION_BADGE = {
  REGISTER: 'badge-green',
  UPDATE: 'badge-blue',
  VERIFY: 'badge-purple',
  DEACTIVATE: 'badge-red',
  CONFIG: 'badge-yellow',
}

// Shown instead of crashing when the Fabric network is down
export function FabricOffline({ data, onRetry }) {
  return (
    <div className="card" style={{ borderColor: 'var(--status-warning-border)', background: 'var(--yellow-bg)' }}>
      <div style={{ display: 'flex', gap: '12px', alignItems: 'flex-start' }}>
        <div style={{ fontSize: '24px' }}>⛓</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: '600', color: 'var(--yellow)', marginBottom: '4px' }}>Blockchain network offline</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '6px' }}>
            {data?.error || 'The Hyperledger Fabric network is not reachable, so the ledger cannot be read right now.'}
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>{data?.hint}</div>
          {data?.detail && (
            <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>Detail: {data.detail}</div>
          )}
          <button className="btn-ghost" style={{ marginTop: '12px', fontSize: '12px' }} onClick={onRetry}>Retry</button>
        </div>
      </div>
    </div>
  )
}

export default function Explorer() {
  const [data, setData] = useState(null)
  const [offline, setOffline] = useState(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(true)
  const [validating, setValidating] = useState(false)
  const [validation, setValidation] = useState(null)
  const [error, setError] = useState('')
  const [jump, setJump] = useState('')
  const navigate = useNavigate()

  async function load(p = page) {
    setLoading(true)
    setError('')
    try {
      const res = await getExplorerBlocks(p, PAGE_SIZE)
      setData(res.data)
      setOffline(null)
    } catch (err) {
      if (err.response?.data?.available === false) setOffline(err.response.data)
      else setError(err.response?.data?.error || 'Could not load blocks.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load(page) }, [page])

  async function handleValidate() {
    setValidating(true)
    setValidation(null)
    try {
      const res = await validateChain()
      setValidation(res.data)
    } catch (err) {
      if (err.response?.data?.available === false) setOffline(err.response.data)
      else setError(err.response?.data?.error || 'Validation failed.')
    } finally {
      setValidating(false)
    }
  }

  const totalPages = data ? Math.max(1, Math.ceil(data.height / PAGE_SIZE)) : 1

  return (
    <div className="animate-in">
      <PageHeader
        title="Blockchain Explorer"
        sub={`Blocks and transactions on the Hyperledger Fabric channel${data?.channel ? ` "${data.channel}"` : ''}`}
        action={
          <button className="btn-primary" onClick={handleValidate} disabled={validating || !!offline} style={{ opacity: offline ? 0.5 : 1 }}>
            {validating ? 'Validating chain...' : '✓ Validate Chain'}
          </button>
        }
      />

      {error && <Alert type="error">{error}</Alert>}

      {validation && (
        <Alert type={validation.valid ? 'success' : 'error'}>
          {validation.valid
            ? `Chain is valid. ${validation.checkedBlocks} block(s) checked: every previous hash and data hash matches.`
            : `Chain validation failed in ${validation.issues.length} place(s).`}
          {!validation.valid && (
            <ul style={{ margin: '6px 0 0 18px' }}>
              {validation.issues.map((i, n) => <li key={n}>Block {i.block}: {i.problem}</li>)}
            </ul>
          )}
          <div style={{ fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', marginTop: '6px', opacity: 0.8 }}>
            Checked at {formatTime(validation.checkedAt)}{validation.fromBlock > 0 ? ` · from block ${validation.fromBlock}` : ''}
          </div>
        </Alert>
      )}

      {offline ? (
        <FabricOffline data={offline} onRetry={() => load(page)} />
      ) : loading && !data ? (
        <Spinner />
      ) : data && (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: '12px', marginBottom: '1.5rem' }}>
            <StatCard label="Block height" value={data.height} sub="Blocks on the channel" color="var(--accent2)" />
            <StatCard label="Latest block" value={data.height - 1} sub={shortHash(data.currentBlockHash, 8)} color="var(--accent)" />
            <StatCard label="Network" value="Online" sub="Fabric peer reachable" color="var(--green)" />
          </div>

          <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '1rem 1.25rem', borderBottom: '1px solid var(--border)', gap: '10px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '15px', fontWeight: '500' }}>Blocks (newest first)</h2>
              <form
                onSubmit={e => { e.preventDefault(); if (jump !== '') navigate(`/explorer/${jump}`) }}
                style={{ display: 'flex', gap: '6px' }}
              >
                <input type="number" min="0" placeholder="Block no." value={jump} onChange={e => setJump(e.target.value)} style={{ width: '110px', padding: '6px 10px', fontSize: '12px' }} />
                <button type="submit" className="btn-ghost" style={{ fontSize: '12px', padding: '6px 12px' }}>Go</button>
              </form>
            </div>

            {data.blocks.length === 0 ? (
              <EmptyState icon="⛓" message="No blocks on this page" />
            ) : (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border)' }}>
                      {['Block', 'Timestamp', 'Action', 'Document hash', 'Previous hash', 'User', 'Txs'].map(h => (
                        <th key={h} style={{ textAlign: 'left', padding: '10px 14px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: '400', whiteSpace: 'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.blocks.map(b => (
                      <tr key={b.number}
                        onClick={() => navigate(`/explorer/${b.number}`)}
                        style={{ borderBottom: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.1s' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                      >
                        <td style={{ padding: '10px 14px' }}>
                          <Link to={`/explorer/${b.number}`} style={{ color: 'var(--accent)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: '600' }}>{b.number}</Link>
                        </td>
                        <td style={{ padding: '10px 14px', color: 'var(--text3)', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', whiteSpace: 'nowrap' }}>{formatTime(b.timestamp)}</td>
                        <td style={{ padding: '10px 14px' }}>
                          {b.action && <span className={`badge ${ACTION_BADGE[b.action] || 'badge-blue'}`}>{b.action}</span>}
                        </td>
                        <td style={{ padding: '10px 14px', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text2)' }} title={b.documentHash || ''}>{shortHash(b.documentHash)}</td>
                        <td style={{ padding: '10px 14px', fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', color: 'var(--text3)' }} title={b.previousHash}>{b.number === 0 ? 'genesis' : shortHash(b.previousHash)}</td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text2)' }}>{b.user || '—'}</td>
                        <td style={{ padding: '10px 14px', fontSize: '12px', color: 'var(--text2)', textAlign: 'center' }}>{b.txCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0.75rem 1.25rem', fontSize: '12px', color: 'var(--text3)' }}>
              <span>Page {page} of {totalPages}</span>
              <div style={{ display: 'flex', gap: '6px' }}>
                <button className="btn-ghost" style={{ fontSize: '12px', padding: '5px 12px' }} disabled={page <= 1 || loading} onClick={() => setPage(p => p - 1)}>← Newer</button>
                <button className="btn-ghost" style={{ fontSize: '12px', padding: '5px 12px' }} disabled={page >= totalPages || loading} onClick={() => setPage(p => p + 1)}>Older →</button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
