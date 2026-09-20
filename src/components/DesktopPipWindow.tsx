import { useEffect, useRef } from 'react'
import { currentWindow } from '../lib/desktopWindows'

// Janelinha de PiP (desktop): recebe o video da janela do Play por WebRTC local.
export function DesktopPipWindow() {
  const params = new URLSearchParams(window.location.search)
  const pid = params.get('pid') || ''
  const name = params.get('name') || ''
  const videoRef = useRef<HTMLVideoElement>(null)

  useEffect(() => {
    const unlistens: (() => void)[] = []
    const pc = new RTCPeerConnection({ iceServers: [] })
    const queue: RTCIceCandidateInit[] = []
    let remoteSet = false

    pc.ontrack = (e) => {
      if (videoRef.current) videoRef.current.srcObject = e.streams[0] || new MediaStream([e.track])
    }

    import('@tauri-apps/api/event').then(async ({ emit, listen }) => {
      pc.onicecandidate = (ev) => {
        if (ev.candidate) emit('pip-ice-window', { pid, candidate: ev.candidate.toJSON() })
      }
      unlistens.push(await listen<{ pid: string; sdp: RTCSessionDescriptionInit }>('pip-offer', async (e) => {
        if (e.payload.pid !== pid) return
        await pc.setRemoteDescription(e.payload.sdp)
        remoteSet = true
        for (const c of queue.splice(0)) await pc.addIceCandidate(c).catch(() => {})
        const answer = await pc.createAnswer()
        await pc.setLocalDescription(answer)
        emit('pip-answer', { pid, sdp: { type: answer.type, sdp: answer.sdp } })
      }))
      unlistens.push(await listen<{ pid: string; candidate: RTCIceCandidateInit }>('pip-ice-main', async (e) => {
        if (e.payload.pid !== pid) return
        if (remoteSet) await pc.addIceCandidate(e.payload.candidate).catch(() => {})
        else queue.push(e.payload.candidate)
      }))
      emit('pip-ready', { pid })
    })

    return () => {
      unlistens.forEach((u) => u())
      pc.close()
    }
  }, [pid])

  return (
    <div className="pip-window">
      <video ref={videoRef} autoPlay playsInline muted />
      <div className="pip-window-bar" data-tauri-drag-region>
        <span data-tauri-drag-region>{name}</span>
        <button type="button" onClick={() => currentWindow().close()} aria-label="Fechar">x</button>
      </div>
    </div>
  )
}
