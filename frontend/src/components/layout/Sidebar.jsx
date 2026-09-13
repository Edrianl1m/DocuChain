import { useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router-dom'
import { changeMyPassword } from '../../services/api'

const NAV = [
  { to: '/',        icon: '◈', label: 'Dashboard'   },
  { to: '/upload',  icon: '↑', label: 'Upload'      },
  { to: '/verify',  icon: '◎', label: 'Verify'      },
  { to: '/search',  icon: '⌕', label: 'Search'      },
  { to: '/audit',   icon: '≡', label: 'Audit Trail' },
  { to: '/users',   icon: '👤', label: 'Users', adminOnly: true },
]

export default function Sidebar() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const user = JSON.parse(localStorage.getItem('user') || '{}')
  const isAdmin = user.role === 'admin'

  const [showPw, setShowPw] = useState(false)
  const [pwForm, setPwForm] = useState({ current: '', newPw: '', confirm: '' })
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwLoading, setPwLoading] = useState(false)

  function logout() {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }

  async function handleChangePw(e) {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')
    if (pwForm.newPw !== pwForm.confirm) {
      setPwError('New passwords do not match.')
      return
    }
    if (pwForm.newPw.length < 6) {
      setPwError('Password must be at least 6 characters.')
      return
    }
    setPwLoading(true)
    try {
      await changeMyPassword(pwForm.current, pwForm.newPw)
      setPwSuccess('Password changed!')
      setPwForm({ current: '', newPw: '', confirm: '' })
      setTimeout(() => { setShowPw(false); setPwSuccess('') }, 2000)
    } catch (err) {
      setPwError(err.response?.data?.error || 'Failed to change password.')
    } finally {
      setPwLoading(false)
    }
  }

  return (
    <aside style={{
      width: '220px', minHeight: '100vh',
      background: 'var(--bg2)',
      borderRight: '1px solid var(--border)',
      display: 'flex', flexDirection: 'column',
      flexShrink: 0,
    }}>
      {/* Logo */}
      <div style={{ padding: '1.5rem 1.25rem', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div style={{
            width: '32px', height: '32px', borderRadius: '8px',
            background: 'var(--accent2)', display: 'flex',
            alignItems: 'center', justifyContent: 'center',
            fontSize: '16px', flexShrink: 0,
          }}>⛓</div>
          <div>
            <div style={{ fontWeight: '600', fontSize: '15px', color: 'var(--text)' }}>DocuChain</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>v1.0 · LAN</div>
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex: 1, padding: '1rem 0.75rem', display: 'flex', flexDirection: 'column', gap: '2px' }}>
        {NAV.filter(n => !n.adminOnly || isAdmin).map(n => {
          const active = pathname === n.to
          return (
            <Link key={n.to} to={n.to} style={{
              display: 'flex', alignItems: 'center', gap: '10px',
              padding: '9px 12px', borderRadius: 'var(--radius)',
              color: active ? 'var(--text)' : 'var(--text2)',
              background: active ? 'var(--bg4)' : 'transparent',
              borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
              fontSize: '13.5px', fontWeight: active ? '500' : '400',
              transition: 'all 0.15s', textDecoration: 'none',
            }}
            onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--bg3)' }}
            onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent' }}
            >
              <span style={{ fontSize: '16px', width: '20px', textAlign: 'center', color: active ? 'var(--accent)' : 'var(--text3)' }}>{n.icon}</span>
              {n.label}
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      <div style={{ padding: '1rem 0.75rem', borderTop: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
          <div style={{
            width: '30px', height: '30px', borderRadius: '50%',
            background: 'var(--bg4)', border: '1px solid var(--border2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '12px', color: 'var(--accent)', fontWeight: '600', flexShrink: 0,
          }}>
            {(user.username || 'U')[0].toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div style={{ fontSize: '13px', fontWeight: '500', color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.username}</div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>{user.role}</div>
          </div>
        </div>

        {/* Change password toggle */}
        <button
          onClick={() => { setShowPw(!showPw); setPwError(''); setPwSuccess('') }}
          style={{
            width: '100%', padding: '7px', background: 'transparent',
            border: '1px solid var(--border)', color: 'var(--text2)',
            borderRadius: 'var(--radius)', fontSize: '11px', cursor: 'pointer',
            marginBottom: '6px', transition: 'all 0.15s',
          }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)' }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}
        >
          🔑 Change Password
        </button>

        {/* Change password form */}
        {showPw && (
          <form onSubmit={handleChangePw} style={{ marginBottom: '8px' }}>
            {pwError && <div style={{ fontSize: '11px', color: 'var(--red)', marginBottom: '6px', background: 'var(--red-bg)', padding: '6px 8px', borderRadius: '4px' }}>{pwError}</div>}
            {pwSuccess && <div style={{ fontSize: '11px', color: 'var(--green)', marginBottom: '6px', background: 'var(--green-bg)', padding: '6px 8px', borderRadius: '4px' }}>{pwSuccess}</div>}
            <input
              type="password" placeholder="Current password"
              value={pwForm.current}
              onChange={e => setPwForm(f => ({ ...f, current: e.target.value }))}
              style={{ marginBottom: '6px', fontSize: '12px', padding: '7px 10px' }}
              required
            />
            <input
              type="password" placeholder="New password"
              value={pwForm.newPw}
              onChange={e => setPwForm(f => ({ ...f, newPw: e.target.value }))}
              style={{ marginBottom: '6px', fontSize: '12px', padding: '7px 10px' }}
              required
            />
            <input
              type="password" placeholder="Confirm new password"
              value={pwForm.confirm}
              onChange={e => setPwForm(f => ({ ...f, confirm: e.target.value }))}
              style={{ marginBottom: '8px', fontSize: '12px', padding: '7px 10px' }}
              required
            />
            <button type="submit" className="btn-primary" style={{ width: '100%', padding: '7px', fontSize: '12px' }} disabled={pwLoading}>
              {pwLoading ? 'Saving...' : 'Update Password'}
            </button>
          </form>
        )}

        {/* Sign out */}
        <button onClick={logout} style={{
          width: '100%', padding: '8px', background: 'transparent',
          border: '1px solid var(--border)', color: 'var(--text2)',
          borderRadius: 'var(--radius)', fontSize: '12px', cursor: 'pointer',
          transition: 'all 0.15s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--red)'; e.currentTarget.style.color = 'var(--red)' }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--text2)' }}
        >
          Sign out
        </button>
      </div>
    </aside>
  )
}