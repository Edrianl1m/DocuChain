import { Link } from 'react-router-dom'
import { BookOpen, Eye, Download, Lock, Fingerprint, Blocks } from 'lucide-react'
import PublicLayout from '../../components/public/PublicLayout'

function Item({ icon: Icon, title, children }) {
  return (
    <div className="public-about-item">
      <span className="public-feature-icon is-small"><Icon size={18} strokeWidth={1.8} /></span>
      <div>
        <div className="public-about-item-title">{title}</div>
        <p>{children}</p>
      </div>
    </div>
  )
}

export default function PublicAbout() {
  return (
    <PublicLayout>
      <section style={{ marginBottom: '1.5rem' }}>
        <div className="public-eyebrow is-dark">About</div>
        <h1 className="public-page-title">What is DocuChain?</h1>
        <p className="public-page-lead">
          DocuChain is the document system of the Board of Trustees Records Office. Staff use it to organise and safeguard official records.
          This public site shows the resolutions the Board has released, with the blockchain record of each file.
          Each file's digital fingerprint (a SHA-256 hash) is recorded on a Hyperledger Fabric blockchain, a shared ledger whose entries cannot be quietly edited or deleted.
        </p>
      </section>

      <section className="public-section">
        <h2 className="public-section-title">What you will see here</h2>
        <div className="card public-about-grid">
          <Item icon={BookOpen} title="Resolutions page">
            A list of every published resolution, newest first. Search by title, resolution number or keyword, filter by year, quarter or office, and switch between cards with a preview and a compact list.
          </Item>
          <Item icon={Eye} title="Resolution details">
            The resolution number, the date it was approved, its office, a short summary and a preview of the first page.
          </Item>
          <Item icon={Blocks} title="Blockchain record">
            The file's SHA-256 fingerprint, the block it is stored in and the transaction ID. This is the proof the document has not changed since it was published.
          </Item>
          <Item icon={Download} title="View and download">
            Open the official file in your browser or save it. Before any file is served it is re-checked against the blockchain, so you always get the genuine version.
          </Item>
          <Item icon={Lock} title="What you will not see">
            Confidential records, such as personnel and promotion matters, internal drafts and staff-only files are never published here.
          </Item>
        </div>
      </section>


      <section className="public-section">
        <h2 className="public-section-title">How the fingerprint works</h2>
        <div className="card">
          <p className="public-muted" style={{ marginBottom: '0.75rem' }}>
            <Fingerprint size={16} style={{ verticalAlign: '-3px', color: 'var(--brand-primary)' }} /> A SHA-256 hash is a 64-character code calculated from every byte of a file.
            The same file always gives the same code, and changing even a single character, such as one digit of a budget amount, gives a completely different one.
            Because the original code is stored on the blockchain, nobody can change a resolution and its record without it being noticed.
          </p>
          <div className="public-browse-label">Example</div>
          <div className="public-hash-demo">
            <div><span>Official file</span><code>9f2c…e41a</code></div>
            <div><span>Same file, another copy</span><code>9f2c…e41a</code><b style={{ color: 'var(--green)' }}>match</b></div>
            <div><span>One number changed</span><code>47d0…b8c3</code><b style={{ color: 'var(--red)' }}>different</b></div>
          </div>
        </div>
      </section>

      <div className="public-hero-actions" style={{ marginTop: '1.5rem' }}>
        <Link to="/public/resolutions"><button className="btn-primary public-btn"><BookOpen size={15} /> Browse resolutions</button></Link>
      </div>
    </PublicLayout>
  )
}
