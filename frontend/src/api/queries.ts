import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { adminApi, assistantApi, cropsApi, cyclesApi, dashboardApi, landsApi } from './endpoints'
import type * as T from './types'

export const qk = {
  me: ['me'] as const,
  dashboard: ['dashboard'] as const,
  lands: ['lands'] as const,
  land: (id: string) => ['lands', id] as const,
  weather: (id: string) => ['lands', id, 'weather'] as const,
  soil: (id: string) => ['lands', id, 'soil'] as const,
  terrain: (id: string) => ['lands', id, 'terrain'] as const,
  recs: (id: string, p: object) => ['lands', id, 'recs', p] as const,
  crops: ['crops'] as const,
  cycles: (p: object = {}) => ['cycles', p] as const,
  cycle: (id: string) => ['cycle', id] as const,
  timeline: (id: string) => ['cycle', id, 'timeline'] as const,
  tasks: (id: string) => ['cycle', id, 'tasks'] as const,
  observations: (id: string) => ['cycle', id, 'observations'] as const,
  irrigation: (id: string) => ['cycle', id, 'irrigation'] as const,
  inputs: (id: string) => ['cycle', id, 'inputs'] as const,
  conversations: ['conversations'] as const,
  conversation: (id: string) => ['conversations', id] as const,
  providers: ['admin', 'providers'] as const,
  adminStats: ['admin', 'stats'] as const,
}

export const useDashboard = () => useQuery({ queryKey: qk.dashboard, queryFn: dashboardApi.get })
export const useLands = () => useQuery({ queryKey: qk.lands, queryFn: landsApi.list })
export const useLand = (id?: string) =>
  useQuery({ queryKey: qk.land(id ?? ''), queryFn: () => landsApi.get(id!), enabled: !!id })
export const useWeather = (id?: string) =>
  useQuery({
    queryKey: qk.weather(id ?? ''),
    queryFn: () => landsApi.weather(id!),
    enabled: !!id,
    staleTime: 10 * 60_000,
  })
export const useSoil = (id?: string) =>
  useQuery({ queryKey: qk.soil(id ?? ''), queryFn: () => landsApi.soil(id!), enabled: !!id, staleTime: 60 * 60_000 })
export const useTerrain = (id?: string) =>
  useQuery({ queryKey: qk.terrain(id ?? ''), queryFn: () => landsApi.terrain(id!), enabled: !!id, staleTime: 60 * 60_000 })
export const useRecommendations = (
  id: string | undefined,
  params: { sowing_date?: string; irrigation?: T.IrrigationAvailability },
) =>
  useQuery({
    queryKey: qk.recs(id ?? '', params),
    queryFn: () => landsApi.recommendations(id!, params),
    enabled: !!id,
  })
export const useCrops = () => useQuery({ queryKey: qk.crops, queryFn: cropsApi.list, staleTime: 60 * 60_000 })
export const useCycles = (p: { land_id?: string; status?: T.CycleStatus } = {}) =>
  useQuery({ queryKey: qk.cycles(p), queryFn: () => cyclesApi.list(p) })
export const useCycle = (id?: string) =>
  useQuery({ queryKey: qk.cycle(id ?? ''), queryFn: () => cyclesApi.get(id!), enabled: !!id })
export const useTimeline = (id?: string) =>
  useQuery({ queryKey: qk.timeline(id ?? ''), queryFn: () => cyclesApi.timeline(id!), enabled: !!id, staleTime: 15 * 60_000 })
export const useTasks = (id?: string) =>
  useQuery({ queryKey: qk.tasks(id ?? ''), queryFn: () => cyclesApi.tasks(id!), enabled: !!id })
export const useObservations = (id?: string) =>
  useQuery({ queryKey: qk.observations(id ?? ''), queryFn: () => cyclesApi.observations(id!), enabled: !!id })
export const useIrrigation = (id?: string) =>
  useQuery({ queryKey: qk.irrigation(id ?? ''), queryFn: () => cyclesApi.irrigation(id!), enabled: !!id })
export const useInputs = (id?: string) =>
  useQuery({ queryKey: qk.inputs(id ?? ''), queryFn: () => cyclesApi.inputs(id!), enabled: !!id })
export const useConversations = () => useQuery({ queryKey: qk.conversations, queryFn: assistantApi.list })
export const useConversation = (id?: string) =>
  useQuery({ queryKey: qk.conversation(id ?? ''), queryFn: () => assistantApi.get(id!), enabled: !!id })
export const useProviders = () =>
  useQuery({ queryKey: qk.providers, queryFn: adminApi.providers, refetchInterval: 30_000 })
export const useAdminStats = () => useQuery({ queryKey: qk.adminStats, queryFn: adminApi.stats })

export function useUpdateTask(cycleId: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: Partial<T.TaskOut> & { id: string }) => cyclesApi.updateTask(id, body),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.tasks(cycleId) })
      qc.invalidateQueries({ queryKey: qk.timeline(cycleId) })
      qc.invalidateQueries({ queryKey: qk.dashboard })
    },
  })
}
