import skinBase from '../../thothchat-messenger/thothmessenger.css?url'
import skinDark from '../../thothchat-messenger/thothmessenger-dark.css?url'
import skinRetro from '../../thothchat-messenger/thothmessenger-retro.css?url'
import skinContrast from '../../thothchat-messenger/thothmessenger-contrast.css?url'
import skinCyberpunk from '../../thothchat-messenger/thothmessenger-cyberpunk.css?url'
import skinMatrix from '../../thothchat-messenger/thothmessenger-matrix.css?url'
import skinWood from '../../thothchat-messenger/thothmessenger-wood.css?url'

// Desktop tem estrutura propria (skin thothmessenger.css = Frutiger Aero). Os outros temas sao a
// MESMA estrutura com outra paleta (gerada por thothchat-messenger/gen-themes.mjs) - nunca o CSS do APK.
// Nao existe personalizacao livre de cor/fundo: so estes temas padronizados.
const THEME_KEY = 'ferus-theme'
const SKINS: Record<string, string> = {
  messenger: skinBase,
  dark: skinDark,
  light: skinRetro,
  contrast: skinContrast,
  cyberpunk: skinCyberpunk,
  matrix: skinMatrix,
  wood: skinWood,
}

export function readStoredDesktopTheme(): string {
  try {
    const saved = localStorage.getItem(THEME_KEY)
    if (saved && SKINS[saved]) return saved
  } catch {
    // ignore
  }
  return 'messenger'
}

export function applyDesktopTheme(theme: string): Promise<void> {
  const key = SKINS[theme] ? theme : 'messenger'
  document.documentElement.dataset.desktopTheme = key
  delete document.documentElement.dataset.theme // estrutura desktop nao usa os [data-theme] do CSS de celular
  const href = SKINS[key]
  const existing = document.getElementById('msn-skin') as HTMLLinkElement | null
  if (existing && existing.getAttribute('href') === href) return Promise.resolve()
  return new Promise((resolve) => {
    const link = document.createElement('link')
    link.id = 'msn-skin-next'
    link.rel = 'stylesheet'
    link.href = href
    const done = () => {
      existing?.remove()
      link.id = 'msn-skin'
      resolve()
    }
    link.onload = done
    link.onerror = done
    document.head.appendChild(link)
  })
}

// Janelas secundarias (conversa) seguem o tema escolhido na janela principal.
export function followDesktopTheme() {
  window.addEventListener('storage', (e) => {
    if (e.key === THEME_KEY) applyDesktopTheme(readStoredDesktopTheme())
  })
}

// Voltou pra estrutura de celular (navegador estreito): tira o skin do desktop.
export function removeDesktopSkin() {
  document.getElementById('msn-skin')?.remove()
  document.getElementById('msn-skin-next')?.remove()
  delete document.documentElement.dataset.desktopTheme
}
