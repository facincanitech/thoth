export const builtInThemes = [
  { id: 'messenger', name: 'Frutiger Aero', description: 'A aparência principal do Thoth Messenger.' },
  { id: 'dark', name: 'Escuro', description: 'A conversa em tons profundos.' },
  { id: 'light', name: 'Retrô', description: 'Inspiração Orkut e MSN.' },
  { id: 'cyberpunk', name: 'Cyberpunk', description: 'Cidade neon, ciano e magenta.' },
  { id: 'matrix', name: 'Matrix', description: 'Fundo escuro e chuva de códigos.' },
  { id: 'wood', name: 'Madeira', description: 'Textura de madeira e tons quentes.' },
  { id: 'contrast', name: 'Alto contraste', description: 'Legibilidade máxima.' },
] as const

export type BuiltInTheme = typeof builtInThemes[number]['id']
export const defaultTheme = 'messenger' as const

export const builtInSounds = [
  { id: 'message', name: 'Frutiger Aero · Mensagem', description: 'Som padrão de nova mensagem.', type: 'message', url: 'sounds/notify.mp3' },
  { id: 'nudge', name: 'Frutiger Aero · Chamar atenção', description: 'Som padrão para chamar a atenção.', type: 'nudge', url: 'sounds/nudge.mp3' },
] as const

export function isBuiltInTheme(value: unknown): value is BuiltInTheme {
  return builtInThemes.some((theme) => theme.id === value)
}
