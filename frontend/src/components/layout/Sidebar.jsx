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
    <aside className="sidebar">
      {/* Logo */}
      <div className="sidebar-brand">
        <div className="sidebar-brand-mark">◈</div>
        <div className="sidebar-brand-copy">
            <div className="sidebar-brand-name">DNSC</div>
            <div className="sidebar-brand-subtitle">DocuChain System</div>
          </div>
      </div>

      {/* Nav */}
      <nav className="sidebar-nav">
        {NAV.filter(n => !n.adminOnly || isAdmin).map(n => {
          const active = pathname === n.to
          return (
            <Link key={n.to} to={n.to} className={`sidebar-link${active ? ' is-active' : ''}`}>
              <span className="sidebar-icon">{n.icon}</span>
              <span className="sidebar-link-label">{n.label}</span>
            </Link>
          )
        })}
      </nav>

      {/* User info */}
      <div className="sidebar-footer">
        <div className="sidebar-user">
          <div className="sidebar-avatar">
            {(user.username || 'U')[0].toUpperCase()}
          </div>
          <div style={{ overflow: 'hidden', flex: 1 }}>
            <div className="sidebar-username">{user.username}</div>
            <div className="sidebar-role">{user.role}</div>
          </div>
        </div>

        {/* Change password toggle */}
        <button
          onClick={() => { setShowPw(!showPw); setPwError(''); setPwSuccess('') }}
          className="sidebar-action"
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
        <button onClick={logout} className="sidebar-action">
          Sign out
        </button>
      </div>
    </aside>
  )
}
