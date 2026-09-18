import { useEffect, useRef, useState } from 'react'
import { Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant, type TrackPublication } from 'livekit-client'
import { supabase } from '../lib/supabase'
import { fetchLiveKitToken } from '../lib/livekit'
import { displayName } from '../lib/displayName'
import { AvatarBox } from './AvatarBox'
import { getPresenceColor } from '../lib/presence'
import {
  IconArrowLeft, IconCopy, IconGamepad, IconHash, IconHeadphones, IconLock, IconLockOpen,
  IconMic, IconMicOff, IconMonitorShare, IconPlus, IconSend, IconSettingsGear, IconVideo, IconVideoOff,
} from './icons'
import type { PlayChannel, PlayGroup, PlayMessage, Profile } from '../types'

type Props = {
  me: Profile
  onBack: () => void
}

type ChannelMessage = PlayMessage & { author?: Profile }

export function ThothPlay({ me, onBack }: Props) {
  const [myGroups, setMyGroups] = useState<PlayGroup[]>([])
  const [browseGroups, setBrowseGroups] = useState<PlayGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<PlayGroup | null>(null)
  const [channels, setChannels] = useState<PlayChannel[]>([])
  const [selectedChannel, setSelectedChannel] = useState<PlayChannel | null>(null)
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [draft, setDraft] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showJoin, setShowJoin] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinPassword, setJoinPassword] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)

  async function loadGroups() {
    setLoading(true)
    const { data: memberships } = await supabase.from('play_group_members').select('group_id').eq('user_id', me.id)
    const myIds = (memberships || []).map((m) => m.group_id as string)
    if (myIds.length) {
      const { data } = await supabase.from('play_groups').select('*').in('id', myIds).order('created_at', { ascending: false })
      setMyGroups((data || []) as PlayGroup[])
    } else {
      setMyGroups([])
    }
    const { data: open } = await supabase
      .from('play_groups')
      .select('*')
      .eq('is_closed', false)
      .order('created_at', { ascending: false })
      .limit(30)
    setBrowseGroups(((open || []) as PlayGroup[]).filter((g) => !myIds.includes(g.id)))
    setLoading(false)
  }

  useEffect(() => {
    loadGroups()
  }, [me.id])

  async function loadChannels(groupId: string) {
    const { data } = await supabase.from('play_channels').select('*').eq('group_id', groupId).order('position', { ascending: true })
    const list = (data || []) as PlayChannel[]
    setChannels(list)
    const firstText = list.find((c) => c.kind === 'text')
    if (firstText) openChannel(firstText)
  }

  async function openGroup(group: PlayGroup) {
    setSelectedGroup(group)
    setSelectedChannel(null)
    setMessages([])
    await loadChannels(group.id)
  }

  async function loadMessages(channelId: string) {
    const { data } = await supabase.from('play_messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: true }).limit(200)
    const rows = (data || []) as PlayMessage[]
    const authorIds = [...new Set(rows.map((r) => r.author_id))]
    let authors: Record<string, Profile> = {}
    if (authorIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', authorIds)
      authors = Object.fromEntries((profiles || []).map((p) => [p.id, p as Profile]))
    }
    setMessages(rows.map((r) => ({ ...r, author: authors[r.author_id] })))
  }

  function openChannel(channel: PlayChannel) {
    setSelectedChannel(channel)
    if (channel.kind === 'text') loadMessages(channel.id)
  }

  useEffect(() => {
    if (!selectedChannel || selectedChannel.kind !== 'text') return
    const channel = supabase
      .channel(`play-messages:${selectedChannel.id}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'play_messages', filter: `channel_id=eq.${selectedChannel.id}` },
        async (payload) => {
          const row = payload.new as PlayMessage
          let author = row.author_id === me.id ? me : undefined
          if (!author) {
            const { data } = await supabase.from('profiles').select('*').eq('id', row.author_id).maybeSingle()
            author = (data as Profile) || undefined
          }
          setMessages((prev) => [...prev, { ...row, author }])
        },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedChannel?.id])

  async function sendMessage() {
    if (!draft.trim() || !selectedChannel) return
    const content = draft.trim()
    setDraft('')
    const { error } = await supabase.from('play_messages').insert({ channel_id: selectedChannel.id, author_id: me.id, content })
    if (error) console.error('send play message failed', error)
  }

  async function handleCreateGroup(name: string, description: string, isClosed: boolean, password: string) {
    setCreateError(null)
    const { data, error } = await supabase.rpc('create_play_group', {
      p_name: name,
      p_description: description || null,
      p_is_closed: isClosed,
      p_password: isClosed ? password : null,
    })
    if (error) {
      console.error('create_play_group failed', error)
      setCreateError(error.message)
      return
    }
    setShowCreate(false)
    await loadGroups()
    if (data) openGroup(data as PlayGroup)
  }

  async function handleJoinGroup() {
    setJoinError(null)
    const { data, error } = await supabase.rpc('join_play_group', { p_invite_code: joinCode.trim(), p_password: joinPassword || null })
    if (error) {
      setJoinError(error.message.includes('senha') ? 'Senha incorreta.' : 'Grupo não encontrado.')
      return
    }
    setShowJoin(false)
    setJoinCode('')
    setJoinPassword('')
    await loadGroups()
    if (data) openGroup(data as PlayGroup)
  }

  if (selectedGroup) {
    return (
      <GroupView
        me={me}
        group={selectedGroup}
        channels={channels}
        selectedChannel={selectedChannel}
        messages={messages}
        draft={draft}
        onDraftChange={setDraft}
        onSend={sendMessage}
        onSelectChannel={openChannel}
        onBack={() => { setSelectedGroup(null); setSelectedChannel(null) }}
        onChannelsChange={() => loadChannels(selectedGroup.id)}
      />
    )
  }

  return (
    <main className="play-home">
      <header className="play-home-header">
        <button type="button" className="icon-btn" onClick={onBack} title="Voltar"><IconArrowLeft size={20} /></button>
        <h1><IconGamepad size={22} /> Thoth Play</h1>
      </header>
      <div className="play-home-actions">
        <button type="button" className="google-btn" onClick={() => setShowCreate(true)}><IconPlus size={16} /> Criar grupo</button>
        <button type="button" className="google-btn" onClick={() => setShowJoin(true)}>Entrar com código</button>
      </div>

      {loading ? (
        <p className="play-empty">carregando...</p>
      ) : (
        <>
          {myGroups.length > 0 && (
            <section className="play-group-section">
              <h2>Meus grupos</h2>
              <div className="play-group-grid">
                {myGroups.map((g) => (
                  <button key={g.id} type="button" className="play-group-card" onClick={() => openGroup(g)}>
                    <AvatarBox src={g.image_url} id={g.id} fallbackLetter={g.name[0]?.toUpperCase()} className="play-group-avatar" />
                    <span className="play-group-name">{g.name}</span>
                    {g.is_closed ? <IconLock size={13} /> : <IconLockOpen size={13} />}
                  </button>
                ))}
              </div>
            </section>
          )}
          <section className="play-group-section">
            <h2>Grupos abertos</h2>
            {browseGroups.length === 0 && <p className="play-empty">nenhum grupo aberto no momento</p>}
            <div className="play-group-grid">
              {browseGroups.map((g) => (
                <button key={g.id} type="button" className="play-group-card" onClick={() => openGroup(g)}>
                  <AvatarBox src={g.image_url} id={g.id} fallbackLetter={g.name[0]?.toUpperCase()} className="play-group-avatar" />
                  <span className="play-group-name">{g.name}</span>
                  <IconLockOpen size={13} />
                </button>
              ))}
            </div>
          </section>
        </>
      )}

      {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreate={handleCreateGroup} error={createError} />}
      {showJoin && (
        <div className="modal-backdrop" onClick={() => setShowJoin(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Entrar num grupo</h2>
            <input placeholder="Código do convite" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
            <input placeholder="Senha (se o grupo for fechado)" type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} style={{ marginTop: 8 }} />
            {joinError && <p className="auth-error">{joinError}</p>}
            <button type="button" className="google-btn" style={{ marginTop: 10 }} onClick={handleJoinGroup}>Entrar</button>
            <button type="button" className="modal-close" onClick={() => setShowJoin(false)}>fechar</button>
          </div>
        </div>
      )}
    </main>
  )
}

function CreateGroupModal({ onClose, onCreate, error }: { onClose: () => void; onCreate: (name: string, description: string, isClosed: boolean, password: string) => void; error: string | null }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isClosed, setIsClosed] = useState(false)
  const [password, setPassword] = useState('')

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Criar grupo Play</h2>
        <input placeholder="Nome do grupo" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginTop: 8 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input type="checkbox" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} />
          Grupo fechado (com senha)
        </label>
        {isClosed && (
          <input placeholder="Senha do grupo" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginTop: 8 }} />
        )}
        {error && <p className="auth-error">{error}</p>}
        <button
          type="button"
          className="google-btn"
          style={{ marginTop: 10 }}
          disabled={!name.trim() || (isClosed && !password.trim())}
          onClick={() => onCreate(name.trim(), description.trim(), isClosed, password)}
        >
          Criar
        </button>
        <button type="button" className="modal-close" onClick={onClose}>fechar</button>
      </div>
    </div>
  )
}

type GroupViewProps = {
  me: Profile
  group: PlayGroup
  channels: PlayChannel[]
  selectedChannel: PlayChannel | null
  messages: ChannelMessage[]
  draft: string
  onDraftChange: (v: string) => void
  onSend: () => void
  onSelectChannel: (c: PlayChannel) => void
  onBack: () => void
  onChannelsChange: () => void
}

type GroupMember = { profile: Profile; role: string }
type VoiceParticipantInfo = { id: string; name: string }

function GroupView({ me, group, channels, selectedChannel, messages, draft, onDraftChange, onSend, onSelectChannel, onBack, onChannelsChange }: GroupViewProps) {
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelKind, setNewChannelKind] = useState<'text' | 'voice'>('text')
  const [copied, setCopied] = useState(false)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [memberTab, setMemberTab] = useState<'group' | 'voice'>('group')
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipantInfo[]>([])
  const textChannels = channels.filter((c) => c.kind === 'text')
  const voiceChannels = channels.filter((c) => c.kind === 'voice')

  useEffect(() => {
    setVoiceParticipants([])
  }, [selectedChannel?.id])

  useEffect(() => {
    let cancelled = false
    async function loadMembers() {
      const { data: rows } = await supabase.from('play_group_members').select('user_id, role').eq('group_id', group.id)
      const ids = (rows || []).map((r) => r.user_id as string)
      if (!ids.length) { setMembers([]); return }
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids)
      if (cancelled) return
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p as Profile]))
      setMembers(
        (rows || [])
          .map((r) => ({ profile: profileMap[r.user_id as string], role: r.role as string }))
          .filter((m): m is GroupMember => !!m.profile),
      )
    }
    loadMembers()
    return () => { cancelled = true }
  }, [group.id])

  const onlineMembers = members.filter((m) => getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) !== 'offline')
  const offlineMembers = members.filter((m) => getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) === 'offline')
  const inVoiceIds = new Set(voiceParticipants.map((p) => p.id))

  async function createChannel() {
    if (!newChannelName.trim()) return
    const { error } = await supabase.from('play_channels').insert({
      group_id: group.id, name: newChannelName.trim(), kind: newChannelKind, position: channels.length,
    })
    if (error) { console.error('create channel failed', error); return }
    setNewChannelName('')
    setShowNewChannel(false)
    onChannelsChange()
  }

  function copyInvite() {
    navigator.clipboard?.writeText(group.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  return (
    <main className="play-group-view">
      <aside className="play-icon-rail">
        <button type="button" className="play-icon-rail-back" onClick={onBack} title="Voltar aos grupos"><IconArrowLeft size={18} /></button>
        <button type="button" className="play-icon-rail-group" title={group.name}>
          <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
        </button>
        <span className="play-icon-rail-label">Sobre o grupo</span>
      </aside>

      <div className="play-group-main">
        <header className="play-group-topbar">
          <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
          <div className="play-group-topbar-copy">
            <div className="play-group-topbar-title">
              <strong>{group.name}</strong>
              <button type="button" className="play-invite-btn" onClick={copyInvite} title="Copiar código de convite">
                <IconCopy size={12} /> {copied ? 'copiado!' : group.invite_code}
              </button>
              <IconSettingsGear size={16} />
            </div>
            {group.description && <span>{group.description}</span>}
          </div>
        </header>

        <div className="play-group-body">
          <aside className="play-channel-sidebar">
            <div className="play-channel-group-title">
              <span>Canais de texto</span>
              <button type="button" onClick={() => { setNewChannelKind('text'); setShowNewChannel(true) }}><IconPlus size={14} /></button>
            </div>
            {textChannels.map((c) => (
              <button key={c.id} type="button" className={`play-channel-item${selectedChannel?.id === c.id ? ' active' : ''}`} onClick={() => onSelectChannel(c)}>
                <IconHash size={15} /> {c.name}
              </button>
            ))}
            <div className="play-channel-group-title">
              <span>Canais de voz</span>
              <button type="button" onClick={() => { setNewChannelKind('voice'); setShowNewChannel(true) }}><IconPlus size={14} /></button>
            </div>
            {voiceChannels.map((c) => (
              <div key={c.id}>
                <button type="button" className={`play-channel-item${selectedChannel?.id === c.id ? ' active' : ''}`} onClick={() => onSelectChannel(c)}>
                  <IconVideo size={15} /> {c.name}
                </button>
                {selectedChannel?.id === c.id && voiceParticipants.map((p) => (
                  <div key={p.id} className="play-channel-voice-member">{p.name}</div>
                ))}
              </div>
            ))}
          </aside>

          {!selectedChannel && <div className="play-channel-empty"><p>Escolha um canal</p></div>}

          {selectedChannel?.kind === 'text' && (
            <div className="play-text-channel">
              <header className="play-text-channel-header">
                <div><IconHash size={17} /> <strong>{selectedChannel.name}</strong></div>
                <span>Conversa geral do {group.name}</span>
              </header>
              <div className="play-messages">
                {messages.length === 0 && <p className="play-empty">nenhuma mensagem ainda</p>}
                {messages.map((m) => (
                  <div key={m.id} className="play-message">
                    <AvatarBox src={m.author?.avatar_url} id={m.author_id} fallbackLetter={(m.author ? displayName(m.author) : '?')[0]?.toUpperCase()} className="avatar-sm" />
                    <div className="play-message-body">
                      <strong>{m.author ? displayName(m.author) : '...'}</strong>
                      <p>{m.content}</p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="play-composer">
                <input
                  placeholder={`Conversar no #${selectedChannel.name}`}
                  value={draft}
                  onChange={(e) => onDraftChange(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter') onSend() }}
                />
                <button type="button" onClick={onSend}><IconSend size={18} /></button>
              </div>
            </div>
          )}

          {selectedChannel?.kind === 'voice' && (
            <VoiceChannel key={selectedChannel.id} me={me} channel={selectedChannel} onParticipantsChange={setVoiceParticipants} />
          )}

          <aside className="play-member-sidebar">
            <div className="play-member-tabs">
              <button type="button" className={memberTab === 'group' ? 'active' : ''} onClick={() => setMemberTab('group')}>No grupo</button>
              <button type="button" className={memberTab === 'voice' ? 'active' : ''} onClick={() => setMemberTab('voice')}>Na voz</button>
            </div>
            {memberTab === 'group' ? (
              <>
                {onlineMembers.length > 0 && (
                  <div className="play-member-group-title">ONLINE — {onlineMembers.length}</div>
                )}
                {onlineMembers.map((m) => (
                  <div key={m.profile.id} className="play-member-row">
                    <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" />
                    <span>{displayName(m.profile)}</span>
                    {inVoiceIds.has(m.profile.id) && <IconHeadphones size={14} />}
                  </div>
                ))}
                {offlineMembers.length > 0 && (
                  <div className="play-member-group-title">OFFLINE — {offlineMembers.length}</div>
                )}
                {offlineMembers.map((m) => (
                  <div key={m.profile.id} className="play-member-row offline">
                    <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" />
                    <span>{displayName(m.profile)}</span>
                  </div>
                ))}
              </>
            ) : (
              <>
                {voiceParticipants.length === 0 && <p className="play-empty">ninguém na voz agora</p>}
                {voiceParticipants.map((p) => (
                  <div key={p.id} className="play-member-row">
                    <AvatarBox src={p.id === me.id ? me.avatar_url : null} id={p.id} fallbackLetter={p.name[0]?.toUpperCase()} className="avatar-sm" />
                    <span>{p.name}</span>
                    <IconHeadphones size={14} />
                  </div>
                ))}
              </>
            )}
          </aside>
        </div>
      </div>

      {showNewChannel && (
        <div className="modal-backdrop" onClick={() => setShowNewChannel(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Criar canal de {newChannelKind === 'text' ? 'texto' : 'voz'}</h2>
            <input placeholder="Nome do canal" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} />
            <button type="button" className="google-btn" style={{ marginTop: 10 }} onClick={createChannel}>Criar</button>
            <button type="button" className="modal-close" onClick={() => setShowNewChannel(false)}>fechar</button>
          </div>
        </div>
      )}
    </main>
  )
}

type ParticipantTile = {
  id: string
  name: string
  isLocal: boolean
  micOn: boolean
  videoTrack?: Track
}

function VoiceChannel({ me, channel, onParticipantsChange }: { me: Profile; channel: PlayChannel; onParticipantsChange: (p: VoiceParticipantInfo[]) => void }) {
  const roomRef = useRef<Room | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [screenEnabled, setScreenEnabled] = useState(false)
  const [participants, setParticipants] = useState<ParticipantTile[]>([])
  const videoRefs = useRef<Record<string, HTMLVideoElement | null>>({})

  function syncParticipants(room: Room) {
    const all: (LocalParticipant | RemoteParticipant)[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())]
    const tiles = all.map((p) => {
      const pubs = p.trackPublications.values() as IterableIterator<TrackPublication>
      const videoPub = Array.from(pubs).find(
        (pub) => (pub.source === Track.Source.Camera || pub.source === Track.Source.ScreenShare) && !!pub.track,
      )
      return {
        id: p.identity,
        name: p.name || p.identity,
        isLocal: p === room.localParticipant,
        micOn: p.isMicrophoneEnabled,
        videoTrack: videoPub?.track,
      }
    })
    setParticipants(tiles)
    onParticipantsChange(tiles.map((t) => ({ id: t.id, name: t.name })))
  }

  useEffect(() => {
    let cancelled = false
    const room = new Room()
    roomRef.current = room

    room
      .on(RoomEvent.ParticipantConnected, () => syncParticipants(room))
      .on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room))
      .on(RoomEvent.TrackSubscribed, () => syncParticipants(room))
      .on(RoomEvent.TrackUnsubscribed, () => syncParticipants(room))
      .on(RoomEvent.TrackMuted, () => syncParticipants(room))
      .on(RoomEvent.TrackUnmuted, () => syncParticipants(room))
      .on(RoomEvent.LocalTrackPublished, () => syncParticipants(room))
      .on(RoomEvent.LocalTrackUnpublished, () => syncParticipants(room))

    ;(async () => {
      try {
        const { token, url } = await fetchLiveKitToken(channel.id)
        if (cancelled) return
        await room.connect(url, token)
        await room.localParticipant.setMicrophoneEnabled(true)
        if (cancelled) { room.disconnect(); return }
        setConnected(true)
        syncParticipants(room)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'falha ao conectar')
      } finally {
        if (!cancelled) setConnecting(false)
      }
    })()

    return () => {
      cancelled = true
      room.disconnect()
      roomRef.current = null
    }
  }, [channel.id])

  useEffect(() => {
    for (const p of participants) {
      const el = videoRefs.current[p.id]
      if (el && p.videoTrack) p.videoTrack.attach(el)
    }
  }, [participants])

  async function toggleMic() {
    const room = roomRef.current
    if (!room) return
    const next = !micEnabled
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicEnabled(next)
    syncParticipants(room)
  }

  async function toggleCamera() {
    const room = roomRef.current
    if (!room) return
    const next = !cameraEnabled
    await room.localParticipant.setCameraEnabled(next)
    setCameraEnabled(next)
    syncParticipants(room)
  }

  async function toggleScreenShare() {
    const room = roomRef.current
    if (!room) return
    const next = !screenEnabled
    try {
      await room.localParticipant.setScreenShareEnabled(next)
      setScreenEnabled(next)
      syncParticipants(room)
    } catch {
      // usuario cancelou o picker de tela
    }
  }

  return (
    <div className="play-voice-channel">
      <header className="play-text-channel-header"><IconVideo size={17} /> {channel.name}</header>
      {connecting && <p className="play-empty">conectando...</p>}
      {error && <p className="play-empty error">{error}</p>}
      {connected && (
        <>
          <div className="play-voice-grid">
            {participants.map((p) => (
              <div key={p.id} className="play-voice-tile">
                {p.videoTrack ? (
                  <video ref={(el) => { videoRefs.current[p.id] = el; if (el && p.videoTrack) p.videoTrack.attach(el) }} autoPlay playsInline muted={p.isLocal} />
                ) : (
                  <AvatarBox src={p.isLocal ? me.avatar_url : null} id={p.id} fallbackLetter={p.name[0]?.toUpperCase()} className="play-voice-avatar" />
                )}
                <span className="play-voice-name">
                  {p.micOn ? <IconMic size={13} /> : <IconMicOff size={13} />} {p.name}{p.isLocal ? ' (você)' : ''}
                </span>
              </div>
            ))}
          </div>
          <div className="play-voice-controls">
            <button type="button" className={`icon-btn${micEnabled ? ' active' : ''}`} onClick={toggleMic} title={micEnabled ? 'Mutar' : 'Ativar microfone'}>
              {micEnabled ? <IconMic size={20} /> : <IconMicOff size={20} />}
            </button>
            <button type="button" className={`icon-btn${cameraEnabled ? ' active' : ''}`} onClick={toggleCamera} title={cameraEnabled ? 'Desligar câmera' : 'Ligar câmera'}>
              {cameraEnabled ? <IconVideo size={20} /> : <IconVideoOff size={20} />}
            </button>
            <button type="button" className={`icon-btn${screenEnabled ? ' active' : ''}`} onClick={toggleScreenShare} title="Compartilhar tela">
              <IconMonitorShare size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
