import { useEffect, useRef, useState, type ChangeEvent } from 'react'
import { Room, RoomEvent, Track, type RemoteParticipant, type LocalParticipant, type TrackPublication } from 'livekit-client'
import { supabase } from '../lib/supabase'
import { fetchLiveKitToken } from '../lib/livekit'
import { displayName } from '../lib/displayName'
import { AvatarBox } from './AvatarBox'
import { getPresenceColor } from '../lib/presence'
import { ReplayPlayer, type ReplayEvent } from './ReplayPlayer'
import { StyledName, NAME_FONTS, NAME_EFFECTS } from './StyledName'
import { uploadImage } from '../lib/uploadImage'
import {
  IconArrowLeft, IconCopy, IconGamepad, IconHash, IconHeadphones, IconLock, IconLockOpen,
  IconMic, IconMicOff, IconMonitorShare, IconPhoneOff, IconPlus, IconSend, IconSettingsGear, IconVideo, IconVideoOff,
} from './icons'
import type { PlayChannel, PlayGroup, PlayMessage, PlayProfile, Profile } from '../types'

// A identidade dentro do Thoth Play e separada da conta principal - editar nome/
// foto/status aqui dentro nao mexe no perfil usado no chat/mensageiro. So cai no
// perfil principal quando ainda nao personalizou nada especifico do Play.
function mergePlayProfile(base: Profile, override: PlayProfile | null | undefined): Profile {
  if (!override) return base
  return {
    ...base,
    display_name: override.display_name || base.display_name,
    avatar_url: override.avatar_url || base.avatar_url,
    status: override.status || base.status,
    name_style_font: override.name_style_font || base.name_style_font,
    name_style_effect: override.name_style_effect || base.name_style_effect,
    name_style_color: override.name_style_color || base.name_style_color,
  }
}

async function fetchPlayProfiles(ids: string[]): Promise<Record<string, PlayProfile>> {
  if (!ids.length) return {}
  const { data } = await supabase.from('play_profiles').select('*').in('user_id', ids)
  return Object.fromEntries(((data || []) as PlayProfile[]).map((p) => [p.user_id, p]))
}

const REPLAY_WINDOW_MS = 20000

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
  const [hasReplaySet, setHasReplaySet] = useState<Set<string>>(new Set())
  const [draft, setDraft] = useState('')
  const [liveTyping, setLiveTyping] = useState<Record<string, string>>({})
  const messagesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const replayBuffer = useRef<ReplayEvent[]>([])
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

  async function fetchChannels(groupId: string) {
    const { data } = await supabase.from('play_channels').select('*').eq('group_id', groupId).order('position', { ascending: true })
    const list = (data || []) as PlayChannel[]
    setChannels(list)
    return list
  }

  async function loadChannels(groupId: string) {
    const list = await fetchChannels(groupId)
    const firstText = list.find((c) => c.kind === 'text')
    if (firstText) openChannel(firstText)
  }

  async function openGroup(group: PlayGroup) {
    setSelectedGroup(group)
    setSelectedChannel(null)
    setMessages([])
    await loadChannels(group.id)
  }

  // Sincroniza a lista de canais em tempo real - sem isso, um canal criado em
  // outra aba/dispositivo (ou por outro membro) so aparecia se vc reabrisse o
  // grupo do zero.
  useEffect(() => {
    if (!selectedGroup) return
    const channel = supabase
      .channel(`play-channels:${selectedGroup.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'play_channels', filter: `group_id=eq.${selectedGroup.id}` },
        () => fetchChannels(selectedGroup.id),
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [selectedGroup?.id])

  async function loadMessages(channelId: string) {
    const { data } = await supabase.from('play_messages').select('*').eq('channel_id', channelId).order('created_at', { ascending: true }).limit(200)
    const rows = (data || []) as PlayMessage[]
    const authorIds = [...new Set(rows.map((r) => r.author_id))]
    let authors: Record<string, Profile> = {}
    if (authorIds.length) {
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', authorIds)
      const playProfiles = await fetchPlayProfiles(authorIds)
      authors = Object.fromEntries((profiles || []).map((p) => [p.id, mergePlayProfile(p as Profile, playProfiles[p.id])]))
    }
    setMessages(rows.map((r) => ({ ...r, author: authors[r.author_id] })))
    if (rows.length) {
      const { data: replays } = await supabase.from('play_message_replays').select('message_id').in('message_id', rows.map((r) => r.id))
      setHasReplaySet(new Set((replays || []).map((r) => r.message_id as string)))
    } else {
      setHasReplaySet(new Set())
    }
  }

  function openChannel(channel: PlayChannel) {
    setSelectedChannel(channel)
    if (channel.kind === 'text') loadMessages(channel.id)
  }

  useEffect(() => {
    replayBuffer.current = []
    setLiveTyping({})
    if (!selectedChannel || selectedChannel.kind !== 'text') {
      messagesChannelRef.current = null
      return
    }
    const channel = supabase
      .channel(`play-messages:${selectedChannel.id}`)
      .on('broadcast', { event: 'typing' }, ({ payload }) => {
        const { userId, text } = payload as { userId: string; text: string }
        if (userId === me.id) return
        setLiveTyping((prev) => {
          const next = { ...prev }
          if (text) next[userId] = text
          else delete next[userId]
          return next
        })
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'play_messages', filter: `channel_id=eq.${selectedChannel.id}` },
        async (payload) => {
          const row = payload.new as PlayMessage
          const { data } = await supabase.from('profiles').select('*').eq('id', row.author_id).maybeSingle()
          const playProfiles = await fetchPlayProfiles([row.author_id])
          const author = data ? mergePlayProfile(data as Profile, playProfiles[row.author_id]) : undefined
          setMessages((prev) => (prev.some((m) => m.id === row.id) ? prev : [...prev, { ...row, author }]))
          setLiveTyping((prev) => {
            const next = { ...prev }
            delete next[row.author_id]
            return next
          })
        },
      )
      .subscribe()
    messagesChannelRef.current = channel
    return () => {
      supabase.removeChannel(channel)
      messagesChannelRef.current = null
    }
  }, [selectedChannel?.id])

  function broadcastTyping(text: string) {
    messagesChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: me.id, text } })
  }

  function handleDraftChange(text: string) {
    setDraft(text)
    const now = Date.now()
    replayBuffer.current.push({ t: now, text })
    replayBuffer.current = replayBuffer.current.filter((e) => now - e.t <= REPLAY_WINDOW_MS)
    broadcastTyping(text)
  }

  async function sendMessage() {
    if (!draft.trim() || !selectedChannel) return
    const content = draft.trim()
    const eventsToStore = [...replayBuffer.current]
    replayBuffer.current = []
    broadcastTyping('')
    setDraft('')
    const { data: msg, error } = await supabase
      .from('play_messages')
      .insert({ channel_id: selectedChannel.id, author_id: me.id, content })
      .select()
      .single()
    if (error) { console.error('send play message failed', error); return }
    if (msg && eventsToStore.length > 1) {
      await supabase.from('play_message_replays').insert({ message_id: msg.id, events: eventsToStore })
      setHasReplaySet((prev) => new Set(prev).add(msg.id))
    }
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
        hasReplaySet={hasReplaySet}
        liveTyping={liveTyping}
        draft={draft}
        onDraftChange={handleDraftChange}
        onSend={sendMessage}
        onSelectChannel={openChannel}
        onBack={() => { setSelectedGroup(null); setSelectedChannel(null) }}
        onChannelsChange={() => fetchChannels(selectedGroup.id)}
        onGroupUpdate={(patch) => setSelectedGroup((g) => (g ? { ...g, ...patch } : g))}
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
  hasReplaySet: Set<string>
  liveTyping: Record<string, string>
  draft: string
  onDraftChange: (v: string) => void
  onSend: () => void
  onSelectChannel: (c: PlayChannel) => void
  onBack: () => void
  onChannelsChange: () => void
  onGroupUpdate: (patch: Partial<PlayGroup>) => void
}

type GroupMember = { profile: Profile; role: string }
type VoiceParticipantInfo = { id: string; name: string }

function GroupView({ me, group, channels, selectedChannel, messages, hasReplaySet, liveTyping, draft, onDraftChange, onSend, onSelectChannel, onBack, onChannelsChange, onGroupUpdate }: GroupViewProps) {
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [joinedVoiceChannel, setJoinedVoiceChannel] = useState<PlayChannel | null>(null)
  const [openReplayId, setOpenReplayId] = useState<string | null>(null)
  const [replayEvents, setReplayEvents] = useState<ReplayEvent[] | null>(null)
  const [showProfile, setShowProfile] = useState(false)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
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
  }, [joinedVoiceChannel?.id])

  useEffect(() => {
    // O indicador de compartilhamento de tela do WebView2 mostra o titulo do
    // documento (quando disponivel) em vez do nome do app - deixa mais claro
    // qual grupo esta sendo compartilhado.
    const prevTitle = document.title
    document.title = group.name
    return () => { document.title = prevTitle }
  }, [group.name])

  useEffect(() => {
    let cancelled = false
    async function loadMembers() {
      const { data: rows } = await supabase.from('play_group_members').select('user_id, role').eq('group_id', group.id)
      const ids = (rows || []).map((r) => r.user_id as string)
      if (!ids.length) { setMembers([]); return }
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids)
      const playProfiles = await fetchPlayProfiles(ids)
      if (cancelled) return
      const profileMap = Object.fromEntries(
        (profiles || []).map((p) => [p.id, mergePlayProfile(p as Profile, playProfiles[p.id])]),
      )
      setMembers(
        (rows || [])
          .map((r) => ({ profile: profileMap[r.user_id as string], role: r.role as string }))
          .filter((m): m is GroupMember => !!m.profile),
      )
    }
    loadMembers()
    const channel = supabase
      .channel(`play-profiles-refresh:${group.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_profiles' }, () => loadMembers())
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [group.id])

  const onlineMembers = members.filter((m) => getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) !== 'offline')
  const offlineMembers = members.filter((m) => getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) === 'offline')
  const inVoiceIds = new Set(voiceParticipants.map((p) => p.id))
  const myRole = members.find((m) => m.profile.id === me.id)?.role || null
  const myPlayProfile = members.find((m) => m.profile.id === me.id)?.profile || me

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

  function handleSelectChannel(c: PlayChannel) {
    onSelectChannel(c)
    if (c.kind === 'voice' && joinedVoiceChannel?.id !== c.id) {
      setJoinedVoiceChannel(c)
    }
  }

  function leaveVoice() {
    setJoinedVoiceChannel(null)
  }

  async function openReplay(msg: ChannelMessage) {
    if (openReplayId === msg.id) { setOpenReplayId(null); return }
    setOpenReplayId(msg.id)
    setReplayEvents(null)
    const { data } = await supabase.from('play_message_replays').select('events').eq('message_id', msg.id).maybeSingle()
    setReplayEvents((data?.events as ReplayEvent[]) || [])
  }

  function copyInvite() {
    navigator.clipboard?.writeText(group.invite_code)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  const typingNames = Object.entries(liveTyping)
    .map(([userId, text]) => ({ name: members.find((m) => m.profile.id === userId)?.profile ? displayName(members.find((m) => m.profile.id === userId)!.profile) : 'alguém', text }))

  return (
    <main className="play-group-view">
      <aside className="play-icon-rail">
        <button type="button" className="play-icon-rail-back" onClick={onBack} title="Voltar aos grupos"><IconArrowLeft size={18} /></button>
        <button type="button" className="play-icon-rail-group" title={group.name} onClick={() => setShowGroupInfo(true)}>
          <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
        </button>
        <button type="button" className="play-icon-rail-label play-icon-rail-label-btn" onClick={() => setShowGroupInfo(true)}>Sobre o grupo</button>
        <div className="play-icon-rail-spacer" />
        <button type="button" className="play-icon-rail-group play-icon-rail-profile" title="Perfil" onClick={() => setShowProfile(true)}>
          <AvatarBox src={myPlayProfile.avatar_url} id={me.id} fallbackLetter={displayName(myPlayProfile)[0]?.toUpperCase()} className="play-group-avatar" />
        </button>
        <span className="play-icon-rail-label">Perfil</span>
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
              <button type="button" className="play-icon-rail-label-btn" onClick={() => setShowGroupInfo(true)} title="Configurações do grupo">
                <IconSettingsGear size={16} />
              </button>
            </div>
            {group.description && <span>{group.description}</span>}
          </div>
        </header>

        <div className="play-group-body">
          <div className="play-channel-sidebar-wrap">
            <aside className="play-channel-sidebar">
              <div className="play-channel-group-title">
                <span>Canais de texto</span>
                <button type="button" onClick={() => { setNewChannelKind('text'); setShowNewChannel(true) }}><IconPlus size={14} /></button>
              </div>
              {textChannels.map((c) => (
                <button key={c.id} type="button" className={`play-channel-item${selectedChannel?.id === c.id ? ' active' : ''}`} onClick={() => handleSelectChannel(c)}>
                  <IconHash size={15} /> {c.name}
                </button>
              ))}
              <div className="play-channel-group-title">
                <span>Canais de voz</span>
                <button type="button" onClick={() => { setNewChannelKind('voice'); setShowNewChannel(true) }}><IconPlus size={14} /></button>
              </div>
              {voiceChannels.map((c) => (
                <div key={c.id}>
                  <button type="button" className={`play-channel-item${selectedChannel?.id === c.id ? ' active' : ''}`} onClick={() => handleSelectChannel(c)}>
                    <IconVideo size={15} /> {c.name}
                  </button>
                  {joinedVoiceChannel?.id === c.id && voiceParticipants.map((p) => (
                    <div key={p.id} className="play-channel-voice-member">{p.name}</div>
                  ))}
                </div>
              ))}
            </aside>
            <GroupInfoPanel
              group={group}
              myRole={myRole}
              open={showGroupInfo}
              onClose={() => setShowGroupInfo(false)}
              onUpdate={onGroupUpdate}
            />
          </div>

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
                    <div className="play-message-body">
                      <div className="play-message-row">
                        <strong>
                          {m.author ? (
                            <StyledName name={displayName(m.author)} font={m.author.name_style_font} effect={m.author.name_style_effect} color={m.author.name_style_color} />
                          ) : '...'}
                        </strong>
                        <span className="play-message-time">{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <button type="button" className="play-replay-btn" onClick={() => openReplay(m)}>
                          replay{hasReplaySet.has(m.id) && <span className="play-replay-flag">!</span>}
                        </button>
                      </div>
                      {openReplayId === m.id && replayEvents && replayEvents.length > 1 ? (
                        <ReplayPlayer events={replayEvents} />
                      ) : (
                        <p>{m.content}</p>
                      )}
                    </div>
                  </div>
                ))}
                {typingNames.map((t, i) => (
                  <div key={i} className="play-message play-message-live">
                    <div className="play-message-body">
                      <div className="play-message-row"><strong>{t.name}</strong><span className="play-message-time">digitando...</span></div>
                      <p>{t.text}</p>
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

          {selectedChannel?.kind === 'voice' && joinedVoiceChannel?.id !== selectedChannel.id && (
            <div className="play-channel-empty">
              <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={() => setJoinedVoiceChannel(selectedChannel)}>Entrar na chamada</button>
            </div>
          )}

          {joinedVoiceChannel && (
            <div style={{ display: selectedChannel?.id === joinedVoiceChannel.id ? 'flex' : 'none', flex: 1, minWidth: 0, flexDirection: 'column', overflow: 'hidden' }}>
              <VoiceChannel key={joinedVoiceChannel.id} me={me} channel={joinedVoiceChannel} onParticipantsChange={setVoiceParticipants} onLeave={leaveVoice} />
            </div>
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
                    <span><StyledName name={displayName(m.profile)} font={m.profile.name_style_font} effect={m.profile.name_style_effect} color={m.profile.name_style_color} /></span>
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

      <ProfilePanel me={me} open={showProfile} onClose={() => setShowProfile(false)} />
    </main>
  )
}

function GroupInfoPanel({ group, myRole, open, onClose, onUpdate }: {
  group: PlayGroup; myRole: string | null; open: boolean; onClose: () => void; onUpdate: (patch: Partial<PlayGroup>) => void
}) {
  const isOwner = myRole === 'owner'
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)

  useEffect(() => {
    setName(group.name)
    setDescription(group.description || '')
  }, [group.id, open])

  async function save() {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('play_groups').update({ name: name.trim(), description: description.trim() || null }).eq('id', group.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onUpdate({ name: name.trim(), description: description.trim() || null })
  }

  async function deleteGroup() {
    await supabase.from('play_groups').delete().eq('id', group.id)
    onClose()
    window.location.reload()
  }

  return (
    <div className={`new-conv-panel${open ? ' open' : ''}`}>
      <div className="new-conv-header">
        <button type="button" className="icon-btn" onClick={onClose}><IconArrowLeft size={20} /></button>
        <strong>Sobre o grupo</strong>
      </div>
      <div className="play-group-info-body">
        <div className="play-group-info-avatar">
          <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
        </div>
        {isOwner ? (
          <>
            <label>Nome</label>
            <input value={name} onChange={(e) => setName(e.target.value)} />
            <label style={{ marginTop: 10 }}>Descrição</label>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sem descrição" />
            {error && <p className="auth-error">{error}</p>}
            <button type="button" className="google-btn" style={{ marginTop: 10 }} disabled={saving || !name.trim()} onClick={save}>
              {saving ? 'Salvando...' : 'Salvar'}
            </button>
          </>
        ) : (
          <>
            <h2 style={{ margin: '8px 0 4px' }}>{group.name}</h2>
            <p style={{ color: 'var(--text-secondary)' }}>{group.description || 'sem descrição'}</p>
          </>
        )}
        <div className="play-group-info-badge">
          {group.is_closed ? <><IconLock size={13} /> Grupo fechado</> : <><IconLockOpen size={13} /> Grupo aberto</>}
        </div>

        {isOwner && (
          confirmDelete ? (
            <div style={{ marginTop: 20 }}>
              <p style={{ color: 'var(--danger, #e5484d)' }}>Excluir o grupo apaga todos os canais e mensagens. Não dá pra desfazer.</p>
              <button type="button" className="settings-danger-btn" onClick={deleteGroup}>Confirmar exclusão</button>
              <button type="button" className="modal-close" onClick={() => setConfirmDelete(false)}>cancelar</button>
            </div>
          ) : (
            <button type="button" className="settings-danger-btn" style={{ marginTop: 20 }} onClick={() => setConfirmDelete(true)}>Excluir grupo</button>
          )
        )}
      </div>
    </div>
  )
}

function ProfilePanel({ me, open, onClose }: { me: Profile; open: boolean; onClose: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatar_url ?? null)
  const [displayNameDraft, setDisplayNameDraft] = useState(me.display_name || me.username)
  const [statusDraft, setStatusDraft] = useState(me.status || '')
  const [font, setFont] = useState<string | null>(null)
  const [effect, setEffect] = useState<'solid' | 'gradient' | 'neon' | 'prism' | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setLoaded(false)
    supabase.from('play_profiles').select('*').eq('user_id', me.id).maybeSingle().then(({ data }) => {
      const p = data as PlayProfile | null
      setAvatarUrl(p?.avatar_url || me.avatar_url || null)
      setDisplayNameDraft(p?.display_name || me.display_name || me.username)
      setStatusDraft(p?.status || me.status || '')
      setFont(p?.name_style_font || null)
      setEffect(p?.name_style_effect || null)
      setColor(p?.name_style_color || null)
      setLoaded(true)
    })
  }, [me.id, open])

  async function upsert(patch: Partial<PlayProfile>) {
    await supabase.from('play_profiles').upsert({ user_id: me.id, ...patch }, { onConflict: 'user_id' })
  }

  async function save() {
    setSaving(true)
    await upsert({
      display_name: displayNameDraft.trim() || null,
      status: statusDraft.trim() || null,
      avatar_url: avatarUrl,
      name_style_font: font,
      name_style_effect: effect,
      name_style_color: color,
    })
    setSaving(false)
  }

  async function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file, me.id, 'play-avatar')
      setAvatarUrl(url)
      await upsert({ avatar_url: url })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={`new-conv-panel${open ? ' open' : ''}`}>
      <div className="new-conv-header">
        <button type="button" className="icon-btn" onClick={onClose}><IconArrowLeft size={20} /></button>
        <strong>Perfil</strong>
      </div>
      <div className="play-group-info-body">
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Esse perfil é só do Thoth Play - editar aqui não muda seu perfil no resto do ThothChat.</p>
        <button type="button" className="play-group-info-avatar" onClick={() => fileRef.current?.click()} style={{ border: 0, cursor: 'pointer' }}>
          <AvatarBox src={avatarUrl} id={me.id} fallbackLetter={(displayNameDraft || '?')[0]?.toUpperCase()} className="play-group-avatar" />
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarPick} />
        {uploading && <p className="play-empty">enviando foto...</p>}
        <label>Nome de exibição</label>
        <input value={displayNameDraft} onChange={(e) => setDisplayNameDraft(e.target.value)} />
        <label style={{ marginTop: 10 }}>Status</label>
        <input value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} placeholder="De boa" />

        {loaded && (
          <>
            <div className="name-style-preview">
              <StyledName name={displayNameDraft || 'Você'} font={font} effect={effect} color={color} />
            </div>
            <label style={{ marginTop: 10 }}>Fonte</label>
            <div className="name-style-picker">
              {NAME_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`name-font-option${(font || 'default') === f.id ? ' active' : ''}`}
                  style={f.id !== 'default' ? { fontFamily: f.family } : undefined}
                  onClick={() => setFont(f.id === 'default' ? null : f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>
            <label style={{ marginTop: 10 }}>Efeito</label>
            <div className="name-style-picker">
              {NAME_EFFECTS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`name-effect-option${(effect || 'solid') === e.id ? ' active' : ''}`}
                  onClick={() => setEffect(e.id)}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <label style={{ marginTop: 10 }}>Cor</label>
            <input type="color" value={color && color.startsWith('#') ? color : '#3b6ef6'} onChange={(ev) => setColor(ev.target.value)} style={{ width: 60, height: 34, padding: 2, marginTop: 2 }} />
          </>
        )}

        <button type="button" className="google-btn" style={{ marginTop: 14 }} disabled={saving} onClick={save}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
    </div>
  )
}

type ParticipantTile = {
  id: string
  name: string
  isLocal: boolean
  micOn: boolean
  videoTrack?: Track
}

function VoiceChannel({ me, channel, onParticipantsChange, onLeave }: { me: Profile; channel: PlayChannel; onParticipantsChange: (p: VoiceParticipantInfo[]) => void; onLeave: () => void }) {
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
            <button type="button" className="icon-btn play-voice-leave" onClick={onLeave} title="Desconectar da chamada">
              <IconPhoneOff size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
