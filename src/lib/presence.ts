export function formatPresence(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return 'offline'
  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  if (diffMs < 90_000) return 'online'
  const minutes = Math.floor(diffMs / 60_000)
  if (minutes < 60) return `visto por último há ${minutes}min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `visto por último há ${hours}h`
  const days = Math.floor(hours / 24)
  return `visto por último há ${days}d`
}

export function formatLastSeenClock(lastSeenAt: string | null | undefined): string {
  if (!lastSeenAt) return 'visto por último indisponível'
  const seen = new Date(lastSeenAt)
  if (Number.isNaN(seen.getTime())) return 'visto por último indisponível'

  const now = new Date()
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime()
  const seenDay = new Date(seen.getFullYear(), seen.getMonth(), seen.getDate()).getTime()
  const time = seen.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })

  if (seenDay === today) return `visto por último hoje às ${time}`
  if (seenDay === today - 86_400_000) return `visto por último ontem às ${time}`
  const date = seen.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
  return `visto por último em ${date} às ${time}`
}

export type PresenceColor = 'online' | 'afk' | 'offline'

export function getPresenceColor(lastSeenAt: string | null | undefined, isIdle: boolean | undefined): PresenceColor {
  if (!lastSeenAt) return 'offline'
  const diffMs = Date.now() - new Date(lastSeenAt).getTime()
  if (diffMs >= 90_000) return 'offline'
  return isIdle ? 'afk' : 'online'
}
