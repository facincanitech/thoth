import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { displayName } from '../lib/displayName'
import { triggerNudgeShake } from '../lib/nudge'
import { sendPush } from '../lib/pushSend'
import { fetchIceServers, type CallKind, type CallPeer, type CallSignal, type OutgoingCallRequest, type PendingCallRow } from '../lib/call'
import { setSpeakerphoneOn, startCallAudio, stopCallAudio, startRingtone, stopRingtone } from '../lib/audioRoute'
import { setCallOverlayActive } from '../lib/pushNotifications'
import {
  IconCameraFlip,
  IconMic,
  IconMicOff,
  IconPhone,
  IconPhoneOff,
  IconUser,
  IconVideo,
  IconVideoOff,
  IconVolume,
  IconVolumeOff,
} from './icons'
import type { Profile } from '../types'

type Direction = 'incoming' | 'outgoing'
type Status = 'ringing' | 'connecting' | 'connected'

type Session = {
  callId: string
  peer: CallPeer
  conversationId: string
  kind: CallKind
  direction: Direction
  status: Status
  startedAt: number | null
}

type Props = {
  me: Profile | null
  onActiveChange?: (active: boolean) => void
}

export type CallOverlayHandle = {
  startCall: (req: OutgoingCallRequest) => void
  hangup: () => void
}

const RING_TIMEOUT_MS = 60000

function formatDuration(ms: number): string {
  const total = Math.floor(ms / 1000)
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export const CallOverlay = forwardRef<CallOverlayHandle, Props>(function CallOverlay({ me, onActiveChange }, ref) {
  const [session, setSession] = useState<Session | null>(null)
  const [muted, setMuted] = useState(false)
  const [cameraOff, setCameraOff] = useState(false)
  const [speakerOn, setSpeakerOn] = useState(false)
  const [tick, setTick] = useState(0)

  const facingModeRef = useRef<'user' | 'environment'>('user')
  const sessionRef = useRef<Session | null>(null)
  const pcRef = useRef<RTCPeerConnection | null>(null)
  const localStreamRef = useRef<MediaStream | null>(null)
  const peerChannelRef = useRef<RealtimeChannel | null>(null)
  const pendingCandidatesRef = useRef<RTCIceCandidateInit[]>([])
  const pendingOfferRef = useRef<RTCSessionDescriptionInit | null>(null)
  const ringTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const connectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localVideoRef = useRef<HTMLVideoElement>(null)
  const remoteVideoRef = useRef<HTMLVideoElement>(null)
  const remoteAudioRef = useRef<HTMLAudioElement>(null)
  const remoteStreamRef = useRef<MediaStream | null>(null)

  useEffect(() => {
    sessionRef.current = session
  }, [session])

  const isActive = !!session
  useEffect(() => {
    onActiveChange?.(isActive)
  }, [isActive])

  useEffect(() => {
    if (session?.status !== 'connected') return
    const id = setInterval(() => setTick((t) => t + 1), 1000)
    return () => clearInterval(id)
  }, [session?.status])

  useEffect(() => {
    if (session?.kind !== 'video' || session.status !== 'connected') return
    if (remoteVideoRef.current && remoteStreamRef.current) {
      remoteVideoRef.current.srcObject = remoteStreamRef.current
    }
    if (localVideoRef.current && localStreamRef.current) {
      localVideoRef.current.srcObject = localStreamRef.current
    }
  }, [session?.kind, session?.status])

  function clearRingTimeout() {
    if (ringTimeoutRef.current) {
      clearTimeout(ringTimeoutRef.current)
      ringTimeoutRef.current = null
    }
  }

  function clearConnectTimeout() {
    if (connectTimeoutRef.current) {
      clearTimeout(connectTimeoutRef.current)
      connectTimeoutRef.current = null
    }
  }

  const CONNECT_TIMEOUT_MS = 20000

  function scheduleConnectTimeout(callId: string) {
    clearConnectTimeout()
    connectTimeoutRef.current = setTimeout(() => {
      if (sessionRef.current?.callId === callId && sessionRef.current.status !== 'connected') {
        alert('Não consegui conectar a chamada. Tenta de novo.')
        const peerId = sessionRef.current.peer.id
        const signal: CallSignal = { type: 'call-end', callId, from: me!.id }
        if (peerChannelRef.current) sendSignal(signal)
        else sendOneOff(peerId, signal)
        cleanupCall()
      }
    }, CONNECT_TIMEOUT_MS)
  }

  function sendOneOff(peerId: string, signal: CallSignal) {
    const ch = supabase.channel(`call:${peerId}`)
    ch.subscribe((status) => {
      if (status === 'SUBSCRIBED') {
        ch.send({ type: 'broadcast', event: 'call', payload: signal })
        setTimeout(() => supabase.removeChannel(ch), 1000)
      }
    })
  }

  function openPeerChannel(peerId: string): Promise<RealtimeChannel> {
    return new Promise((resolve) => {
      const ch = supabase.channel(`call:${peerId}`)
      ch.subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          peerChannelRef.current = ch
          resolve(ch)
        }
      })
    })
  }

  function sendSignal(signal: CallSignal) {
    peerChannelRef.current?.send({ type: 'broadcast', event: 'call', payload: signal })
  }

  function clearCallRow(callId: string) {
    supabase.from('calls').delete().eq('id', callId).then(() => {}, () => {})
  }

  function cleanupCall() {
    const callId = sessionRef.current?.callId
    if (callId) clearCallRow(callId)
    stopRingtone()
    stopCallAudio()
    setCallOverlayActive(false)
    clearRingTimeout()
    clearConnectTimeout()
    pcRef.current?.close()
    pcRef.current = null
    localStreamRef.current?.getTracks().forEach((t) => t.stop())
    localStreamRef.current = null
    if (peerChannelRef.current) {
      supabase.removeChannel(peerChannelRef.current)
      peerChannelRef.current = null
    }
    pendingCandidatesRef.current = []
    pendingOfferRef.current = null
    if (localVideoRef.current) localVideoRef.current.srcObject = null
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null
    if (remoteAudioRef.current) remoteAudioRef.current.srcObject = null
    remoteStreamRef.current = null
    setMuted(false)
    setCameraOff(false)
    setSpeakerOn(false)
    setSpeakerphoneOn(false)
    facingModeRef.current = 'user'
    setSession(null)
  }

  async function setupPeerConnection(peerId: string, callId: string, kind: CallKind, stream: MediaStream) {
    startCallAudio()
    setSpeakerOn(kind === 'video')
    setSpeakerphoneOn(kind === 'video')

    const iceServers = await fetchIceServers()
    const pc = new RTCPeerConnection({ iceServers })
    pcRef.current = pc
    stream.getTracks().forEach((t) => pc.addTrack(t, stream))

    pc.onicecandidate = (e) => {
      if (!e.candidate) return
      const signal: CallSignal = { type: 'call-ice', callId, from: me!.id, candidate: e.candidate.toJSON() }
      if (peerChannelRef.current) sendSignal(signal)
      else sendOneOff(peerId, signal)
    }

    pc.ontrack = (e) => {
      const remoteStream = e.streams[0]
      remoteStreamRef.current = remoteStream
      if (kind === 'video' && remoteVideoRef.current) remoteVideoRef.current.srcObject = remoteStream
      if (remoteAudioRef.current) remoteAudioRef.current.srcObject = remoteStream
    }

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') {
        clearRingTimeout()
        clearConnectTimeout()
        setSession((s) => (s ? { ...s, status: 'connected', startedAt: s.startedAt ?? Date.now() } : s))
      } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        if (sessionRef.current?.callId === callId) cleanupCall()
      }
    }

    return pc
  }

  async function startOutgoingCall(req: OutgoingCallRequest) {
    if (!me || sessionRef.current) return
    const callId = crypto.randomUUID()
    setSession({
      callId,
      peer: req.peer,
      conversationId: req.conversationId,
      kind: req.kind,
      direction: 'outgoing',
      status: 'ringing',
      startedAt: null,
    })

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: req.kind === 'video' })
    } catch (err) {
      console.error('getUserMedia failed', err)
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      alert(`Não consegui acessar o microfone/câmera.\n(${reason})`)
      setSession(null)
      return
    }
    localStreamRef.current = stream
    if (req.kind === 'video' && localVideoRef.current) localVideoRef.current.srcObject = stream

    const pc = await setupPeerConnection(req.peer.id, callId, req.kind, stream)
    const offer = await pc.createOffer()
    await pc.setLocalDescription(offer)

    supabase.from('calls').insert({
      id: callId,
      caller_id: me.id,
      callee_id: req.peer.id,
      conversation_id: req.conversationId,
      kind: req.kind,
      status: 'ringing',
      offer_sdp: offer,
      caller_name: displayName(me),
      caller_avatar: me.avatar_url ?? null,
    }).then(({ error }) => {
      if (error) console.error('insert call row failed', error)
    })

    const ch = await openPeerChannel(req.peer.id)
    ch.send({
      type: 'broadcast',
      event: 'call',
      payload: {
        type: 'call-offer',
        callId,
        from: me.id,
        fromName: displayName(me),
        fromAvatar: me.avatar_url ?? null,
        conversationId: req.conversationId,
        kind: req.kind,
        sdp: offer,
      } as CallSignal,
    })

    ringTimeoutRef.current = setTimeout(() => {
      if (sessionRef.current?.callId === callId && sessionRef.current.status === 'ringing') {
        sendSignal({ type: 'call-end', callId, from: me.id })
        cleanupCall()
      }
    }, RING_TIMEOUT_MS)

    sendPush(
      [req.peer.id],
      req.kind === 'video' ? 'Chamada de vídeo' : 'Chamada de voz',
      `${displayName(me)} tá te ligando`,
      req.conversationId,
      'call',
    )
  }

  async function acceptIncomingCall() {
    const s = sessionRef.current
    if (!me || !s || s.direction !== 'incoming' || !pendingOfferRef.current) return
    clearRingTimeout()
    clearCallRow(s.callId)
    stopRingtone()
    setCallOverlayActive(false)

    let stream: MediaStream
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: s.kind === 'video' })
    } catch (err) {
      console.error('getUserMedia failed', err)
      const reason = err instanceof Error ? `${err.name}: ${err.message}` : String(err)
      alert(`Não consegui acessar o microfone/câmera.\n(${reason})`)
      sendOneOff(s.peer.id, { type: 'call-decline', callId: s.callId, from: me.id })
      cleanupCall()
      return
    }
    localStreamRef.current = stream
    if (s.kind === 'video' && localVideoRef.current) localVideoRef.current.srcObject = stream

    const pc = await setupPeerConnection(s.peer.id, s.callId, s.kind, stream)
    await pc.setRemoteDescription(new RTCSessionDescription(pendingOfferRef.current))
    for (const c of pendingCandidatesRef.current) {
      await pc.addIceCandidate(new RTCIceCandidate(c)).catch(() => {})
    }
    pendingCandidatesRef.current = []

    const answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    const ch = await openPeerChannel(s.peer.id)
    ch.send({
      type: 'broadcast',
      event: 'call',
      payload: { type: 'call-answer', callId: s.callId, from: me.id, sdp: answer } as CallSignal,
    })

    setSession((prev) => (prev ? { ...prev, status: 'connecting' } : prev))
    scheduleConnectTimeout(s.callId)
  }

  function declineIncomingCall() {
    const s = sessionRef.current
    if (!me || !s) return
    sendOneOff(s.peer.id, { type: 'call-decline', callId: s.callId, from: me.id })
    cleanupCall()
  }

  function endCall() {
    const s = sessionRef.current
    if (!me || !s) return
    const signal: CallSignal = { type: 'call-end', callId: s.callId, from: me.id }
    if (peerChannelRef.current) sendSignal(signal)
    else sendOneOff(s.peer.id, signal)
    cleanupCall()
  }

  function toggleMute() {
    const track = localStreamRef.current?.getAudioTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setMuted(!track.enabled)
  }

  function toggleCamera() {
    const track = localStreamRef.current?.getVideoTracks()[0]
    if (!track) return
    track.enabled = !track.enabled
    setCameraOff(!track.enabled)
  }

  function toggleSpeaker() {
    const next = !speakerOn
    setSpeakerOn(next)
    setSpeakerphoneOn(next)
  }

  async function flipCamera() {
    const s = sessionRef.current
    if (!s || s.kind !== 'video') return
    const next = facingModeRef.current === 'user' ? 'environment' : 'user'
    const oldTrack = localStreamRef.current?.getVideoTracks()[0]
    try {
      // fecha a camera atual antes de abrir a outra - varios aparelhos Android
      // nao deixam duas sessoes de camera abertas ao mesmo tempo e a troca falha calada
      if (oldTrack) {
        oldTrack.stop()
        localStreamRef.current?.removeTrack(oldTrack)
      }
      const newStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: next }, audio: false })
      const newTrack = newStream.getVideoTracks()[0]
      const sender = pcRef.current?.getSenders().find((sd) => sd.track?.kind === 'video')
      if (sender) await sender.replaceTrack(newTrack)
      localStreamRef.current?.addTrack(newTrack)
      if (localVideoRef.current && localVideoRef.current.srcObject !== localStreamRef.current) {
        localVideoRef.current.srcObject = localStreamRef.current
      }
      facingModeRef.current = next
    } catch (err) {
      console.error('flip camera failed', err)
      alert('Não consegui trocar de câmera nesse aparelho.')
    }
  }

  useImperativeHandle(ref, () => ({
    startCall: (req: OutgoingCallRequest) => {
      if (sessionRef.current) return
      startOutgoingCall(req)
    },
    hangup: () => {
      const cur = sessionRef.current
      if (!cur) return
      if (cur.direction === 'incoming' && cur.status === 'ringing') declineIncomingCall()
      else endCall()
    },
  }))

  function showIncomingFromRow(row: PendingCallRow) {
    if (sessionRef.current) return
    pendingOfferRef.current = row.offer_sdp
    triggerNudgeShake()
    startRingtone()
    setCallOverlayActive(true)
    setSession({
      callId: row.id,
      peer: { id: row.caller_id, name: row.caller_name, avatarUrl: row.caller_avatar },
      conversationId: row.conversation_id,
      kind: row.kind,
      direction: 'incoming',
      status: 'ringing',
      startedAt: null,
    })
    const remaining = RING_TIMEOUT_MS - (Date.now() - new Date(row.created_at).getTime())
    ringTimeoutRef.current = setTimeout(() => {
      if (sessionRef.current?.callId === row.id && sessionRef.current.status === 'ringing') cleanupCall()
    }, Math.max(remaining, 0))
  }

  async function checkPendingCall() {
    if (!me || sessionRef.current) return
    const { data } = await supabase
      .from('calls')
      .select('*')
      .eq('callee_id', me.id)
      .eq('status', 'ringing')
      .gte('created_at', new Date(Date.now() - RING_TIMEOUT_MS).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
    const row = (data?.[0] as PendingCallRow | undefined)
    if (row) showIncomingFromRow(row)
  }

  useEffect(() => {
    if (!me) return
    checkPendingCall()
    function onVisible() {
      if (document.visibilityState === 'visible') checkPendingCall()
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  useEffect(() => {
    if (!me) return
    const channel = supabase
      .channel(`call:${me.id}`)
      .on('broadcast', { event: 'call' }, ({ payload }) => {
        const signal = payload as CallSignal
        const current = sessionRef.current

        if (signal.type === 'call-offer') {
          if (current) {
            sendOneOff(signal.from, { type: 'call-decline', callId: signal.callId, from: me.id })
            return
          }
          pendingOfferRef.current = signal.sdp
          triggerNudgeShake()
          startRingtone()
          setCallOverlayActive(true)
          setSession({
            callId: signal.callId,
            peer: { id: signal.from, name: signal.fromName, avatarUrl: signal.fromAvatar },
            conversationId: signal.conversationId,
            kind: signal.kind,
            direction: 'incoming',
            status: 'ringing',
            startedAt: null,
          })
          ringTimeoutRef.current = setTimeout(() => {
            if (sessionRef.current?.callId === signal.callId && sessionRef.current.status === 'ringing') {
              cleanupCall()
            }
          }, RING_TIMEOUT_MS)
          return
        }

        if (!current || current.callId !== signal.callId) return

        if (signal.type === 'call-answer') {
          pcRef.current?.setRemoteDescription(new RTCSessionDescription(signal.sdp)).then(() => {
            const queued = pendingCandidatesRef.current
            pendingCandidatesRef.current = []
            queued.forEach((c) => pcRef.current?.addIceCandidate(new RTCIceCandidate(c)).catch(() => {}))
          })
          setSession((s) => (s ? { ...s, status: 'connecting' } : s))
          scheduleConnectTimeout(signal.callId)
        } else if (signal.type === 'call-ice') {
          if (pcRef.current?.remoteDescription) {
            pcRef.current.addIceCandidate(new RTCIceCandidate(signal.candidate)).catch(() => {})
          } else {
            pendingCandidatesRef.current.push(signal.candidate)
          }
        } else if (signal.type === 'call-end' || signal.type === 'call-decline') {
          cleanupCall()
        }
      })
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [me?.id])

  if (!session) return null

  const duration = session.startedAt ? formatDuration(Date.now() - session.startedAt) : null
  void tick // force re-render each second while connected

  return (
    <div className="call-overlay">
      {session.kind === 'video' && session.status === 'connected' && (
        <video ref={remoteVideoRef} className="call-remote-video" autoPlay playsInline />
      )}
      <audio ref={remoteAudioRef} autoPlay />

      {(session.kind === 'audio' || session.status !== 'connected') && (
        <div className="call-peer-info">
          <div className="call-peer-avatar">
            {session.peer.avatarUrl ? <img src={session.peer.avatarUrl} alt="" /> : <IconUser size={40} />}
          </div>
          <div className="call-peer-name">{session.peer.name}</div>
          <div className="call-peer-status">
            {session.status === 'ringing' && session.direction === 'incoming' && `chamada de ${session.kind === 'video' ? 'vídeo' : 'voz'} recebida`}
            {session.status === 'ringing' && session.direction === 'outgoing' && 'chamando...'}
            {session.status === 'connecting' && 'conectando...'}
            {session.status === 'connected' && duration}
          </div>
        </div>
      )}

      {session.kind === 'video' && session.status === 'connected' && (
        <video ref={localVideoRef} className="call-local-video" autoPlay playsInline muted />
      )}

      <div className="call-controls">
        {session.direction === 'incoming' && session.status === 'ringing' ? (
          <>
            <button type="button" className="call-btn call-btn-decline" onClick={declineIncomingCall}>
              <IconPhoneOff size={24} />
            </button>
            <button type="button" className="call-btn call-btn-accept" onClick={acceptIncomingCall}>
              <IconPhone size={24} />
            </button>
          </>
        ) : (
          <>
            <button type="button" className={`call-btn call-btn-secondary${muted ? ' active' : ''}`} onClick={toggleMute}>
              {muted ? <IconMicOff size={22} /> : <IconMic size={22} />}
            </button>
            {session.kind === 'video' ? (
              <>
                <button type="button" className={`call-btn call-btn-secondary${cameraOff ? ' active' : ''}`} onClick={toggleCamera}>
                  {cameraOff ? <IconVideoOff size={22} /> : <IconVideo size={22} />}
                </button>
                <button type="button" className="call-btn call-btn-secondary" onClick={flipCamera}>
                  <IconCameraFlip size={22} />
                </button>
              </>
            ) : (
              <button type="button" className={`call-btn call-btn-secondary${speakerOn ? ' active' : ''}`} onClick={toggleSpeaker}>
                {speakerOn ? <IconVolume size={22} /> : <IconVolumeOff size={22} />}
              </button>
            )}
            <button type="button" className="call-btn call-btn-decline" onClick={endCall}>
              <IconPhoneOff size={24} />
            </button>
          </>
        )}
      </div>
    </div>
  )
})
