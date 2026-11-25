import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

api.interceptors.response.use(
  res => res,
  err => {
    // A wrong password on the login form also returns 401: let the form show the error instead of reloading
    const isLoginCall = err.config?.url === '/auth/login'
    if (err.response?.status === 401 && !isLoginCall) {
      localStorage.removeItem('token')
      localStorage.removeItem('user')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export const login = (username, password) => api.post('/auth/login', { username, password })
export const getDocuments = () => api.get('/documents')
export const getDocument = id => api.get(`/documents/${id}`)
export const uploadDocument = formData => api.post('/documents/upload', formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const verifyDocument = (id, formData) => api.post(`/documents/${id}/verify`, formData || new FormData())
// Upload only: the server finds which registered document (and version) the file is
export const verifyByFile = formData => api.post('/documents/verify', formData)
export const getDocumentHistory = id => api.get(`/documents/${id}/history`)
export const deleteDocument = id => api.delete(`/documents/${id}`)
// Every download/view is integrity-checked by the server; a tampered file is
// refused with 409 (admins can pass override to fetch it for investigation)
export const downloadDocument = (id, { inline = false, override = false } = {}) =>
  api.get(`/documents/${id}/download`, { responseType: 'blob', params: { ...(inline ? { inline: 1 } : {}), ...(override ? { override: 1 } : {}) } })
export const searchDocuments = (q, params = {}) => api.get('/search', { params: { q, ...params } })
export const getTamperedDocuments = () => api.get('/audit/tampered')
export const healthCheck = () => api.get('/health')

// Integrity checks (audit trail)
export const getIntegritySummary = () => api.get('/integrity/summary')
export const getIntegrityLogs = (params = {}) => api.get('/integrity/logs', { params })
export const runIntegrityScan = () => api.post('/integrity/scan')
export const anchorMetadata = () => api.post('/integrity/anchor-metadata')

// Error bodies of blob requests arrive as a Blob; turn them back into JSON
export async function readBlobError(err) {
  const data = err.response?.data
  if (data instanceof Blob) {
    try { return JSON.parse(await data.text()) } catch { return {} }
  }
  return data || {}
}

export const TAMPER_REASON_LABELS = {
  file: 'file changed',
  file_missing: 'file missing',
  metadata: 'database details changed',
  metadata_missing: 'details row deleted',
}
export const changeMyPassword = (currentPassword, newPassword) =>
  api.patch('/users/me/password', { currentPassword, newPassword })

// Blockchain Explorer
export const getExplorerBlocks = (page = 1, limit = 20) => api.get('/explorer/blocks', { params: { page, limit } })
export const getExplorerBlock = number => api.get(`/explorer/blocks/${number}`)
export const validateChain = () => api.get('/explorer/validate')

// Public page (staff side)
export const getPublications = () => api.get('/publications')
export const savePublication = (id, data) => api.put(`/publications/${id}`, data)
export const getPublicAccessLog = () => api.get('/publications/access-log')

// Public page (no login)
export const getPublicResolutions = params => api.get('/public/resolutions', { params })
export const getPublicResolution = id => api.get(`/public/resolutions/${encodeURIComponent(id)}`)
export const verifyPublicDocument = formData => api.post('/public/verify', formData)
export const publicFileUrl = (id, mode = 'view') => `/api/public/resolutions/${id}/file?mode=${mode}`

// Helper: trigger file download in browser
export function triggerDownload(blob, filename) {
  const url = window.URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  window.URL.revokeObjectURL(url)
  document.body.removeChild(a)
}

export default api

// Audit-trail analytics: download / view / verification counts
export const getAnalytics = (days = 30) => api.get('/analytics/summary', { params: { days } })
export const getBotActivity = (days = 30) => api.get('/analytics/bot-activity', { params: { days } })

// Document versions
export const getDocumentVersions = id => api.get(`/documents/${id}/versions`)
export const uploadDocumentVersion = (id, formData) => api.post(`/documents/${id}/versions`, formData, { headers: { 'Content-Type': 'multipart/form-data' } })
export const downloadDocumentVersion = (id, version, { inline = false, override = false } = {}) =>
  api.get(`/documents/${id}/versions/${version}/download`, { responseType: 'blob', params: { ...(inline ? { inline: 1 } : {}), ...(override ? { override: 1 } : {}) } })

// ─── Records repository (year + quarter filing) ─────────────────
export const getRecords = () => api.get('/records')
export const updateFiling = (id, data) => api.put(`/records/${id}/filing`, data)
// Quarters are labelled "Quarter 1" ... "Quarter 4" (no month ranges)
export const quarterName = q => (q ? `Quarter ${q}` : '')
export const quarterOfDate = value => {
  const m = /^\d{4}-(\d{2})/.exec(value || '')
  return m ? Math.ceil(Number(m[1]) / 3) : null
}
export const filingLabel = (year, quarter) =>
  year && quarter ? `${year} · Quarter ${quarter}` : '—'
