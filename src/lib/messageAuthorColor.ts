import type { CSSProperties } from 'react'

// Cores claras e legiveis para diferenciar participantes de uma conversa em grupo.
// O hash faz a mesma pessoa manter a mesma cor em qualquer aparelho/plataforma.
const AUTHOR_BUBBLES = [
  { background: '#dcf8c6', border: '#a8d98a' },
  { background: '#ffe1e8', border: '#e8aebd' },
  { background: '#d9f4ff', border: '#9ed3e8' },
  { background: '#fff1c7', border: '#dfc77e' },
  { background: '#e8e1ff', border: '#bdb0e8' },
  { background: '#ddf7e7', border: '#9fd5b3' },
  { background: '#ffe5cc', border: '#e2b98f' },
  { background: '#e3ecff', border: '#afc2e9' },
] as const

export function messageAuthorStyle(authorId: string): CSSProperties {
  let hash = 2166136261
  for (let i = 0; i < authorId.length; i += 1) {
    hash ^= authorId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  const color = AUTHOR_BUBBLES[(hash >>> 0) % AUTHOR_BUBBLES.length]
  return {
    '--participant-bubble': color.background,
    '--participant-border': color.border,
  } as CSSProperties
}
