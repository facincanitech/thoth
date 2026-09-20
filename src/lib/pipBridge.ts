import type { Track } from 'livekit-client'

// PiP no desktop: o WebView2 nao tem Picture-in-Picture (nem o nativo, nem o Document PiP),
// entao cada PiP e uma janelinha propria do Tauri (sempre no topo) que recebe o video por
// uma conexao WebRTC local (loopback) com a janela do Play - sem custo no LiveKit.

type Entry = { track: Track; pc: RTCPeerConnection | null; unlistens: (() => void)[] }
const entries = new Map<string, Entry>()

function labelOf(id: string) {
  return 'pip-' + id.replace(/[^a-zA-Z0-9\-_:]/g, '_')
}

async function cleanup(id: string, onClosed: () => void) {
  const entry = entries.get(id)
  if (!entry) return
  entry.unlistens.forEach((u) => u())
  entry.pc?.close()
  entries.delete(id)
  onClosed()
}

export async function openPip(id: string, name: string, track: Track, onClosed: () => void) {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const { emit, listen } = await import('@tauri-apps/api/event')
  const label = labelOf(id)
  const existing = await WebviewWindow.getByLabel(label)
  if (existing) {
    await existing.setFocus().catch(() => {})
    return
  }

  const entry: Entry = { track, pc: null, unlistens: [] }
  entries.set(id, entry)

  entry.unlistens.push(await listen<{ pid: string }>('pip-ready', async (e) => {
    if (e.payload.pid !== id || entry.pc) return
    const pc = new RTCPeerConnection({ iceServers: [] })
    entry.pc = pc
    pc.onicecandidate = (ev) => {
      if (ev.candidate) emit('pip-ice-main', { pid: id, candidate: ev.candidate.toJSON() })
    }
    const mst = entry.track.mediaStreamTrack
    pc.addTrack(mst, new MediaStream([mst]))
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)
    emit('pip-offer', { pid: id, sdp: { type: offer.type, sdp: offer.sdp } })
  }))
  entry.unlistens.push(await listen<{ pid: string; sdp: RTCSessionDescriptionInit }>('pip-answer', async (e) => {
    if (e.payload.pid !== id || !entry.pc) return
    await entry.pc.setRemoteDescription(e.payload.sdp)
  }))
  entry.unlistens.push(await listen<{ pid: string; candidate: RTCIceCandidateInit }>('pip-ice-window', async (e) => {
    if (e.payload.pid !== id || !entry.pc) return
    await entry.pc.addIceCandidate(e.payload.candidate).catch(() => {})
  }))

  const w = new WebviewWindow(label, {
    url: 'index.html?tauriPip=1&pid=' + encodeURIComponent(id) + '&name=' + encodeURIComponent(name),
    title: name,
    width: 480,
    height: 300,
    minWidth: 240,
    minHeight: 150,
    decorations: false,
    alwaysOnTop: true,
    resizable: true,
  })
  w.once('tauri://destroyed', () => { cleanup(id, onClosed) })
  w.once('tauri://error', () => { cleanup(id, onClosed) })
}

export function updatePipTrack(id: string, track: Track) {
  const entry = entries.get(id)
  if (!entry) return
  entry.track = track
  entry.pc?.getSenders()[0]?.replaceTrack(track.mediaStreamTrack).catch(() => {})
}

export async function closePip(id: string) {
  const { WebviewWindow } = await import('@tauri-apps/api/webviewWindow')
  const w = await WebviewWindow.getByLabel(labelOf(id))
  await w?.close().catch(() => {})
}

export function pipIdsOpen(): string[] {
  return [...entries.keys()]
}
