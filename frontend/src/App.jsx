import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Repository from './pages/Repository'
import Verify from './pages/Verify'
import Search from './pages/Search'
import AuditTrail from './pages/AuditTrail'
import Analytics from './pages/Analytics'
import DocumentDetail from './pages/DocumentDetail'
import Login from './pages/Login'
import UserManagement from './pages/UserManagement'
import Explorer from './pages/Explorer'
import ExplorerBlock from './pages/ExplorerBlock'
import Publishing from './pages/Publishing'
import PublicResolutions from './pages/public/PublicResolutions'
import PublicHome from './pages/public/PublicHome'
import PublicResolutionDetail from './pages/public/PublicResolutionDetail'
import PublicAbout from './pages/public/PublicAbout'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
}

// Admin-only pages: non-admins are sent back to their dashboard
function AdminRoute({ children }) {
  const token = localStorage.getItem('token')
  if (!token) return <Navigate to="/login" replace />
  let user = {}
  try { user = JSON.parse(localStorage.getItem('user') || '{}') } catch {}
  return user.role === 'admin' ? children : <Navigate to="/" replace />
}

// Landing page: visitors see the public welcome page, signed-in staff their dashboard
function Home() {
  const token = localStorage.getItem('token')
  return token ? <Layout><Dashboard /></Layout> : <PublicHome />
}

function Layout({ children }) {
  return (
    <div className="app-shell">
      <Sidebar />
      <main className="app-content">
        {children}
      </main>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Toaster
        position="top-right"
        toastOptions={{
          style: { background: 'var(--bg3)', color: 'var(--text)', border: '1px solid var(--border)' },
        }}
      />
      <Routes>
        <Route path="/login" element={<Login />} />
        {/* Public pages: no login */}
        <Route path="/public" element={<PublicHome />} />
        <Route path="/public/resolutions" element={<PublicResolutions />} />
        <Route path="/public/resolutions/:id" element={<PublicResolutionDetail />} />
        {/* Public verification was removed; old links go to the resolutions list */}
        <Route path="/public/verify" element={<Navigate to="/public/resolutions" replace />} />
        <Route path="/public/about" element={<PublicAbout />} />
        <Route path="/resolutions" element={<Navigate to="/public/resolutions" replace />} />
        <Route path="/" element={<Home />} />
        <Route path="/repository" element={<PrivateRoute><Layout><Repository /></Layout></PrivateRoute>} />
        <Route path="/upload" element={<PrivateRoute><Layout><Upload /></Layout></PrivateRoute>} />
        <Route path="/verify" element={<PrivateRoute><Layout><Verify /></Layout></PrivateRoute>} />
        <Route path="/search" element={<PrivateRoute><Layout><Search /></Layout></PrivateRoute>} />
        <Route path="/audit" element={<PrivateRoute><Layout><AuditTrail /></Layout></PrivateRoute>} />
        <Route path="/documents/:id" element={<PrivateRoute><Layout><DocumentDetail /></Layout></PrivateRoute>} />
        <Route path="/analytics" element={<AdminRoute><Layout><Analytics /></Layout></AdminRoute>} />
        <Route path="/explorer" element={<PrivateRoute><Layout><Explorer /></Layout></PrivateRoute>} />
        <Route path="/explorer/:number" element={<PrivateRoute><Layout><ExplorerBlock /></Layout></PrivateRoute>} />
        <Route path="/publishing" element={<PrivateRoute><Layout><Publishing /></Layout></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/users" element={<PrivateRoute><Layout><UserManagement /></Layout></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
