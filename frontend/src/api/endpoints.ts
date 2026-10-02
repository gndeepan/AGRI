import type { Polygon } from 'geojson'
import { api, qs } from './client'
import type * as T from './types'

export const authApi = {
  me: () => api<T.UserOut>('/auth/me'),
  login: (body: { email: string; password: string }) => api<T.UserOut>('/auth/login', { method: 'POST', body }),
  register: (body: { email: string; password: string; full_name: string; language?: T.Language }) =>
    api<T.UserOut>('/auth/register', { method: 'POST', body }),
  logout: () => api<void>('/auth/logout', { method: 'POST' }),
  verifyEmail: (token: string) => api<T.UserOut>('/auth/verify-email', { method: 'POST', body: { token } }),
  resendVerification: () => api<void>('/auth/resend-verification', { method: 'POST' }),
  requestReset: (email: string) => api<void>('/auth/request-password-reset', { method: 'POST', body: { email } }),
  resetPassword: (token: string, new_password: string) =>
    api<void>('/auth/reset-password', { method: 'POST', body: { token, new_password } }),
}

export const usersApi = {
  update: (body: { full_name?: string; preferences?: Partial<T.UserPreferences> }) =>
    api<T.UserOut>('/users/me', { method: 'PATCH', body }),
  remove: (password: string) => api<void>('/users/me', { method: 'DELETE', body: { password } }),
}

export const geoApi = {
  measure: (boundary: Polygon) => api<T.LandMetrics>('/geo/measure', { method: 'POST', body: { boundary } }),
  search: (q: string, signal?: AbortSignal) => api<T.GeoSearchResult[]>(`/geo/search${qs({ q })}`, { signal }),
  reverse: (lat: number, lon: number) => api<T.ReverseGeo>(`/geo/reverse${qs({ lat, lon })}`),
}

export const landsApi = {
  list: () => api<T.LandSummary[]>('/lands'),
  get: (id: string) => api<T.LandDetail>(`/lands/${id}`),
  create: (body: { name: string; boundary: Polygon; notes?: string | null }) =>
    api<T.LandDetail>('/lands', { method: 'POST', body }),
  update: (id: string, body: { name?: string; boundary?: Polygon; notes?: string | null }) =>
    api<T.LandDetail>(`/lands/${id}`, { method: 'PATCH', body }),
  remove: (id: string) => api<void>(`/lands/${id}`, { method: 'DELETE' }),
  weather: (id: string) => api<T.WeatherBundle>(`/lands/${id}/weather`),
  weatherDaily: (id: string, start: string, end: string) =>
    api<T.WeatherDaily[]>(`/lands/${id}/weather/daily${qs({ start, end })}`),
  soil: (id: string) => api<T.SoilProfile>(`/lands/${id}/soil`),
  addSoilTest: (id: string, body: T.SoilTestInput) =>
    api<T.SoilTest>(`/lands/${id}/soil-tests`, { method: 'POST', body: body as unknown as Record<string, unknown> }),
  removeSoilTest: (id: string, testId: string) => api<void>(`/lands/${id}/soil-tests/${testId}`, { method: 'DELETE' }),
  terrain: (id: string) => api<T.Terrain>(`/lands/${id}/terrain`),
  recommendations: (id: string, params: { sowing_date?: string; irrigation?: T.IrrigationAvailability }) =>
    api<T.Recommendation[]>(`/lands/${id}/recommendations${qs(params)}`),
}

export const cropsApi = {
  list: () => api<T.Crop[]>('/crops'),
  get: (slug: string) => api<T.Crop>(`/crops/${slug}`),
  suggestVariety: (slug: string, body: { name: string; region?: string | null; force_ai?: boolean }) =>
    api<T.VarietySuggestResult>(`/crops/${slug}/varieties/suggest`, { method: 'POST', body }),
  createVariety: (slug: string, body: T.VarietyCreate) =>
    api<T.Variety>(`/crops/${slug}/varieties`, { method: 'POST', body: body as unknown as Record<string, unknown> }),
  deleteVariety: (id: string) => api<void>(`/crops/varieties/${id}`, { method: 'DELETE' }),
}

export const cyclesApi = {
  list: (params: { land_id?: string; status?: T.CycleStatus } = {}) => api<T.CycleDetail[]>(`/cycles${qs(params)}`),
  get: (id: string) => api<T.CycleDetail>(`/cycles/${id}`),
  create: (body: T.CycleCreate) => api<T.CycleDetail>('/cycles', { method: 'POST', body: body as unknown as Record<string, unknown> }),
  update: (id: string, body: Partial<T.CycleCreate> & { status?: T.CycleStatus }) =>
    api<T.CycleDetail>(`/cycles/${id}`, { method: 'PATCH', body: body as Record<string, unknown> }),
  recompute: (id: string) => api<T.CycleDetail>(`/cycles/${id}/recompute`, { method: 'POST' }),
  timeline: (id: string, params: { start?: string; end?: string } = {}) =>
    api<T.TimelineDay[]>(`/cycles/${id}/timeline${qs(params)}`),
  tasks: (id: string) => api<T.TaskOut[]>(`/cycles/${id}/tasks`),
  createTask: (id: string, body: Partial<T.TaskOut>) =>
    api<T.TaskOut>(`/cycles/${id}/tasks`, { method: 'POST', body: body as Record<string, unknown> }),
  updateTask: (taskId: string, body: Partial<T.TaskOut>) =>
    api<T.TaskOut>(`/tasks/${taskId}`, { method: 'PATCH', body: body as Record<string, unknown> }),
  deleteTask: (taskId: string) => api<void>(`/tasks/${taskId}`, { method: 'DELETE' }),
  observations: (id: string) => api<T.Observation[]>(`/cycles/${id}/observations`),
  addObservation: (id: string, body: Omit<T.Observation, 'id' | 'created_at'>) =>
    api<T.Observation>(`/cycles/${id}/observations`, { method: 'POST', body: body as unknown as Record<string, unknown> }),
  irrigation: (id: string) => api<T.IrrigationRecord[]>(`/cycles/${id}/irrigation`),
  addIrrigation: (id: string, body: Omit<T.IrrigationRecord, 'id'>) =>
    api<T.IrrigationRecord>(`/cycles/${id}/irrigation`, { method: 'POST', body: body as unknown as Record<string, unknown> }),
  inputs: (id: string) => api<T.InputApplication[]>(`/cycles/${id}/inputs`),
  addInput: (id: string, body: Omit<T.InputApplication, 'id'>) =>
    api<T.InputApplication>(`/cycles/${id}/inputs`, { method: 'POST', body: body as unknown as Record<string, unknown> }),
  remove: (id: string) => api<void>(`/cycles/${id}`, { method: 'DELETE' }),
  exportUrl: (id: string) => `/api/v1/cycles/${id}/export.pdf`,
}

export const dashboardApi = {
  get: () => api<T.Dashboard>('/dashboard'),
}

export const assistantApi = {
  list: () => api<T.Conversation[]>('/assistant/conversations'),
  create: (body: { land_id?: string | null; cycle_id?: string | null; title?: string }) =>
    api<T.Conversation>('/assistant/conversations', { method: 'POST', body }),
  get: (id: string) => api<T.Conversation>(`/assistant/conversations/${id}`),
  send: (id: string, content: string) =>
    api<{ user_message: T.AssistantMessage; assistant_message: T.AssistantMessage }>(
      `/assistant/conversations/${id}/messages`,
      { method: 'POST', body: { content } },
    ),
  confirm: (message_id: string, action_index: number) =>
    api<{ task: T.TaskOut }>('/assistant/actions/confirm', { method: 'POST', body: { message_id, action_index } }),
}

export const notificationsApi = {
  list: (unread_only = false) => api<T.NotificationOut[]>(`/notifications${qs({ unread_only: unread_only ? 'true' : undefined })}`),
  markRead: (id: string) => api<T.NotificationOut>(`/notifications/${id}/read`, { method: 'POST' }),
}

export const adminApi = {
  providers: () => api<T.ProviderHealth[]>('/admin/providers'),
  stats: () => api<T.AdminStats>('/admin/stats'),
}
