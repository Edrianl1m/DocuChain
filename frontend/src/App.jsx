import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { Toaster } from 'react-hot-toast'
import Sidebar from './components/layout/Sidebar'
import Dashboard from './pages/Dashboard'
import Upload from './pages/Upload'
import Verify from './pages/Verify'
import Search from './pages/Search'
import AuditTrail from './pages/AuditTrail'
import Login from './pages/Login'
import UserManagement from './pages/UserManagement'

function PrivateRoute({ children }) {
  const token = localStorage.getItem('token')
  return token ? children : <Navigate to="/login" replace />
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
        <Route path="/" element={<PrivateRoute><Layout><Dashboard /></Layout></PrivateRoute>} />
        <Route path="/upload" element={<PrivateRoute><Layout><Upload /></Layout></PrivateRoute>} />
        <Route path="/verify" element={<PrivateRoute><Layout><Verify /></Layout></PrivateRoute>} />
        <Route path="/search" element={<PrivateRoute><Layout><Search /></Layout></PrivateRoute>} />
        <Route path="/audit" element={<PrivateRoute><Layout><AuditTrail /></Layout></PrivateRoute>} />
        <Route path="*" element={<Navigate to="/" replace />} />
        <Route path="/users" element={<PrivateRoute><Layout><UserManagement /></Layout></PrivateRoute>} />
      </Routes>
    </BrowserRouter>
  )
}
