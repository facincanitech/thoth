import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { DesktopChatWindow } from './components/DesktopChatWindow.tsx'
import { isTauriDesktop } from './lib/platform.ts'

const tauriChatId = isTauriDesktop ? new URLSearchParams(window.location.search).get('tauriChat') : null

if (isTauriDesktop) {
  document.documentElement.dataset.theme = 'thothchat-messenger'
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    {tauriChatId ? <DesktopChatWindow conversationId={tauriChatId} /> : <App />}
  </StrictMode>,
)
