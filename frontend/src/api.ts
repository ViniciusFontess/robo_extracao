import axios from 'axios'

const http = axios.create({ baseURL: '' })

http.interceptors.request.use(config => {
  const token = localStorage.getItem('token')
  if (token) config.headers.Authorization = `Bearer ${token}`
  return config
})

http.interceptors.response.use(
  r => r,
  err => {
    if (err.response?.status === 401) {
      localStorage.removeItem('token')
      window.location.href = '/login'
    }
    return Promise.reject(err)
  }
)

export interface Extraction {
  id: string
  type: string
  city: string
  state: string
  status: string
  total_found: number
  error_msg: string | null
  created_at: string
  finished_at: string | null
}

export interface Place {
  id: string
  name: string | null
  address: string | null
  phone: string | null
  website: string | null
  rating: number | null
  rating_count: number | null
  category: string | null
  opening_hours: string | null
  maps_url: string | null
}

export interface PlacesPage {
  items: Place[]
  total: number
  page: number
  page_size: number
}

export const api = {
  login: (username: string, password: string) =>
    http.post<{ access_token: string }>('/auth/login', { username, password }),

  createExtraction: (type: string, city: string, state: string) =>
    http.post<Extraction>('/api/extractions', { type, city, state }),

  listExtractions: () =>
    http.get<Extraction[]>('/api/extractions'),

  getExtraction: (id: string) =>
    http.get<Extraction>(`/api/extractions/${id}`),

  getPlaces: (id: string, page = 1, pageSize = 50) =>
    http.get<PlacesPage>(`/api/extractions/${id}/places`, {
      params: { page, page_size: pageSize },
    }),

  exportUrl: (id: string) => `/api/extractions/${id}/export`,
}
