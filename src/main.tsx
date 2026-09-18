import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DesktopChatWindow } from './components/DesktopChatWindow.tsx'
import { DesktopPlayWindow } from './components/DesktopPlayWindow.tsx'
import { isTauriDesktop } from './lib/platform.ts'

const searchParams = isTauriDesktop ? new URLSearchParams(window.location.search) : null
const tauriChatId = searchParams?.get('tauriChat') ?? null
const isTauriPlay = searchParams?.get('tauriPlay') === '1'

async function boot() {
  // ThothChat Messenger (versao desktop) tem visual proprio e fixo, sem sistema
  // de tema - o CSS dele fica isolado em thothchat-messenger/thothmessenger.css, carregado
  // so quando o app roda dentro do Tauri. Nunca usa data-theme nem Frutiger/Retro.
  if (isTauriDesktop) {
    await import('../thothchat-messenger/thothmessenger.css')
  }

  createRoot(document.getElementById('root')!).render(
    <StrictMode>
      {isTauriPlay ? <DesktopPlayWindow /> : tauriChatId ? <DesktopChatWindow conversationId={tauriChatId} /> : <App />}
    </StrictMode>,
  )
}

boot()
