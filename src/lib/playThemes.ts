export const PLAY_THEMES = [
  {
    id: 'dark',
    label: 'Noite',
    description: 'O visual original do Play, escuro e imersivo.',
    colors: ['#10151e', '#243451', '#7892ff'],
  },
  {
    id: 'light',
    label: 'Aero claro',
    description: 'Azul-gelo, vidro e contraste confortável durante o dia.',
    colors: ['#f4fbff', '#d5effb', '#078cc8'],
  },
] as const

export type PlayThemeId = (typeof PLAY_THEMES)[number]['id']

export const DEFAULT_PLAY_THEME: PlayThemeId = 'dark'

export function normalizePlayTheme(value: unknown): PlayThemeId {
  return PLAY_THEMES.some((theme) => theme.id === value)
    ? value as PlayThemeId
    : DEFAULT_PLAY_THEME
}
