import { useLayoutEffect, useRef, useState } from 'react'
import { isTauriDesktop } from '../lib/platform'

export const NAME_FONTS = [
  { id: 'default', label: 'Padrão', family: 'inherit' },
  { id: 'righteous', label: 'Righteous', family: "'Righteous', cursive" },
  { id: 'bebas', label: 'Bebas Neue', family: "'Bebas Neue', cursive" },
  { id: 'pacifico', label: 'Pacifico', family: "'Pacifico', cursive" },
  { id: 'caveat', label: 'Caveat', family: "'Caveat', cursive" },
  { id: 'pixel', label: 'Press Start 2P', family: "'Press Start 2P', monospace" },
]

export const NAME_EFFECTS: { id: 'solid' | 'gradient' | 'neon' | 'prism'; label: string; locked?: boolean }[] = [
  { id: 'solid', label: 'Sólido' },
  { id: 'gradient', label: 'Gradiente' },
  { id: 'neon', label: 'Neon' },
  { id: 'prism', label: 'Prism' },
]

// Paletas do efeito prisma: o id fica salvo em name_style_color (vazio = arco-iris padrao).
export const PRISM_PALETTES: { id: string; label: string; colors: string[] }[] = [
  { id: 'rainbow', label: 'Arco-íris', colors: ['#ff0000', '#ff9900', '#33ff00', '#00fffb', '#0066ff', '#cc00ff'] },
  { id: 'blue', label: 'Azul', colors: ['#0a3d91', '#1e90ff', '#00d4ff', '#7fdcff'] },
  { id: 'green', label: 'Verde', colors: ['#0b6b2e', '#22c55e', '#a3e635', '#4ade80'] },
  { id: 'purple', label: 'Roxo', colors: ['#4c1d95', '#8b5cf6', '#d946ef', '#a78bfa'] },
  { id: 'blue-purple', label: 'Azul e roxo', colors: ['#1d4ed8', '#38bdf8', '#8b5cf6', '#c026d3'] },
  { id: 'fire', label: 'Fogo', colors: ['#b91c1c', '#f97316', '#facc15', '#ef4444'] },
  { id: 'ocean', label: 'Oceano', colors: ['#0f766e', '#06b6d4', '#3b82f6', '#22d3ee'] },
  { id: 'pink', label: 'Rosa', colors: ['#be185d', '#ec4899', '#f9a8d4', '#fb7185'] },
]

export function prismGradient(paletteId: string | null | undefined): string | null {
  const pal = PRISM_PALETTES.find((p) => p.id === paletteId)
  if (!pal || pal.id === 'rainbow') return null
  return 'linear-gradient(90deg,' + [...pal.colors, pal.colors[0]].join(',') + ')'
}

type Props = {
  name: string
  font?: string | null
  effect?: 'solid' | 'gradient' | 'neon' | 'prism' | null
  color?: string | null
  className?: string
}

// Cor de nome escolhida pelo dono pode sumir no fundo de quem ve (nome claro em tela clara,
// escuro em tela escura): ajusta so a luminosidade pra ficar legivel no tema de quem esta olhando.
function readable(color: string, lightUi: boolean): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color.trim())
  if (!m) return color
  const n = parseInt(m[1], 16)
  let r = (n >> 16) & 255
  let g = (n >> 8) & 255
  let b = n & 255
  const lum = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (lightUi && lum > 0.6) {
    const f = 0.4 / lum
    r = Math.round(r * f); g = Math.round(g * f); b = Math.round(b * f)
  } else if (!lightUi && lum < 0.3) {
    const t = 0.55
    r = Math.round(r + (255 - r) * t); g = Math.round(g + (255 - g) * t); b = Math.round(b + (255 - b) * t)
  } else {
    return color
  }
  return 'rgb(' + r + ',' + g + ',' + b + ')'
}

function themeIsLight(el: Element | null): boolean {
  const theme = el?.closest('[data-theme]')?.getAttribute('data-theme')
  if (theme === 'dark' || theme === 'contrast' || theme === 'cyberpunk') return false
  if (theme) return true
  return isTauriDesktop
}

export function StyledName({ name, font, effect, color: rawColor, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null)
  const [lightUi, setLightUi] = useState(isTauriDesktop)
  useLayoutEffect(() => {
    setLightUi(themeIsLight(ref.current))
  })
  const color = rawColor && (effect === 'solid' || effect === 'neon') ? readable(rawColor, lightUi) : rawColor
  const fontDef = NAME_FONTS.find((f) => f.id === font)
  const style: React.CSSProperties = fontDef && fontDef.id !== 'default' ? { fontFamily: fontDef.family, ...(fontDef.id === 'pixel' ? { fontSize: '0.7em' } : {}) } : {}

  if (effect === 'neon' && color) {
    style.color = color
    style.textShadow = `0 0 1px ${color}, 0 0 3px ${color}, 0 0 6px ${color}`
  } else if (effect === 'gradient' && color) {
    style.backgroundImage = color
  } else if (effect === 'solid' && color) {
    style.color = color
  } else if (effect === 'prism') {
    const g = prismGradient(rawColor)
    if (g) style.backgroundImage = g
  }

  const effectClass = effect === 'gradient' ? ' name-effect-gradient' : effect === 'prism' ? ' name-effect-prism' : ''

  return (
    <span ref={ref} className={`styled-name${effectClass}${className ? ` ${className}` : ''}`} style={style}>
      {name}
    </span>
  )
}
