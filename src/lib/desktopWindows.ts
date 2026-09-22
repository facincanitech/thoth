import { WebviewWindow } from '@tauri-apps/api/webviewWindow'
import { getCurrentWindow } from '@tauri-apps/api/window'

function chatWindowLabel(conversationId: string) {
  return `chat-${conversationId}`
}

export async function openChatWindow(conversationId: string, title: string) {
  const label = chatWindowLabel(conversationId)
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.unminimize()
    await existing.show()
    await existing.setFocus()
    return
  }
  // Abre do lado direito da tela (a lista de contatos fica na esquerda); cada conversa nova
  // desce/desloca um pouco pra nao ficar uma em cima da outra.
  const width = 760
  const height = 640
  const openChats = (await WebviewWindow.getAll()).filter((w) => w.label.startsWith('chat-')).length
  const cascade = (openChats % 6) * 28
  const x = Math.max(0, window.screen.availWidth - width - 12 - cascade)
  const y = Math.max(0, Math.round((window.screen.availHeight - height) / 2) + cascade - 40)
  new WebviewWindow(label, {
    url: `index.html?tauriChat=${encodeURIComponent(conversationId)}`,
    title: `${title} — Conversa`,
    width,
    height,
    x,
    y,
    minWidth: 520,
    minHeight: 420,
    decorations: false,
    dragDropEnabled: false,
  })
}

// Traz a janela principal (chats) pra frente sem mexer no Play - a chamada de voz continua.
export async function openMainWindow() {
  const w = await WebviewWindow.getByLabel('main')
  if (!w) return
  await w.unminimize().catch(() => {})
  await w.show().catch(() => {})
  await w.setFocus().catch(() => {})
  const { emit } = await import('@tauri-apps/api/event')
  await emit('tray-nav', 'home')
}

export async function openPlayWindow(inviteCode?: string) {
  const label = 'thoth-play'
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    try {
      await existing.unminimize()
      await existing.show()
      await existing.setFocus()
      // Janela do Play ja aberta: manda o convite por evento em vez de recriar a janela
      // (o componente ja montado escuta 'play-invite' pra entrar no servidor).
      if (inviteCode) {
        const { emit } = await import('@tauri-apps/api/event')
        await emit('play-invite', inviteCode)
      }
      return
    } catch {
      // janela escondida ficou num estado ruim - recria do zero em vez de ficar sem abrir
      await existing.destroy().catch(() => {})
    }
  }
  const inviteParam = inviteCode ? `&playInvite=${encodeURIComponent(inviteCode)}` : ''
  new WebviewWindow(label, {
    url: `index.html?tauriPlay=1${inviteParam}`,
    title: 'Thoth Play',
    width: 1200,
    height: 820,
    minWidth: 800,
    minHeight: 480,
    decorations: false,
    dragDropEnabled: false,
  })
}

// Janela unica de chamadas: criada escondida (fica ouvindo chamadas recebidas) e so aparece
// quando toca ou quando alguem liga.
export async function ensureCallWindow() {
  const label = 'thoth-call'
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) return
  new WebviewWindow(label, {
    url: 'index.html?tauriCall=1',
    title: 'Chamada',
    width: 900,
    height: 620,
    minWidth: 420,
    minHeight: 460,
    decorations: false,
    dragDropEnabled: false,
    visible: false,
  })
}

export async function requestCall(req: unknown) {
  await ensureCallWindow()
  const { emit, listen } = await import('@tauri-apps/api/event')
  let acked = false
  const unlisten = await listen('call-start-ack', () => { acked = true })
  // a janela pode estar ainda carregando: repete ate ela confirmar que recebeu (e para na hora)
  for (let i = 0; i < 10 && !acked; i += 1) {
    await emit('call-start', req)
    await new Promise((r) => setTimeout(r, 500))
  }
  unlisten()
}

export const currentWindow = () => getCurrentWindow()
