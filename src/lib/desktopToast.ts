import { emitTo } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { supabase } from './supabase'
import { displayName } from './displayName'
import { isTauriDesktop } from './platform'

export type DesktopToastPayload = {
  conversationId?: string
  sender: string
  message: string
  kind: 'message' | 'nudge' | 'wink'
}

type ToastRequest = Omit<DesktopToastPayload, 'sender'> & {
  senderId?: string
  sender?: string
}

const TOAST_LABEL = 'thoth-notification'
export const DESKTOP_TOAST_SETTING_KEY = 'thoth-desktop-overlay-notifications'

export function desktopToastEnabled() {
  try {
    return localStorage.getItem(DESKTOP_TOAST_SETTING_KEY) !== 'off'
  } catch {
    return true
  }
}

export function setDesktopToastEnabled(enabled: boolean) {
  try {
    localStorage.setItem(DESKTOP_TOAST_SETTING_KEY, enabled ? 'on' : 'off')
  } catch {
    // Ignore storage failures and keep the current session state in the UI.
  }
}

async function notificationTargetIsFocused(conversationId?: string) {
  const windows = await WebviewWindow.getAll()
  // So a propria conversa aberta pode dispensar o aviso. Uma conversa diferente,
  // a lista de contatos, o Play, chamadas e PiP nunca bloqueiam a notificacao.
  const targetLabel = conversationId ? `chat-${conversationId}` : 'main'
  const target = windows.find((window) => window.label === targetLabel)
  return target ? target.isFocused().catch(() => false) : false
}

async function resolveSender(request: ToastRequest) {
  if (request.sender) return request.sender
  if (!request.senderId) return 'Thoth Messenger'
  const { data } = await supabase
    .from('profiles')
    .select('username, display_name')
    .eq('id', request.senderId)
    .maybeSingle()
  return data ? displayName(data) : 'Novo contato'
}

export async function showDesktopToast(request: ToastRequest) {
  if (!isTauriDesktop) return
  if (!desktopToastEnabled()) return
  if (await notificationTargetIsFocused(request.conversationId).catch(() => false)) return

  const payload: DesktopToastPayload = {
    conversationId: request.conversationId,
    sender: await resolveSender(request),
    message: request.message,
    kind: request.kind,
  }
  const existing = await WebviewWindow.getByLabel(TOAST_LABEL)
  if (existing) {
    await emitTo(TOAST_LABEL, 'desktop-toast', payload)
    await existing.show().catch(() => {})
    return
  }

  const width = 350
  const height = 112
  new WebviewWindow(TOAST_LABEL, {
    url: `index.html?tauriToast=1&toast=${encodeURIComponent(JSON.stringify(payload))}`,
    title: 'Thoth Messenger',
    width,
    height,
    x: Math.max(8, window.screen.availWidth - width - 14),
    y: Math.max(8, window.screen.availHeight - height - 14),
    decorations: false,
    resizable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: false,
    transparent: true,
    shadow: false,
    dragDropEnabled: false,
  })
  // O primeiro aviso viaja na URL: assim ele nao se perde enquanto o React da
  // janelinha ainda esta montando. Os proximos chegam pelo evento acima.
}

export function messagePreview(kind?: string, content?: string) {
  const clean = (content || '').replace(/\s+/g, ' ').trim()
  if (kind === 'sticker') return 'enviou um sticker'
  if (kind === 'gif') return 'enviou um GIF'
  if (kind === 'contact') return 'compartilhou um contato'
  if (kind === 'ephemeral') return 'enviou uma mensagem temporaria'
  if (kind === 'sonor_picker') return 'enviou um som'
  return clean || 'enviou uma nova mensagem'
}
