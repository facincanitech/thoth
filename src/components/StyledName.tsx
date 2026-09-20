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
  { id: 'prism', label: 'Prism', locked: true },
]

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
  if (theme === 'dark' || theme === 'contrast') return false
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
  }

  const effectClass = effect === 'gradient' ? ' name-effect-gradient' : effect === 'prism' ? ' name-effect-prism' : ''

  return (
    <span ref={ref} className={`styled-name${effectClass}${className ? ` ${className}` : ''}`} style={style}>
      {name}
    </span>
  )
}
