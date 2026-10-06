import { emitTo } from '@tauri-apps/api/event'
import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { LogicalPosition } from '@tauri-apps/api/dpi'
import { supabase } from './supabase'
import { displayName } from './displayName'
import { isTauriDesktop } from './platform'
import { readStoredDesktopTheme } from './desktopTheme'

export type DesktopToastPayload = {
  conversationId?: string
  sender: string
  message: string
  kind: 'message' | 'nudge' | 'wink'
  theme?: string
}

type ToastRequest = Omit<DesktopToastPayload, 'sender'> & {
  senderId?: string
  sender?: string
}

const TOAST_LABEL = 'thoth-notification'
export const DESKTOP_TOAST_SETTING_KEY = 'thoth-desktop-overlay-notifications'
export const DESKTOP_TOAST_POSITION_KEY = 'thoth-desktop-toast-position'
export type DesktopToastPosition = 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left' | 'custom'
type DesktopToastPlacement = { mode: DesktopToastPosition; x?: number; y?: number }

export function readDesktopToastPlacement(): DesktopToastPlacement {
  try {
    const saved = JSON.parse(localStorage.getItem(DESKTOP_TOAST_POSITION_KEY) || '{}') as DesktopToastPlacement
    if (['bottom-right', 'bottom-left', 'top-right', 'top-left', 'custom'].includes(saved.mode)) return saved
  } catch { /* use default */ }
  return { mode: 'bottom-right' }
}

export function saveDesktopToastPlacement(placement: DesktopToastPlacement) {
  try { localStorage.setItem(DESKTOP_TOAST_POSITION_KEY, JSON.stringify(placement)) } catch { /* ignore */ }
}

function resolveToastPosition(width: number, height: number) {
  const placement = readDesktopToastPlacement()
  const gap = 14
  const left = (window.screen as Screen & { availLeft?: number }).availLeft || 0
  const top = (window.screen as Screen & { availTop?: number }).availTop || 0
  const right = left + window.screen.availWidth
  const bottom = top + window.screen.availHeight
  const customIsUsable = placement.mode === 'custom'
    && Number.isFinite(placement.x) && Number.isFinite(placement.y)
    && placement.x! >= left && placement.y! >= top
    && placement.x! <= right - width && placement.y! <= bottom - height
  return {
    x: customIsUsable ? placement.x! : placement.mode.endsWith('left') ? left + gap : right - width - gap,
    y: customIsUsable ? placement.y! : placement.mode.startsWith('top') ? top + gap : bottom - height - gap,
  }
}

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
    theme: readStoredDesktopTheme(),
  }
  const width = 350
  const height = 112
  const { x, y } = resolveToastPosition(width, height)
  const existing = await WebviewWindow.getByLabel(TOAST_LABEL)
  if (existing) {
    await emitTo(TOAST_LABEL, 'desktop-toast', payload)
    await existing.setPosition(new LogicalPosition(x, y)).catch(() => {})
    await existing.show().catch(() => {})
    return
  }

  new WebviewWindow(TOAST_LABEL, {
    url: `index.html?tauriToast=1&toast=${encodeURIComponent(JSON.stringify(payload))}`,
    title: 'Thoth Messenger',
    width,
    height,
    x,
    y,
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
