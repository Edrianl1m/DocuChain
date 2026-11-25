import { useEffect, useRef, useState } from 'react'

const PDFJS_VERSION = '3.11.174'
const PDFJS_URL = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.min.js`
const PDFJS_WORKER = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${PDFJS_VERSION}/pdf.worker.min.js`

let pdfjsPromise = null

// Load PDF.js once from the CDN and reuse it for every preview
function loadPdfJs() {
  if (window.pdfjsLib) return Promise.resolve(window.pdfjsLib)
  if (!pdfjsPromise) {
    pdfjsPromise = new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = PDFJS_URL
      script.onload = () => {
        window.pdfjsLib.GlobalWorkerOptions.workerSrc = PDFJS_WORKER
        resolve(window.pdfjsLib)
      }
      script.onerror = () => { pdfjsPromise = null; reject(new Error('PDF.js failed to load')) }
      document.head.appendChild(script)
    })
  }
  return pdfjsPromise
}

function Placeholder({ label }) {
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', color: 'var(--text3)', gap: '6px' }}>
      <div style={{ fontSize: '30px', opacity: 0.5 }}>📄</div>
      <div style={{ fontSize: '11px', fontFamily: 'IBM Plex Mono, monospace', textTransform: 'uppercase' }}>{label}</div>
    </div>
  )
}

// First-page thumbnail of a PDF; other file types show their extension
export default function PdfPreview({ url, fileType, width = 180 }) {
  const canvasRef = useRef()
  const [state, setState] = useState(fileType === 'pdf' ? 'loading' : 'none')

  useEffect(() => {
    if (fileType !== 'pdf') return
    let cancelled = false
    async function render() {
      try {
        const pdfjsLib = await loadPdfJs()
        const pdf = await pdfjsLib.getDocument(url).promise
        const page = await pdf.getPage(1)
        if (cancelled || !canvasRef.current) return
        const base = page.getViewport({ scale: 1 })
        const viewport = page.getViewport({ scale: (width * 2) / base.width })
        const canvas = canvasRef.current
        canvas.width = viewport.width
        canvas.height = viewport.height
        await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise
        if (!cancelled) setState('ready')
      } catch {
        if (!cancelled) setState('error')
      }
    }
    render()
    return () => { cancelled = true }
  }, [url, fileType, width])

  return (
    <div style={{
      width: `${width}px`, height: `${Math.round(width * 1.3)}px`, flexShrink: 0,
      background: 'var(--bg3)', border: '1px solid var(--border)', borderRadius: 'var(--radius)',
      overflow: 'hidden', position: 'relative',
    }}>
      {fileType === 'pdf' && (
        <canvas ref={canvasRef} style={{ width: '100%', display: state === 'ready' ? 'block' : 'none' }} />
      )}
      {state === 'loading' && <Placeholder label="Loading preview" />}
      {state === 'error' && <Placeholder label="PDF" />}
      {state === 'none' && <Placeholder label={fileType || 'file'} />}
    </div>
  )
}
