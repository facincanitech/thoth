import { useEffect, useRef, useState } from 'react'
import { listen } from '@tauri-apps/api/event'
import { getCurrentWindow } from '@tauri-apps/api/window'
import thothLogo from '../../logo/toth_chat.png'
import { openChatWindow, openMainWindow } from '../lib/desktopWindows'
import { applyDesktopTheme, followDesktopTheme, readStoredDesktopTheme } from '../lib/desktopTheme'
import { saveDesktopToastPlacement, type DesktopToastPayload } from '../lib/desktopToast'
import './DesktopToastWindow.css'

const DISPLAY_MS = 6200

export function DesktopToastWindow() {
  // Janela separada do Tauri, nao herda o tema aplicado na janela principal sozinha - sem isso
  // o toast ficava sempre na mesma cor (Frutiger azul fixo), nao acompanhava o tema escolhido
  // (mesmo mecanismo de localStorage+evento storage que as outras janelas secundarias usam).
  useEffect(() => {
    void applyDesktopTheme(readStoredDesktopTheme())
    followDesktopTheme()
  }, [])
  const [toast, setToast] = useState<DesktopToastPayload | null>(() => {
    try {
      const raw = new URLSearchParams(window.location.search).get('toast')
      return raw ? JSON.parse(raw) as DesktopToastPayload : null
    } catch {
      return null
    }
  })
  const [leaving, setLeaving] = useState(false)
  const timer = useRef<number | null>(null)

  useEffect(() => {
    let unlisten = () => {}
    listen<DesktopToastPayload>('desktop-toast', ({ payload }) => {
      setLeaving(false)
      setToast(payload)
    }).then((fn) => { unlisten = fn })
    return () => {
      unlisten()
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [])

  useEffect(() => {
    if (!toast) return
    void applyDesktopTheme(toast.theme || readStoredDesktopTheme())
    if (timer.current) window.clearTimeout(timer.current)
    timer.current = window.setTimeout(() => {
      setLeaving(true)
      window.setTimeout(() => getCurrentWindow().hide().catch(() => {}), 280)
    }, DISPLAY_MS)
  }, [toast])

  async function openConversation() {
    if (!toast) return
    if (toast.conversationId) await openChatWindow(toast.conversationId, toast.sender)
    else await openMainWindow()
    await getCurrentWindow().hide().catch(() => {})
  }

  async function dragToast(event: React.PointerEvent) {
    event.stopPropagation()
    const win = getCurrentWindow()
    await win.startDragging().catch(() => {})
    const position = await win.outerPosition().catch(() => null)
    const scaleFactor = await win.scaleFactor().catch(() => 1)
    if (position) {
      const logical = position.toLogical(scaleFactor)
      saveDesktopToastPlacement({ mode: 'custom', x: logical.x, y: logical.y })
    }
  }

  if (!toast) return null
  return (
    <button className={`desktop-toast${leaving ? ' leaving' : ''}`} onClick={openConversation} type="button">
      <span className={`desktop-toast-icon ${toast.kind}`}><img src={thothLogo} alt="" /></span>
      <span className="desktop-toast-copy">
        <span className="desktop-toast-brand" onPointerDown={dragToast} title="Arraste para mudar a posição">THOTH MESSENGER</span>
        <strong>{toast.sender}</strong>
        <span className="desktop-toast-message">{toast.message}</span>
      </span>
      <span className="desktop-toast-close" onClick={(event) => { event.stopPropagation(); getCurrentWindow().hide().catch(() => {}) }}>×</span>
    </button>
  )
}
