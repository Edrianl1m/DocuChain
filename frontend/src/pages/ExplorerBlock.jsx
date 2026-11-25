import { useState, useEffect } from 'react'
import { Link, useParams } from 'react-router-dom'
import { getExplorerBlock } from '../services/api'
import { PageHeader, Spinner, Alert, HashRow } from '../components/ui/Components'
import { FabricOffline, ACTION_BADGE, formatTime } from './Explorer'

function Field({ label, children }) {
  return (
    <div>
      <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '2px' }}>{label}</div>
      <div style={{ fontSize: '13px', color: 'var(--text)', wordBreak: 'break-all' }}>{children || '—'}</div>
    </div>
  )
}

export default function ExplorerBlock() {
  const { number } = useParams()
  const [data, setData] = useState(null)
  const [offline, setOffline] = useState(null)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(true)

  async function load() {
    setLoading(true)
    setError('')
    try {
      const res = await getExplorerBlock(number)
      setData(res.data)
      setOffline(null)
    } catch (err) {
      if (err.response?.data?.available === false) setOffline(err.response.data)
      else setError(err.response?.data?.error || 'Could not load block.')
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { load() }, [number])

  const block = data?.block
  const n = Number(number)

  return (
    <div className="animate-in">
      <PageHeader
        title={`Block ${number}`}
        sub="Block header, hashes and transactions read from the Fabric ledger"
        action={
          <div style={{ display: 'flex', gap: '6px' }}>
            {n > 0 && <Link to={`/explorer/${n - 1}`}><button className="btn-ghost">← {n - 1}</button></Link>}
            {data && n < data.height - 1 && <Link to={`/explorer/${n + 1}`}><button className="btn-ghost">{n + 1} →</button></Link>}
            <Link to="/explorer"><button className="btn-ghost">All blocks</button></Link>
          </div>
        }
      />

      {error && <Alert type="error">{error}</Alert>}
      {offline && <FabricOffline data={offline} onRetry={load} />}
      {loading && !block && !offline && <Spinner />}

      {block && (
        <>
          <div className="card" style={{ marginBottom: '1rem' }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: '1rem', marginBottom: '1.25rem' }}>
              <Field label="BLOCK NUMBER">{block.number}</Field>
              <Field label="TIMESTAMP"><span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{formatTime(block.timestamp)}</span></Field>
              <Field label="TRANSACTIONS">{block.txCount}</Field>
              <Field label="DATA HASH CHECK">
                {block.dataHashValid
                  ? <span className="badge badge-green">● matches transactions</span>
                  : <span className="badge badge-red">⚠ mismatch</span>}
              </Field>
            </div>
            <HashRow label="Block hash (computed from header)" value={block.blockHash} />
            <HashRow label="Previous block hash" value={block.previousHash || '(genesis block has no previous hash)'} />
            <HashRow label="Data hash" value={block.dataHash} />
          </div>

          <h2 style={{ fontSize: '14px', fontWeight: '500', margin: '1.5rem 0 0.75rem', color: 'var(--text2)', fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Transactions</h2>
          {block.transactions.map((tx, i) => (
            <div key={tx.txId || i} className="card" style={{ marginBottom: '0.75rem' }}>
              <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '1rem' }}>
                <span className={`badge ${ACTION_BADGE[tx.action] || 'badge-blue'}`}>{tx.action}</span>
                <span className="badge badge-purple">{tx.type}</span>
                {tx.validationCode && (
                  <span className={`badge ${tx.validationCode === 'VALID' ? 'badge-green' : 'badge-red'}`}>{tx.validationCode}</span>
                )}
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', marginBottom: '1rem' }}>
                <Field label="USER">{tx.user}</Field>
                <Field label="SIGNED BY">{tx.creator}{tx.creatorMsp ? ` (${tx.creatorMsp})` : ''}</Field>
                <Field label="CHAINCODE / FUNCTION">{tx.chaincode ? `${tx.chaincode} · ${tx.function}` : null}</Field>
                <Field label="TIMESTAMP"><span style={{ fontFamily: 'IBM Plex Mono, monospace' }}>{formatTime(tx.timestamp)}</span></Field>
                <Field label="DOCUMENT ID"><span style={{ fontFamily: 'IBM Plex Mono, monospace', fontSize: '12px' }}>{tx.docId}</span></Field>
                <Field label="FILENAME">{tx.filename}</Field>
              </div>
              <HashRow label="Transaction ID" value={tx.txId} />
              {tx.documentHash && <HashRow label="Document SHA-256" value={tx.documentHash} />}
            </div>
          ))}
        </>
      )}
    </div>
  )
}
