export type MediaFavoriteKind = 'gif' | 'sticker' | 'wink' | 'emoji'

export type MediaFavorite = {
  kind: MediaFavoriteKind
  id: string
  value: string
  preview?: string
  sound?: string | null
  label?: string
  uses: number
  lastUsed: number
}

const STORAGE_KEY = 'thoth-media-favorites-v1'
const MAX_PER_KIND = 18

export function readMediaFavorites(): MediaFavorite[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export function saveMediaFavorites(items: MediaFavorite[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items))
  } catch {
    // O seletor continua funcionando mesmo se o armazenamento estiver indisponivel.
  }
}

export function recordMediaFavorite(items: MediaFavorite[], item: Omit<MediaFavorite, 'uses' | 'lastUsed'>): MediaFavorite[] {
  const previous = items.find((entry) => entry.kind === item.kind && entry.id === item.id)
  const updated: MediaFavorite = {
    ...previous,
    ...item,
    uses: (previous?.uses || 0) + 1,
    lastUsed: Date.now(),
  }
  const others = items.filter((entry) => !(entry.kind === item.kind && entry.id === item.id))
  const sameKind = [...others.filter((entry) => entry.kind === item.kind), updated]
    .sort((a, b) => b.uses - a.uses || b.lastUsed - a.lastUsed)
    .slice(0, MAX_PER_KIND)
  return [...others.filter((entry) => entry.kind !== item.kind), ...sameKind]
}
