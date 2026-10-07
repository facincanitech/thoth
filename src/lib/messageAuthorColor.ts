import type { CSSProperties } from 'react'

// Cores claras e legiveis para diferenciar participantes de uma conversa em grupo.
// O hash faz a mesma pessoa manter a mesma cor em qualquer aparelho/plataforma.
export function messageAuthorStyle(authorId: string): CSSProperties {
  let hash = 2166136261
  for (let i = 0; i < authorId.length; i += 1) {
    hash ^= authorId.charCodeAt(i)
    hash = Math.imul(hash, 16777619)
  }
  // O array antigo tinha somente oito cores: IDs diferentes podiam cair no mesmo índice e,
  // em grupos pequenos, dava a impressão de que todos tinham o mesmo balão. O matiz contínuo
  // mantém a cor estável por usuário e reduz drasticamente colisões visuais.
  const hue = (hash >>> 0) % 360
  return {
    '--participant-bubble': `hsl(${hue} 78% 89%)`,
    '--participant-border': `hsl(${hue} 48% 67%)`,
  } as CSSProperties
}
