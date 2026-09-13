import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../services/api'
import { PageHeader, Alert, Spinner, EmptyState } from '../components/ui/Components'

export default function UserManagement() {
  const [users, setUsers] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ username: '', password: '', role: 'user' })
  const [submitting, setSubmitting] = useState(false)
  const [resetPw, setResetPw] = useState({ id: null, password: '' })

  const currentUser = JSON.parse(localStorage.getItem('user') || '{}')
  const navigate = useNavigate()

  // Redirect non-admins
  useEffect(() => {
    if (currentUser.role !== 'admin') navigate('/')
  }, [])

  useEffect(() => {
    loadUsers()
  }, [])

  async function loadUsers() {
    try {
      const res = await api.get('/users')
      setUsers(res.data.users)
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load users.')
    } finally {
      setLoading(false)
    }
  }

  async function handleCreate(e) {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await api.post('/users', form)
      setSuccess(`User "${form.username}" created successfully.`)
      setForm({ username: '', password: '', role: 'user' })
      setShowForm(false)
      loadUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to create user.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleToggle(user) {
    setError('')
    try {
      const res = await api.patch(`/users/${user.id}/toggle`)
      setSuccess(`User "${user.username}" ${res.data.isActive ? 'activated' : 'deactivated'}.`)
      loadUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update user.')
    }
  }

  async function handleResetPassword(userId) {
    if (!resetPw.password || resetPw.password.length < 6) {
      setError('Password must be at least 6 characters.')
      return
    }
    setError('')
    try {
      await api.patch(`/users/${userId}/password`, { password: resetPw.password })
      setSuccess('Password updated successfully.')
      setResetPw({ id: null, password: '' })
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update password.')
    }
  }

  async function handleDelete(user) {
    if (!window.confirm(`Delete user "${user.username}"? This cannot be undone.`)) return
    setError('')
    try {
      await api.delete(`/users/${user.id}`)
      setSuccess(`User "${user.username}" deleted.`)
      loadUsers()
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to delete user.')
    }
  }

  if (loading) return <Spinner />

  return (
    <div className="animate-in">
      <PageHeader
        title="User Management"
        sub="Manage system users and access control"
        action={
          <button className="btn-primary" onClick={() => { setShowForm(!showForm); setError(''); setSuccess('') }}>
            {showForm ? 'Cancel' : '+ Add User'}
          </button>
        }
      />

      {error && <Alert type="error">{error}</Alert>}
      {success && <Alert type="success">{success}</Alert>}

      {/* Create user form */}
      {showForm && (
        <div className="card animate-in" style={{ marginBottom: '1.5rem' }}>
          <h2 style={{ fontSize: '14px', fontWeight: '500', marginBottom: '1.25rem', color: 'var(--text2)', fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase' }}>New User</h2>
          <form onSubmit={handleCreate}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '1rem', marginBottom: '1rem' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>USERNAME</label>
                <input
                  placeholder="e.g. jdoe"
                  value={form.username}
                  onChange={e => setForm(f => ({ ...f, username: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>PASSWORD</label>
                <input
                  type="password"
                  placeholder="Min 6 characters"
                  value={form.password}
                  onChange={e => setForm(f => ({ ...f, password: e.target.value }))}
                  required
                />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', marginBottom: '6px' }}>ROLE</label>
                <select value={form.role} onChange={e => setForm(f => ({ ...f, role: e.target.value }))}>
                  <option value="user">User</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>
            <button type="submit" className="btn-primary" disabled={submitting}>
              {submitting ? 'Creating...' : 'Create User'}
            </button>
          </form>
        </div>
      )}

      {/* Users table */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {users.length === 0 ? (
          <EmptyState icon="👤" message="No users found" />
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--border)' }}>
                {['Username', 'Role', 'Created', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ textAlign: 'left', padding: '12px 16px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace', fontWeight: '400' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map(user => (
                <tr key={user.id}
                  style={{ borderBottom: '1px solid var(--border)', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'var(--bg3)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  {/* Username */}
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      <div style={{
                        width: '30px', height: '30px', borderRadius: '50%',
                        background: user.role === 'admin' ? 'var(--accent2)' : 'var(--bg4)',
                        border: '1px solid var(--border2)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        fontSize: '12px', fontWeight: '600', color: 'var(--accent)',
                        flexShrink: 0,
                      }}>
                        {user.username[0].toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontWeight: '500', fontSize: '13px', color: 'var(--text)' }}>
                          {user.username}
                          {user.username === currentUser.username && (
                            <span style={{ fontSize: '10px', color: 'var(--text3)', marginLeft: '6px' }}>(you)</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </td>

                  {/* Role */}
                  <td style={{ padding: '12px 16px' }}>
                    {user.role === 'admin'
                      ? <span className="badge badge-blue">Admin</span>
                      : <span className="badge badge-purple">User</span>
                    }
                  </td>

                  {/* Created */}
                  <td style={{ padding: '12px 16px', fontSize: '11px', color: 'var(--text3)', fontFamily: 'IBM Plex Mono, monospace' }}>
                    {user.createdAt?.slice(0, 10)}
                  </td>

                  {/* Status */}
                  <td style={{ padding: '12px 16px' }}>
                    {user.isActive
                      ? <span className="badge badge-green">● Active</span>
                      : <span className="badge badge-red">● Inactive</span>
                    }
                  </td>

                  {/* Actions */}
                  <td style={{ padding: '12px 16px' }}>
                    <div style={{ display: 'flex', gap: '6px', alignItems: 'center', flexWrap: 'wrap' }}>

                      {/* Toggle active */}
                      {user.username !== currentUser.username && (
                        <button
                          onClick={() => handleToggle(user)}
                          style={{
                            background: user.isActive ? 'var(--yellow-bg)' : 'var(--green-bg)',
                            border: `1px solid ${user.isActive ? 'var(--status-warning-border)' : 'var(--status-verified-border)'}`,
                            color: user.isActive ? 'var(--yellow)' : 'var(--green)',
                            borderRadius: '4px', padding: '4px 10px',
                            fontSize: '11px', cursor: 'pointer',
                          }}
                        >
                          {user.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                      )}

                      {/* Reset password */}
                      {resetPw.id === user.id ? (
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <input
                            type="password"
                            placeholder="New password"
                            value={resetPw.password}
                            onChange={e => setResetPw(r => ({ ...r, password: e.target.value }))}
                            style={{ width: '130px', padding: '4px 8px', fontSize: '12px' }}
                          />
                          <button
                            onClick={() => handleResetPassword(user.id)}
                            className="btn-primary"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                          >Save</button>
                          <button
                            onClick={() => setResetPw({ id: null, password: '' })}
                            className="btn-ghost"
                            style={{ padding: '4px 10px', fontSize: '11px' }}
                          >✕</button>
                        </div>
                      ) : (
                        <button
                          onClick={() => setResetPw({ id: user.id, password: '' })}
                          className="btn-ghost"
                          style={{ padding: '4px 10px', fontSize: '11px' }}
                        >
                          Reset PW
                        </button>
                      )}

                      {/* Delete */}
                      {user.username !== currentUser.username && (
                        <button
                          onClick={() => handleDelete(user)}
                          style={{
                            background: 'var(--red-bg)', border: '1px solid var(--status-tampered-border)',
                            color: 'var(--red)', borderRadius: '4px',
                            padding: '4px 10px', fontSize: '11px', cursor: 'pointer',
                          }}
                        >Delete</button>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
