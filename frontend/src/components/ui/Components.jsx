// ── Stat card ─────────────────────────────────────────────────
export function StatCard({ label, value, sub, color = 'var(--accent)' }) {
  return (
    <div className="card" style={{ padding: '1.25rem' }}>
      <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: '8px' }}>{label}</div>
      <div style={{ fontSize: '28px', fontWeight: '600', color, lineHeight: 1 }}>{value}</div>
      {sub && <div style={{ fontSize: '12px', color: 'var(--text2)', marginTop: '6px' }}>{sub}</div>}
    </div>
  )
}

// ── Hash display ───────────────────────────────────────────────
export function HashRow({ label, value }) {
  function copy() {
    navigator.clipboard.writeText(value)
  }
  return (
    <div style={{ marginBottom: '10px' }}>
      <div style={{ fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '4px' }}>{label}</div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <div className="hash-highlight" style={{ flex: 1, fontSize: '11px' }}>{value || '—'}</div>
        {value && (
          <button onClick={copy} className="btn-ghost" style={{ padding: '6px 10px', fontSize: '11px', flexShrink: 0 }}>copy</button>
        )}
      </div>
    </div>
  )
}

// ── Integrity badge ────────────────────────────────────────────
export function IntegrityBadge({ intact }) {
  if (intact === null || intact === undefined) return null
  return intact
    ? <span className="badge badge-green">● INTACT</span>
    : <span className="badge badge-red">⚠ TAMPERED</span>
}

// ── Empty state ────────────────────────────────────────────────
export function EmptyState({ icon = '◈', message, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '4rem 2rem', color: 'var(--text3)' }}>
      <div style={{ fontSize: '48px', marginBottom: '1rem', opacity: 0.3 }}>{icon}</div>
      <div style={{ fontSize: '15px', color: 'var(--text2)', marginBottom: '6px' }}>{message}</div>
      {sub && <div style={{ fontSize: '13px' }}>{sub}</div>}
    </div>
  )
}

// ── Spinner ────────────────────────────────────────────────────
export function Spinner() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: '10px', color: 'var(--text2)', padding: '2rem' }}>
      <div className="loading-dot" />
      <div className="loading-dot" style={{ animationDelay: '0.2s' }} />
      <div className="loading-dot" style={{ animationDelay: '0.4s' }} />
      <span style={{ fontSize: '13px' }}>Loading...</span>
    </div>
  )
}

// ── Page header ────────────────────────────────────────────────
export function PageHeader({ title, sub, action }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '22px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>{title}</h1>
        {sub && <p style={{ color: 'var(--text2)', fontSize: '13px' }}>{sub}</p>}
      </div>
      {action && <div>{action}</div>}
    </div>
  )
}

// ── Alert ──────────────────────────────────────────────────────
export function Alert({ type = 'info', children }) {
  const styles = {
    info:    { bg: '#0d1a2d', border: '#1a3050', color: 'var(--accent)' },
    success: { bg: 'var(--green-bg)', border: '#1a4a2a', color: 'var(--green)' },
    error:   { bg: 'var(--red-bg)', border: '#3a1515', color: 'var(--red)' },
    warning: { bg: 'var(--yellow-bg)', border: '#3a2e0d', color: 'var(--yellow)' },
  }
  const s = styles[type]
  return (
    <div style={{ background: s.bg, border: `1px solid ${s.border}`, color: s.color, borderRadius: 'var(--radius)', padding: '12px 16px', fontSize: '13px', marginBottom: '1rem' }}>
      {children}
    </div>
  )
}
