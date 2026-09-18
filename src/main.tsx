import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DesktopChatWindow } from './components/DesktopChatWindow.tsx'
import { DesktopLoginCallback } from './components/DesktopLoginCallback.tsx'
import { isTauriDesktop } from './lib/platform.ts'

const tauriChatId = isTauriDesktop ? new URLSearchParams(window.location.search).get('tauriChat') : null
const isDesktopLoginCallback = !isTauriDesktop && new URLSearchParams(window.location.search).get('desktop') === '1'

async function boot() {
  // ThothChat Messenger (versao desktop) tem visual proprio e fixo, sem sistema
  // de tema - o CSS dele fica isolado em thothchat-messenger/thothmessenger.css, carregado
  // so quando o app roda dentro do Tauri. Nunca usa data-theme nem Frutiger/Retro.
  if (isTauriDesktop) {
    await import('../thothchat-messenger/thothmessenger.css')
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {isDesktopLoginCallback ? <DesktopLoginCallback /> : tauriChatId ? <DesktopChatWindow conversationId={tauriChatId} /> : <App />}
    </StrictMode>,
  )
}

boot()
