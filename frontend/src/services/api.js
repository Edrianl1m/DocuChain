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
    if (err.response?.status === 401) {
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
export const getDocumentHistory = id => api.get(`/documents/${id}/history`)
export const deleteDocument = id => api.delete(`/documents/${id}`)
export const downloadDocument = id => api.get(`/documents/${id}/download`, { responseType: 'blob' })
export const searchDocuments = (q, params = {}) => api.get('/search', { params: { q, ...params } })
export const getTamperedDocuments = () => api.get('/audit/tampered')
export const healthCheck = () => api.get('/health')
export const changeMyPassword = (currentPassword, newPassword) =>
  api.patch('/users/me/password', { currentPassword, newPassword })

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