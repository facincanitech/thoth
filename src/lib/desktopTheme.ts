import skinUrl from '../../thothchat-messenger/thothmessenger.css?url'

// No desktop o tema "Frutiger Aero" e o skin completo (thothmessenger.css). Os outros temas
// (Escuro, Retro, Alto contraste) usam o CSS normal do app + desktopBasic.css (so a moldura da janela).
// Personalizacao livre de cores/fundo nao existe: so estes temas padronizados.
const THEME_KEY = 'ferus-theme'
type ThemeId = 'messenger' | 'dark' | 'light' | 'contrast' | 'cyberpunk'

export function readStoredDesktopTheme(): ThemeId {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved === 'dark' || saved === 'light' || saved === 'contrast' || saved === 'cyberpunk') return saved
  } catch {
    // ignore
  }
  return 'messenger'
}

function setSkin(on: boolean): Promise<void> {
  const root = document.documentElement
  root.classList.toggle('no-msn-skin', !on)
  const existing = document.getElementById('msn-skin') as HTMLLinkElement | null
  if (!on) {
    existing?.remove()
    return Promise.resolve()
  }
  if (existing) return Promise.resolve()
  return new Promise((resolve) => {
    const link = document.createElement('link')
    link.id = 'msn-skin'
    link.rel = 'stylesheet'
    link.href = skinUrl
    link.onload = () => resolve()
    link.onerror = () => resolve()
    document.head.appendChild(link)
  })
}

// data-theme so vale pros temas "de verdade" (retro/contraste); dark e o :root padrao
// e o Frutiger do desktop e o skin em si (nao usa data-theme).
export function applyDesktopTheme(theme: string): Promise<void> {
  const root = document.documentElement
  if (theme === 'light' || theme === 'contrast' || theme === 'cyberpunk') root.dataset.theme = theme
  else delete root.dataset.theme
  return setSkin(theme !== 'dark' && theme !== 'light' && theme !== 'contrast' && theme !== 'cyberpunk')
}

// Janelas secundarias (conversa) seguem o tema escolhido na janela principal.
export function followDesktopTheme() {
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY) applyDesktopTheme(readStoredDesktopTheme())
  })
}
