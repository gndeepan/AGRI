import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router'
import { useTranslation } from 'react-i18next'
import { useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { motion } from 'motion/react'
import { Bot, CheckCircle2, ExternalLink, Loader2, MessageSquarePlus, Send, ShieldAlert, User } from 'lucide-react'
import { assistantApi } from '@/api/endpoints'
import { ApiError } from '@/api/client'
import { qk, useConversation, useConversations, useCycles, useLands } from '@/api/queries'
import type { AssistantMessage, Conversation } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { NativeSelect, Textarea } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Skeleton } from '@/components/ui/skeleton'
import { ErrorState } from '@/components/common/States'
import { formatDate, i18nText } from '@/lib/format'
import { cn } from '@/lib/utils'

const EXAMPLES = ['thisWeek', 'rainIrrigation', 'nextStage', 'missingInfo', 'symptoms'] as const

export default function Assistant() {
  const { conversationId } = useParams()
  const { t, i18n } = useTranslation()
  const navigate = useNavigate()
  const qc = useQueryClient()
  const [params] = useSearchParams()
  const convs = useConversations()
  const conv = useConversation(conversationId)
  const lands = useLands()
  const cycles = useCycles()
  const [landId, setLandId] = useState('')
  const [cycleId, setCycleId] = useState(params.get('cycle') ?? '')
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [pending, setPending] = useState<string | null>(null)
  const endRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [conv.data?.messages?.length, pending])

  // Picking a plan implies its field.
  useEffect(() => {
    const c = cycles.data?.find((x) => x.id === cycleId)
    if (c) setLandId(c.land_id)
  }, [cycleId, cycles.data])

  async function ensureConversation(firstMessage: string): Promise<Conversation> {
    if (conversationId && conv.data) return conv.data
    const created = await assistantApi.create({ land_id: landId || null, cycle_id: cycleId || null, title: firstMessage.slice(0, 80) })
    qc.invalidateQueries({ queryKey: qk.conversations })
    navigate(`/app/assistant/${created.id}`, { replace: true })
    return created
  }

  async function send(text: string) {
    const content = text.trim()
    if (!content || sending) return
    setSending(true)
    setPending(content)
    setDraft('')
    try {
      const c = await ensureConversation(content)
      await assistantApi.send(c.id, content)
      await qc.invalidateQueries({ queryKey: qk.conversation(c.id) })
    } catch (e) {
      setDraft(content)
      toast.error(e instanceof ApiError && e.code === 'assistant_unavailable' ? t('errors.assistantUnavailable') : e instanceof ApiError && e.status === 429 ? t('errors.rateLimited') : t('errors.generic'))
    } finally {
      setSending(false)
      setPending(null)
    }
  }

  const messages = conv.data?.messages ?? []
  const contextCycle = cycles.data?.find((c) => c.id === (conv.data?.cycle_id ?? cycleId))
  const contextLand = lands.data?.find((l) => l.id === (conv.data?.land_id ?? landId))

  return (
    <div className="grid gap-5 lg:h-[calc(100dvh-5rem)] lg:grid-cols-[260px_1fr]">
      <aside className="hidden flex-col gap-3 overflow-y-auto lg:flex">
        <Button onClick={() => navigate('/app/assistant')} variant="outline"><MessageSquarePlus /> {t('assistant.new')}</Button>
        {convs.isPending ? (
          [0, 1, 2].map((i) => <Skeleton key={i} className="h-12" />)
        ) : convs.isError ? (
          <ErrorState error={convs.error} onRetry={() => convs.refetch()} />
        ) : (
          <ul className="space-y-1">
            {convs.data.map((c) => (
              <li key={c.id}>
                <Link to={`/app/assistant/${c.id}`} className={cn('block rounded-xl px-3 py-2 text-sm hover:bg-muted', c.id === conversationId && 'bg-muted font-semibold')}>
                  <span className="line-clamp-1">{c.title || t('assistant.untitled')}</span>
                  <span className="text-[11px] text-muted-foreground">{formatDate(c.updated_at ?? c.created_at, 'd MMM, HH:mm', i18n.language)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="flex min-h-[70dvh] flex-col overflow-hidden rounded-2xl border border-border bg-card">
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex size-9 items-center justify-center rounded-full bg-paddy-800 text-sun-300"><Bot className="size-5" /></div>
            <div>
              <h1 className="font-display text-lg font-semibold leading-tight">{t('assistant.title')}</h1>
              <p className="text-[11px] text-muted-foreground">
                {contextCycle ? `${i18nText(contextCycle.crop.name, i18n.language)} · ${contextCycle.land_name}` : contextLand ? contextLand.name : t('assistant.noContext')}
              </p>
            </div>
          </div>
          <Button size="sm" variant="ghost" className="lg:hidden" onClick={() => navigate('/app/assistant')}><MessageSquarePlus /> {t('assistant.new')}</Button>
        </header>

        <div className="flex-1 space-y-4 overflow-y-auto p-4">
          {!conversationId && (
            <div className="mx-auto max-w-xl space-y-5 py-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="ctx-cycle">{t('assistant.plan')}</Label>
                  <NativeSelect id="ctx-cycle" value={cycleId} onChange={(e) => setCycleId(e.target.value)}>
                    <option value="">{t('assistant.none')}</option>
                    {cycles.data?.map((c) => <option key={c.id} value={c.id}>{i18nText(c.crop.name, i18n.language)} · {c.land_name}</option>)}
                  </NativeSelect>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="ctx-land">{t('assistant.field')}</Label>
                  <NativeSelect id="ctx-land" value={landId} onChange={(e) => setLandId(e.target.value)} disabled={!!cycleId}>
                    <option value="">{t('assistant.none')}</option>
                    {lands.data?.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}
                  </NativeSelect>
                </div>
              </div>
              <div className="space-y-2">
                <p className="text-sm font-medium">{t('assistant.tryAsking')}</p>
                <div className="flex flex-wrap gap-2">
                  {EXAMPLES.map((k) => (
                    <button key={k} type="button" onClick={() => send(t(`assistant.examples.${k}`))} className="rounded-full border border-border bg-background px-3 py-1.5 text-left text-sm hover:border-paddy-400 hover:bg-muted">
                      {t(`assistant.examples.${k}`)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {conversationId && conv.isPending && <Skeleton className="h-24" />}
          {conversationId && conv.isError && <ErrorState error={conv.error} onRetry={() => conv.refetch()} />}
          {messages.map((m) => <MessageBubble key={m.id} m={m} canAct={!!(conv.data?.cycle_id)} conversationId={conversationId!} />)}
          {pending && (
            <>
              <MessageBubble m={{ id: 'pending', role: 'user', content: pending }} canAct={false} conversationId="" />
              <div className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" /> {t('assistant.thinking')}</div>
            </>
          )}
          <div ref={endRef} />
        </div>

        <form onSubmit={(e) => { e.preventDefault(); void send(draft) }} className="border-t border-border p-3">
          <div className="flex items-end gap-2">
            <Textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send(draft)
                }
              }}
              placeholder={t('assistant.placeholder')}
              aria-label={t('assistant.placeholder')}
              rows={1}
              className="max-h-40 min-h-11 resize-none"
              maxLength={4000}
            />
            <Button type="submit" size="icon" disabled={sending || !draft.trim()} aria-label={t('assistant.send')}>
              {sending ? <Loader2 className="animate-spin" /> : <Send />}
            </Button>
          </div>
          <p className="mt-2 flex items-start gap-1.5 text-[11px] text-muted-foreground"><ShieldAlert className="mt-px size-3.5 shrink-0" /> {t('assistant.disclaimer')}</p>
        </form>
      </section>
    </div>
  )
}

function MessageBubble({ m, canAct, conversationId }: { m: AssistantMessage; canAct: boolean; conversationId: string }) {
  const { t } = useTranslation()
  const qc = useQueryClient()
  const [busy, setBusy] = useState<number | null>(null)
  const isUser = m.role === 'user'

  async function confirm(i: number) {
    setBusy(i)
    try {
      const res = await assistantApi.confirm(m.id, i)
      qc.invalidateQueries({ queryKey: qk.conversation(conversationId) })
      qc.invalidateQueries({ queryKey: qk.tasks(res.task.cycle_id) })
      qc.invalidateQueries({ queryKey: qk.timeline(res.task.cycle_id) })
      toast.success(t('assistant.taskAdded'))
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : t('errors.generic'))
    } finally {
      setBusy(null)
    }
  }

  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className={cn('flex gap-2.5', isUser && 'flex-row-reverse')}>
      <div className={cn('flex size-8 shrink-0 items-center justify-center rounded-full', isUser ? 'bg-soil-200 text-soil-800' : 'bg-paddy-800 text-sun-300')}>
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>
      <div className={cn('max-w-[85%] space-y-2 rounded-2xl px-4 py-3 text-sm leading-relaxed', isUser ? 'bg-paddy-800 text-soil-50' : 'bg-muted')}>
        <div className="whitespace-pre-wrap">{m.content}</div>
        {!isUser && m.context?.weather_kind && (
          <div className="text-[11px] text-muted-foreground">{t('assistant.weatherBasis', { kind: t(`dataKind.${m.context.weather_kind}.label`, { defaultValue: m.context.weather_kind }) })}</div>
        )}
        {!isUser && m.sources && m.sources.length > 0 && (
          <div className="space-y-1 border-t border-border/60 pt-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('assistant.sources')}</div>
            {m.sources.map((s) => (
              <a key={s.url + s.title} href={s.url} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-xs text-paddy-700 hover:underline dark:text-paddy-300">
                <ExternalLink className="size-3" /> {s.title} — {s.publisher}
              </a>
            ))}
          </div>
        )}
        {!isUser && m.suggested_actions && m.suggested_actions.length > 0 && (
          <div className="space-y-2 border-t border-border/60 pt-2">
            <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{t('assistant.suggestions')}</div>
            {m.suggested_actions.map((a, i) => {
              const done = m.confirmed_actions?.includes(i)
              const p = a.payload as { title?: string; due_date?: string; category?: string }
              return (
                <div key={i} className="flex items-center justify-between gap-2 rounded-xl border border-border bg-card p-2.5">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium">{p.title}</div>
                    <div className="text-[11px] text-muted-foreground">{p.due_date}{p.category ? ` · ${t(`tasks.category.${p.category}`, { defaultValue: p.category })}` : ''}</div>
                  </div>
                  {done ? (
                    <Badge><CheckCircle2 className="size-3" /> {t('assistant.added')}</Badge>
                  ) : (
                    <Button size="sm" variant="outline" disabled={!canAct || busy !== null} onClick={() => confirm(i)} title={!canAct ? t('assistant.needPlan') : undefined}>
                      {busy === i ? <Loader2 className="animate-spin" /> : null} {t('assistant.addTask')}
                    </Button>
                  )}
                </div>
              )
            })}
            <p className="text-[11px] text-muted-foreground">{t('assistant.confirmNote')}</p>
          </div>
        )}
      </div>
    </motion.div>
  )
}
