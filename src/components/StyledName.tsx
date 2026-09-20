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

export function StyledName({ name, font, effect, color, className }: Props) {
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
    <span className={`styled-name${effectClass}${className ? ` ${className}` : ''}`} style={style}>
      {name}
    </span>
  )
}
