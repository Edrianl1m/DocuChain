import { useEffect } from 'react'
import { Link, useLocation } from 'react-router-dom'

// Where the public home page lives: visitors land on "/", signed-in staff
// (whose "/" is the dashboard) reach it at "/public"
export function publicHome() {
  return localStorage.getItem('token') ? '/public' : '/'
}

// Top bar for the public pages (no login, no sidebar)
export default function PublicLayout({ children, hero = null, wide = false }) {
  const { pathname } = useLocation()
  const signedIn = !!localStorage.getItem('token')
  const home = publicHome()

  // Each public page starts at the top, like a normal website
  useEffect(() => { window.scrollTo(0, 0) }, [pathname])

  const isHome = pathname === '/' || pathname === '/public'
  const link = (to, label, active) => (
    <Link to={to} className={`public-nav-link${active ? ' is-active' : ''}`}>{label}</Link>
  )

  return (
    <div className="public-shell">
      <header className="public-topbar">
        <Link to={home} className="public-brand">
          <span className="sidebar-brand-mark" style={{ width: '32px', height: '32px' }}>
            <img src="/logo-mark.png" alt="DocuChain logo" style={{ width: '26px', height: '26px', objectFit: 'contain' }} />
          </span>
          <span>
            <span className="public-brand-name">DocuChain</span>
            <span className="public-brand-sub"> · Public Resolutions</span>
          </span>
        </Link>
        <nav className="public-nav">
          {link(home, 'Home', isHome)}
          {link('/public/resolutions', 'Resolutions', pathname.startsWith('/public/resolutions'))}
          {link('/public/about', 'About', pathname === '/public/about')}
          {signedIn
            ? <Link to="/" className="public-login">Dashboard</Link>
            : <Link to="/login" className="public-login">Staff login</Link>}
        </nav>
      </header>
      {hero}
      <main className={`public-content${wide ? ' public-content-wide' : ''}`}>{children}</main>
      <footer className="public-footer">
        <div className="public-footer-links">
          <Link to={home}>Home</Link>
          <Link to="/public/resolutions">Resolutions</Link>
          <Link to="/public/about">About</Link>
        </div>
        DocuChain · DNSC Board of Trustees Records Office · Documents are secured by SHA-256 hashes on Hyperledger Fabric
      </footer>
    </div>
  )
}
