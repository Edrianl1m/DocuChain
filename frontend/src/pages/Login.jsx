import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login } from '../services/api'

export default function Login() {
  const [form, setForm] = useState({ username: '', password: '' })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  async function handleSubmit(e) {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const res = await login(form.username, form.password)
      localStorage.setItem('token', res.data.token)
      localStorage.setItem('user', JSON.stringify(res.data.user))
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Login failed. Check your credentials.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '2rem',
    }}>
      {/* Background grid */}
      <div style={{
        position: 'fixed', inset: 0, zIndex: 0,
        backgroundImage: 'linear-gradient(var(--border) 1px, transparent 1px), linear-gradient(90deg, var(--border) 1px, transparent 1px)',
        backgroundSize: '40px 40px', opacity: 0.3,
      }} />

      <div className="animate-in" style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: '380px' }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '2.5rem' }}>
          <div style={{
            width: '56px', height: '56px', borderRadius: '14px',
            background: 'var(--accent2)', margin: '0 auto 1rem',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '28px', border: '1px solid var(--brand-border)',
          }}>⛓</div>
          <h1 style={{ fontSize: '24px', fontWeight: '600', color: 'var(--text)', marginBottom: '4px' }}>DocuChain</h1>
          <p style={{ color: 'var(--text2)', fontSize: '13px', fontFamily: 'IBM Plex Mono, monospace' }}>Blockchain Document Management</p>
        </div>

        {/* Form */}
        <div className="card" style={{ padding: '2rem' }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: 'var(--red-bg)', border: '1px solid var(--status-tampered-border)',
                color: 'var(--red)', padding: '10px 14px', borderRadius: 'var(--radius)',
                fontSize: '13px', marginBottom: '1.25rem',
              }}>{error}</div>
            )}

            <div style={{ marginBottom: '1rem' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', fontFamily: 'IBM Plex Mono, monospace' }}>USERNAME</label>
              <input
                type="text"
                placeholder="Enter username"
                value={form.username}
                onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                required
              />
            </div>

            <div style={{ marginBottom: '1.5rem' }}>
              <label style={{ display: 'block', fontSize: '12px', color: 'var(--text2)', marginBottom: '6px', fontFamily: 'IBM Plex Mono, monospace' }}>PASSWORD</label>
              <input
                type="password"
                placeholder="Enter password"
                value={form.password}
                onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                required
              />
            </div>

            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '11px' }} disabled={loading}>
              {loading ? 'Signing in...' : 'Sign in →'}
            </button>
          </form>

          <hr className="divider" />
          <div style={{ fontSize: '12px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
            <div>admin / admin123</div>
            <div>user1 / user123</div>
          </div>
        </div>

        <p style={{ textAlign: 'center', marginTop: '1.5rem', fontSize: '12px', color: 'var(--text3)' }}>
          DocuChain · DNSC Institute of Computing
        </p>
      </div>
    </div>
  )
}
