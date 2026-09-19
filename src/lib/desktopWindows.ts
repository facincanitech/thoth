import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'

function chatWindowLabel(conversationId: string) {
  return `chat-${conversationId}`
}

export async function openChatWindow(conversationId: string, title: string) {
  const label = chatWindowLabel(conversationId)
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.setFocus()
    return
  }
  new WebviewWindow(label, {
    url: `index.html?tauriChat=${encodeURIComponent(conversationId)}`,
    title: `${title} — Conversa`,
    width: 760,
    height: 640,
    minWidth: 520,
    minHeight: 420,
    decorations: false,
  })
}

export async function openPlayWindow() {
  const label = 'thoth-play'
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.show()
    await existing.setFocus()
    return
  }
  new WebviewWindow(label, {
    url: 'index.html?tauriPlay=1',
    title: 'Thoth Play — ThothChat',
    width: 980,
    height: 680,
    minWidth: 760,
    minHeight: 480,
    decorations: false,
  })
}

export const currentWindow = () => getCurrentWindow()
