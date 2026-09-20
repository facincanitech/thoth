import { createPortal } from 'react-dom'
import { openPip, closePip, updatePipTrack } from '../lib/pipBridge'
import { openMainWindow } from '../lib/desktopWindows'
import { isTauriDesktop } from '../lib/platform'
import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Room, RoomEvent, Track, createLocalScreenTracks, type RemoteParticipant, type LocalParticipant, type TrackPublication } from 'livekit-client'
import { supabase } from '../lib/supabase'
import { fetchLiveKitToken } from '../lib/livekit'
import { displayName } from '../lib/displayName'
import { AvatarBox } from './AvatarBox'
import { getPresenceColor } from '../lib/presence'
import { ReplayPlayer, type ReplayEvent } from './ReplayPlayer'
import { StyledName, NAME_FONTS, NAME_EFFECTS, PRISM_PALETTES } from './StyledName'
import { uploadImage } from '../lib/uploadImage'
import {
  IconArrowLeft, IconChat, IconChevronDown, IconCopy, IconEdit, IconGamepad, IconGrip, IconHash, IconHeadphones,
  IconLock, IconLockOpen, IconLogout, IconMic, IconMicOff, IconMonitorShare, IconPanelLeft, IconFolder, IconMore, IconPause, IconPlay, IconFullscreen, IconShrink, IconVolume, IconVolumeOff, IconPhoneOff, IconPlus,
  IconAttach, IconSearch, IconSend, IconSmile, IconSettingsGear, IconTrash, IconUser, IconVideo, IconVideoOff,
} from './icons'
import { fetchRandomStation, searchPublicStations, isHlsStream, type RadioStation } from '../lib/sonor'
import type { Bot, PlayBotButton, PlaySonorSession, PlayCategory, PlayChannel, PlayGroup, PlayMessage, PlayProfile, PlayRole, Profile } from '../types'

function useIsMobile() {
  const [m, setM] = useState(() => window.matchMedia('(max-width: 760px)').matches)
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 760px)')
    const on = () => setM(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return m
}

const CHAT_EMOJIS = [
  '😀','😁','😂','🤣','😊','😇','🙂','😉','😍','🥰','😘','😋','😜','🤪','🤩','🥳','😎','🤓','🧐','😏',
  '😒','🙄','😬','🤔','😴','😢','😭','🥺','😤','😠','😡','😨','😱','😅','🤯','😳','🤗','🤭','💀','👻',
  '❤️','💙','💚','💛','💜','🖤','💔','💯','🔥','✨','👍','👎','👏','🙌','🙏','🤝','👋','💪','👀','🎮',
]

function isImageMessage(content: string) {
  return /^https?:\/\/\S+\.(png|jpe?g|gif|webp)(\?\S*)?$/i.test(content) || /^https?:\/\/\S+\/play-media-\d+$/.test(content)
}

// Permissoes que um cargo pode dar. Dono e admin tem todas; membro sem cargo so tem o basico.
const PLAY_PERMISSIONS: { group: string; items: { key: string; label: string }[] }[] = [
  { group: 'Servidor', items: [
    { key: 'manage_channels', label: 'Criar e editar canais de texto, de voz e categorias' },
    { key: 'manage_server', label: 'Alterar nome, descrição, informações e imagem' },
    { key: 'manage_privacy', label: 'Deixar o servidor público ou privado' },
  ] },
  { group: 'Bots e comandos', items: [
    { key: 'manage_bots', label: 'Adicionar e remover bots' },
    { key: 'use_commands', label: 'Usar comandos dos bots' },
  ] },
  { group: 'Membros e cargos', items: [
    { key: 'manage_roles', label: 'Criar e editar cargos' },
    { key: 'assign_roles', label: 'Dar e tirar cargos' },
    { key: 'kick_members', label: 'Expulsar membros' },
    { key: 'ban_members', label: 'Banir membros' },
  ] },
  { group: 'Chamada de voz', items: [
    { key: 'voice_speak', label: 'Falar na chamada' },
    { key: 'voice_camera', label: 'Ligar a câmera' },
    { key: 'voice_screen', label: 'Compartilhar tela' },
  ] },
]
const DEFAULT_MEMBER_PERMS = ['voice_speak', 'voice_camera', 'voice_screen', 'use_commands']

const ROLE_EMOJIS = [
  '👑', '🛡️', '⭐', '🔥', '💎', '🎮', '🎤', '🎧', '🎨', '🔧',
  '📢', '🚀', '⚡', '🏆', '🎯', '🤖', '👾', '🎲', '🍀', '💜',
  '❤️', '💙', '💚', '🧡', '🖤', '🤍', '😎', '👀', '🐉', '🦊',
]

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
    name_style_color: override.name_style_effect ? override.name_style_color : base.name_style_color,
    banner_color: override.banner_color || base.banner_color,
    banner_image_url: override.banner_image_url || base.banner_image_url,
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
  const [myPlayProfile, setMyPlayProfile] = useState<Profile>(me)
  const [playTheme, setPlayTheme] = useState<'light' | 'dark'>('dark')
  const [showProfile, setShowProfile] = useState(false)
  const [myGroups, setMyGroups] = useState<PlayGroup[]>([])
  const [browseGroups, setBrowseGroups] = useState<PlayGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<PlayGroup | null>(null)
  const [channels, setChannels] = useState<PlayChannel[]>([])
  const [categories, setCategories] = useState<PlayCategory[]>([])
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

  async function loadMyPlayProfile() {
    const { data } = await supabase.from('play_profiles').select('*').eq('user_id', me.id).maybeSingle()
    const p = data as PlayProfile | null
    setMyPlayProfile(mergePlayProfile(me, p))
    setPlayTheme(p?.theme_preference || 'dark')
  }

  useEffect(() => {
    loadMyPlayProfile()
  }, [me.id])

  // No desktop, a raiz temada de verdade e a janela Tauri inteira
  // (.play-window-shell, renderizada por DesktopPlayWindow por fora do que
  // este componente controla) - propaga o tema escolhido pra ela tambem, sem
  // isso a troca manual so funcionaria no web/mobile.
  useEffect(() => {
    document.querySelector('.play-window-shell')?.setAttribute('data-theme', playTheme)
  }, [playTheme])

  async function fetchChannels(groupId: string) {
    const { data } = await supabase.from('play_channels').select('*').eq('group_id', groupId).order('position', { ascending: true })
    const list = (data || []) as PlayChannel[]
    setChannels(list)
    return list
  }

  async function fetchCategories(groupId: string) {
    const { data } = await supabase.from('play_categories').select('*').eq('group_id', groupId).order('position', { ascending: true })
    const list = (data || []) as PlayCategory[]
    setCategories(list)
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
    await fetchCategories(group.id)
    await loadChannels(group.id)
  }

  // Sincroniza canais e categorias em tempo real - sem isso, uma mudanca feita
  // em outra aba/dispositivo (ou por outro membro) so aparecia se vc reabrisse
  // o grupo do zero.
  useEffect(() => {
    if (!selectedGroup) return
    const channel = supabase
      .channel(`play-channels:${selectedGroup.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'play_channels', filter: `group_id=eq.${selectedGroup.id}` },
        () => fetchChannels(selectedGroup.id),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'play_categories', filter: `group_id=eq.${selectedGroup.id}` },
        () => fetchCategories(selectedGroup.id),
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

  async function sendRawMessage(content: string) {
    if (!selectedChannel) return
    const { error } = await supabase.from('play_messages').insert({ channel_id: selectedChannel.id, author_id: me.id, content })
    if (error) console.error('send play media failed', error)
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

  // Servidor aberto da lista de "abertos": entra de verdade (vira membro e aparece na
  // barra lateral) antes de abrir - sem ser membro a RLS esconde canais e mensagens.
  const [previewGroup, setPreviewGroup] = useState<PlayGroup | null>(null)

  async function joinOpenGroup(g: PlayGroup) {
    setPreviewGroup(null)
    const { data, error } = await supabase.rpc('join_play_group', { p_invite_code: g.invite_code, p_password: null })
    if (error) { console.error('join open group failed', error); return }
    await loadGroups()
    openGroup((data as PlayGroup) || g)
  }

  async function handleJoinGroup() {
    setJoinError(null)
    const { data, error } = await supabase.rpc('join_play_group', { p_invite_code: joinCode.trim(), p_password: joinPassword || null })
    if (error) {
      setJoinError(error.message.includes('senha') ? 'Senha incorreta.' : 'Servidor não encontrado.')
      return
    }
    setShowJoin(false)
    setJoinCode('')
    setJoinPassword('')
    await loadGroups()
    if (data) openGroup(data as PlayGroup)
  }

  function goHome() {
    setSelectedGroup(null)
    setSelectedChannel(null)
  }

  const selectedGroupIdRef = useRef<string | null>(null)
  selectedGroupIdRef.current = selectedGroup?.id ?? null
  useEffect(() => {
    function onBackButton(e: Event) {
      const detail = (e as CustomEvent<{ handled: boolean }>).detail
      if (detail.handled) return
      if (selectedGroupIdRef.current) {
        goHome()
        detail.handled = true
      }
    }
    window.addEventListener('play-back-button', onBackButton)
    return () => window.removeEventListener('play-back-button', onBackButton)
  }, [])

  return (
    <div
      className="play-app-shell"
      data-theme={playTheme}
      onContextMenu={(e) => { if (!(e.target as HTMLElement).closest('input, textarea')) e.preventDefault() }}
    >
      <PlayIconRail
        myGroups={myGroups}
        selectedGroupId={selectedGroup?.id ?? null}
        onSelectGroup={openGroup}
        onGoHome={goHome}
        onExit={onBack}
        me={me}
        myPlayProfile={myPlayProfile}
        onOpenProfile={() => setShowProfile(true)}
      />

      {selectedGroup ? (
        <GroupView
          me={me}
          myPlayProfile={myPlayProfile}
          group={selectedGroup}
          channels={channels}
          categories={categories}
          selectedChannel={selectedChannel}
          messages={messages}
          hasReplaySet={hasReplaySet}
          liveTyping={liveTyping}
          draft={draft}
          onDraftChange={handleDraftChange}
          onSend={sendMessage}
          onSendContent={sendRawMessage}
          onSelectChannel={openChannel}
          onChannelsChange={() => fetchChannels(selectedGroup.id)}
          onCategoriesChange={() => fetchCategories(selectedGroup.id)}
          onGroupUpdate={(patch) => setSelectedGroup((g) => (g ? { ...g, ...patch } : g))}
          onLeftGroup={() => { goHome(); loadGroups() }}
          onExitToMessenger={onBack}
        />
      ) : (
        <main className="play-home">
          <header className="play-home-header">
            <button type="button" className="icon-btn" onClick={onBack} title="Voltar"><IconArrowLeft size={20} /></button>
            <h1><IconGamepad size={22} /> Thoth Play</h1>
          </header>
          <div className="play-home-actions">
            <button type="button" className="google-btn" onClick={() => setShowCreate(true)}><IconPlus size={16} /> Criar servidor</button>
            <button type="button" className="google-btn" onClick={() => setShowJoin(true)}>Entrar com código</button>
          </div>

          {loading ? (
            <p className="play-empty">carregando...</p>
          ) : (
            <>
              {myGroups.length > 0 && (
                <section className="play-group-section">
                  <h2>Meus servidores</h2>
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
                <h2>Servidores abertos</h2>
                {browseGroups.length === 0 && <p className="play-empty">nenhum servidor aberto no momento</p>}
                <div className="play-group-grid">
                  {browseGroups.map((g) => (
                    <button key={g.id} type="button" className="play-group-card" onClick={() => setPreviewGroup(g)}>
                      <AvatarBox src={g.image_url} id={g.id} fallbackLetter={g.name[0]?.toUpperCase()} className="play-group-avatar" />
                      <span className="play-group-name">{g.name}</span>
                      <IconLockOpen size={13} />
                    </button>
                  ))}
                </div>
              </section>
            </>
          )}

          {previewGroup && <ServerInfoScreen group={previewGroup} onClose={() => setPreviewGroup(null)} onJoin={() => joinOpenGroup(previewGroup)} />}
          {showCreate && <CreateGroupModal onClose={() => setShowCreate(false)} onCreate={handleCreateGroup} error={createError} />}
          {showJoin && (
            <div className="modal-backdrop" onClick={() => setShowJoin(false)}>
              <div className="modal-card" onClick={(e) => e.stopPropagation()}>
                <h2>Entrar num servidor</h2>
                <input placeholder="Código do convite" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} />
                <input placeholder="Senha (se o servidor for fechado)" type="password" value={joinPassword} onChange={(e) => setJoinPassword(e.target.value)} style={{ marginTop: 8 }} />
                {joinError && <p className="auth-error">{joinError}</p>}
                <button type="button" className="google-btn" style={{ marginTop: 10 }} onClick={handleJoinGroup}>Entrar</button>
                <button type="button" className="modal-close" onClick={() => setShowJoin(false)}>fechar</button>
              </div>
            </div>
          )}
        </main>
      )}

      <ProfilePanel me={me} open={showProfile} onClose={() => setShowProfile(false)} onSaved={loadMyPlayProfile} />
    </div>
  )
}

type PlayFolder = { id: string; name: string; position: number }

type RailMenuTarget = { type: 'rail' } | { type: 'group'; id: string } | { type: 'folder'; id: string }

function PlayIconRail({ myGroups, selectedGroupId, onSelectGroup, onGoHome, onExit, me, myPlayProfile, onOpenProfile }: {
  myGroups: PlayGroup[]
  selectedGroupId: string | null
  onSelectGroup: (g: PlayGroup) => void
  onGoHome: () => void
  onExit: () => void
  me: Profile
  myPlayProfile: Profile
  onOpenProfile: () => void
}) {
  const isMobile = useIsMobile()
  const [folders, setFolders] = useState<PlayFolder[]>([])
  const [folderGroups, setFolderGroups] = useState<Record<string, string[]>>({})
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>(() => {
    try { return JSON.parse(localStorage.getItem('play-open-folders') || '{}') } catch { return {} }
  })
  const [menu, setMenu] = useState<{ x: number; y: number; target: RailMenuTarget } | null>(null)
  const [nameModal, setNameModal] = useState<{ mode: 'create' | 'rename'; folderId?: string; groupId?: string; value: string } | null>(null)

  async function loadFolders() {
    const { data: fs } = await supabase.from('play_folders').select('*').eq('user_id', me.id).order('position', { ascending: true })
    const list = (fs || []) as PlayFolder[]
    setFolders(list)
    if (!list.length) { setFolderGroups({}); return }
    const { data: fg } = await supabase.from('play_folder_groups').select('folder_id, group_id').in('folder_id', list.map((f) => f.id))
    const map: Record<string, string[]> = {}
    for (const r of fg || []) {
      const fid = r.folder_id as string
      map[fid] = [...(map[fid] || []), r.group_id as string]
    }
    setFolderGroups(map)
  }

  useEffect(() => {
    loadFolders()
  }, [me.id])

  async function moveGroupToFolder(groupId: string, folderId: string | null) {
    const ids = folders.map((f) => f.id)
    if (ids.length) await supabase.from('play_folder_groups').delete().eq('group_id', groupId).in('folder_id', ids)
    if (folderId) await supabase.from('play_folder_groups').insert({ folder_id: folderId, group_id: groupId })
    await loadFolders()
  }

  async function saveFolderName() {
    if (!nameModal || !nameModal.value.trim()) return
    if (nameModal.mode === 'create') {
      const { data } = await supabase.from('play_folders').insert({ user_id: me.id, name: nameModal.value.trim(), position: folders.length }).select().single()
      if (data && nameModal.groupId) await supabase.from('play_folder_groups').insert({ folder_id: (data as PlayFolder).id, group_id: nameModal.groupId })
    } else if (nameModal.folderId) {
      await supabase.from('play_folders').update({ name: nameModal.value.trim() }).eq('id', nameModal.folderId)
    }
    setNameModal(null)
    await loadFolders()
  }

  async function deleteFolder(id: string) {
    if (!confirm('Excluir esta pasta? Os servidores voltam pra barra.')) return
    await supabase.from('play_folders').delete().eq('id', id)
    await loadFolders()
  }

  function toggleFolder(id: string) {
    setOpenFolders((prev) => {
      const next = { ...prev, [id]: !prev[id] }
      try { localStorage.setItem('play-open-folders', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
  }

  const inFolder = new Set(Object.values(folderGroups).flat())
  const ungrouped = myGroups.filter((g) => !inFolder.has(g.id))

  function groupButton(g: PlayGroup) {
    return (
      <button
        key={g.id}
        type="button"
        data-group-id={g.id}
        className={'play-icon-rail-group' + (selectedGroupId === g.id ? ' active' : '')}
        title={g.name}
        onClick={() => onSelectGroup(g)}
      >
        <AvatarBox src={g.image_url} id={g.id} fallbackLetter={g.name[0]?.toUpperCase()} className="play-group-avatar" />
      </button>
    )
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault()
    const el = e.target as HTMLElement
    const groupEl = el.closest('[data-group-id]') as HTMLElement | null
    const folderEl = el.closest('[data-folder-id]') as HTMLElement | null
    const target: RailMenuTarget = groupEl
      ? { type: 'group', id: groupEl.dataset.groupId! }
      : folderEl
        ? { type: 'folder', id: folderEl.dataset.folderId! }
        : { type: 'rail' }
    setMenu({ x: e.clientX, y: e.clientY, target })
  }

  const menuGroupFolderId = menu?.target.type === 'group'
    ? Object.entries(folderGroups).find(([, ids]) => ids.includes((menu.target as { id: string }).id))?.[0] || null
    : null

  return (
    <aside className="play-icon-rail" onContextMenu={handleContextMenu}>
      <button type="button" className="play-icon-rail-home" title="Voltar pro Messenger" onClick={isMobile ? onExit : isTauriDesktop ? openMainWindow : onExit}>
        {isMobile ? <IconArrowLeft size={20} /> : <IconChat size={20} />}
      </button>
      <div className="play-icon-rail-groups">
        {folders.map((f) => {
          const groups = myGroups.filter((g) => (folderGroups[f.id] || []).includes(g.id))
          const open = !!openFolders[f.id]
          return (
            <div key={f.id} className="play-icon-rail-folder">
              <button type="button" data-folder-id={f.id} className={'play-icon-rail-group play-icon-rail-folder-btn' + (open ? ' open' : '')} title={f.name} onClick={() => toggleFolder(f.id)}>
                <IconFolder size={20} />
                <span className="play-icon-rail-folder-count">{groups.length}</span>
              </button>
              {open && <div className="play-icon-rail-folder-children">{groups.map(groupButton)}</div>}
            </div>
          )
        })}
        {ungrouped.map(groupButton)}
        <button type="button" className="play-icon-rail-group play-icon-rail-add" title="Entrar ou criar servidor" onClick={onGoHome}>
          <IconPlus size={18} />
        </button>
      </div>
      <div className="play-icon-rail-spacer" />
      <button type="button" className="play-icon-rail-group play-icon-rail-profile" title="Perfil" onClick={onOpenProfile}>
        <AvatarBox src={myPlayProfile.avatar_url} id={me.id} fallbackLetter={displayName(myPlayProfile)[0]?.toUpperCase()} className="play-group-avatar" />
      </button>

      {menu && (
        <>
          <div className="play-group-menu-backdrop" onClick={() => setMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMenu(null) }} />
          <div className="play-group-menu" style={{ position: 'fixed', top: menu.y, left: menu.x, minWidth: 210 }}>
            {menu.target.type === 'rail' && (
              <button type="button" onClick={() => { setMenu(null); setNameModal({ mode: 'create', value: '' }) }}><IconFolder size={15} /> Criar pasta</button>
            )}
            {menu.target.type === 'group' && (
              <>
                {folders.filter((f) => f.id !== menuGroupFolderId).map((f) => (
                  <button key={f.id} type="button" onClick={() => { const gid = (menu.target as { id: string }).id; setMenu(null); moveGroupToFolder(gid, f.id) }}>
                    <IconFolder size={15} /> Mover para {f.name}
                  </button>
                ))}
                <button type="button" onClick={() => { const gid = (menu.target as { id: string }).id; setMenu(null); setNameModal({ mode: 'create', groupId: gid, value: '' }) }}>
                  <IconPlus size={15} /> Nova pasta com este servidor
                </button>
                {menuGroupFolderId && (
                  <button type="button" onClick={() => { const gid = (menu.target as { id: string }).id; setMenu(null); moveGroupToFolder(gid, null) }}>
                    <IconArrowLeft size={15} /> Tirar da pasta
                  </button>
                )}
              </>
            )}
            {menu.target.type === 'folder' && (
              <>
                <button type="button" onClick={() => { const fid = (menu.target as { id: string }).id; const f = folders.find((x) => x.id === fid); setMenu(null); setNameModal({ mode: 'rename', folderId: fid, value: f?.name || '' }) }}>
                  <IconEdit size={15} /> Renomear pasta
                </button>
                <button type="button" className="danger" onClick={() => { const fid = (menu.target as { id: string }).id; setMenu(null); deleteFolder(fid) }}>
                  <IconTrash size={15} /> Excluir pasta
                </button>
              </>
            )}
          </div>
        </>
      )}

      {nameModal && (
        <div className="modal-backdrop" onClick={() => setNameModal(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>{nameModal.mode === 'create' ? 'Criar pasta' : 'Renomear pasta'}</h2>
            <input
              autoFocus
              maxLength={24}
              placeholder="Nome da pasta"
              value={nameModal.value}
              onChange={(e) => setNameModal({ ...nameModal, value: e.target.value })}
              onKeyDown={(e) => { if (e.key === 'Enter') saveFolderName() }}
            />
            <button type="button" className="google-btn" style={{ marginTop: 10 }} disabled={!nameModal.value.trim()} onClick={saveFolderName}>Salvar</button>
            <button type="button" className="modal-close" onClick={() => setNameModal(null)}>cancelar</button>
          </div>
        </div>
      )}
    </aside>
  )
}

function PlayProfileCard({ profile, roles, userRoleIds, canAssign, onToggleRole, onClose }: {
  profile: Profile; roles: PlayRole[]; userRoleIds: string[]; canAssign: boolean
  onToggleRole: (roleId: string, has: boolean) => void; onClose: () => void
}) {
  const [editingRoles, setEditingRoles] = useState(false)
  const myRoles = roles.filter((r) => userRoleIds.includes(r.id))
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card play-profile-card" onClick={(e) => e.stopPropagation()}>
        <div className="play-profile-card-banner" style={{ backgroundColor: profile.banner_color || '#3b6ef6', backgroundImage: profile.banner_image_url ? 'url(' + profile.banner_image_url + ')' : undefined }} />
        <AvatarBox src={profile.avatar_url} id={profile.id} fallbackLetter={displayName(profile)[0]?.toUpperCase()} className="play-profile-card-avatar" />
        <h2><StyledName name={displayName(profile)} font={profile.name_style_font} effect={profile.name_style_effect} color={profile.name_style_color} /></h2>
        {profile.status && <p className="play-profile-card-status">{profile.status}</p>}
        <div className="play-profile-card-roles">
          {myRoles.map((r) => <span key={r.id} className="play-group-tag">{r.emoji ? r.emoji + ' ' : ''}{r.name}</span>)}
          {canAssign && (
            <button type="button" className="play-group-tag play-profile-card-addrole" onClick={() => setEditingRoles((v) => !v)}>{editingRoles ? 'pronto' : '+ cargo'}</button>
          )}
        </div>
        {canAssign && editingRoles && (
          <div className="play-profile-card-rolelist">
            {roles.length === 0 && <span className="play-empty">nenhum cargo criado ainda</span>}
            {roles.map((r) => {
              const has = userRoleIds.includes(r.id)
              return (
                <label key={r.id} className="play-role-check-row">
                  <input type="checkbox" checked={has} onChange={() => onToggleRole(r.id, has)} />
                  {r.emoji ? r.emoji + ' ' : ''}{r.name}
                </label>
              )
            })}
          </div>
        )}
        <button type="button" className="modal-close" onClick={onClose}>fechar</button>
      </div>
    </div>
  )
}

function ServerInfoScreen({ group, members, onClose, onConfigure, onJoin }: {
  group: PlayGroup; members?: GroupMember[]; onClose: () => void; onConfigure?: () => void; onJoin?: () => void
}) {
  const online = members ? members.filter((m) => getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) !== 'offline').length : null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card play-server-info" onClick={(e) => e.stopPropagation()}>
        <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar play-server-info-avatar" />
        <h2>{group.name}</h2>
        {group.description && <p className="play-server-info-desc">{group.description}</p>}
        {members && (
          <div className="play-server-info-counts"><span>{online} online</span><span>{members.length} {members.length === 1 ? 'membro' : 'membros'}</span></div>
        )}
        {group.tags?.length > 0 && (
          <div className="play-group-tags" style={{ justifyContent: 'center' }}>
            {group.tags.map((t) => <span key={t} className="play-group-tag">{t}</span>)}
          </div>
        )}
        {onJoin && <button type="button" className="google-btn" style={{ marginTop: 16 }} onClick={onJoin}>Entrar</button>}
        {onConfigure && <button type="button" className="google-btn" style={{ marginTop: 16 }} onClick={onConfigure}>Configurar</button>}
        <button type="button" className="modal-close" onClick={onClose}>fechar</button>
      </div>
    </div>
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
        <h2>Criar servidor</h2>
        <input placeholder="Nome do servidor" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginTop: 8 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input type="checkbox" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} />
          Servidor fechado (com senha)
        </label>
        {isClosed && (
          <input placeholder="Senha do servidor" type="password" value={password} onChange={(e) => setPassword(e.target.value)} style={{ marginTop: 8 }} />
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
  myPlayProfile: Profile
  group: PlayGroup
  channels: PlayChannel[]
  categories: PlayCategory[]
  selectedChannel: PlayChannel | null
  messages: ChannelMessage[]
  hasReplaySet: Set<string>
  liveTyping: Record<string, string>
  draft: string
  onDraftChange: (v: string) => void
  onSend: () => void
  onSendContent: (content: string) => void
  onSelectChannel: (c: PlayChannel) => void
  onChannelsChange: () => void
  onCategoriesChange: () => void
  onGroupUpdate: (patch: Partial<PlayGroup>) => void
  onLeftGroup: () => void
  onExitToMessenger: () => void
}

type GroupMember = { profile: Profile; role: string }
type VoiceParticipantInfo = { id: string; name: string; micOn?: boolean; isScreen?: boolean; videoTrack?: Track; cameraTrack?: Track }

function GroupView({ me, myPlayProfile, group, channels, categories, selectedChannel, messages, hasReplaySet, liveTyping, draft, onDraftChange, onSend, onSendContent, onSelectChannel, onChannelsChange, onCategoriesChange, onGroupUpdate, onLeftGroup, onExitToMessenger }: GroupViewProps) {
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [mobileScreen, setMobileScreen] = useState<'channels' | 'chat' | 'members'>('channels')
  const mobileScreenRef = useRef(mobileScreen)
  mobileScreenRef.current = mobileScreen
  const [joinedVoiceChannel, setJoinedVoiceChannel] = useState<PlayChannel | null>(null)
  const [openReplayId, setOpenReplayId] = useState<string | null>(null)
  const [replayEvents, setReplayEvents] = useState<ReplayEvent[] | null>(null)
  // null = sem cargo nenhum (so o basico); lista = uniao das permissoes dos meus cargos
  const [myRolePerms, setMyRolePerms] = useState<string[] | null>(null)
  const [profileCardId, setProfileCardId] = useState<string | null>(null)
  const [pipIds, setPipIds] = useState<string[]>([])
  const [pipWin, setPipWin] = useState<Window | null>(null)
  const [fullscreenId, setFullscreenId] = useState<string | null>(null)
  const [maximizedId, setMaximizedId] = useState<string | null>(null)
  const [mediaMenu, setMediaMenu] = useState<{ id: string; x: number; y: number; fromGrid: boolean } | null>(null)
  const [sonorSession, setSonorSession] = useState<PlaySonorSession | null>(null)
  const [sonorModal, setSonorModal] = useState<null | 'search' | 'favs'>(null)
  const [sonorQuery, setSonorQuery] = useState('')
  const [sonorResults, setSonorResults] = useState<RadioStation[]>([])
  const [sonorFavs, setSonorFavs] = useState<RadioStation[]>([])
  const [sonorBusy, setSonorBusy] = useState(false)
  const [sonorNotice, setSonorNotice] = useState<string | null>(null)
  const sonorAudioRef = useRef<HTMLAudioElement>(null)
  const sonorHlsRef = useRef<{ destroy: () => void } | null>(null)
  const [sonorVolume, setSonorVolume] = useState(() => {
    const v = parseFloat(localStorage.getItem('ferus-sonor-volume') || '')
    return Number.isFinite(v) ? v : 0.8
  })
  const [showChatEmoji, setShowChatEmoji] = useState(false)
  const chatFileRef = useRef<HTMLInputElement>(null)
  const [chatUploading, setChatUploading] = useState(false)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
  const [showServerInfo, setShowServerInfo] = useState(false)
  const [showGroupMenu, setShowGroupMenu] = useState(false)
  const [showInvite, setShowInvite] = useState(false)
  const [sidebarWidth, setSidebarWidth] = useState<number | null>(() => {
    const saved = Number(localStorage.getItem('play-channel-sidebar-width'))
    return saved >= 180 && saved <= 420 ? saved : null
  })
  const resizingRef = useRef(false)
  const sidebarWrapRef = useRef<HTMLDivElement>(null)
  const [newChannelName, setNewChannelName] = useState('')
  const [newChannelKind, setNewChannelKind] = useState<'text' | 'voice'>('text')
  const [newChannelCategoryId, setNewChannelCategoryId] = useState<string | null>(null)
  const [newChannelPrivate, setNewChannelPrivate] = useState(false)
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [catMenu, setCatMenu] = useState<{ categoryId: string; x: number; y: number } | null>(null)
  const [chanMenu, setChanMenu] = useState<{ channelId: string; x: number; y: number } | null>(null)
  const [renameChannelDraft, setRenameChannelDraft] = useState<{ id: string; name: string } | null>(null)
  const [renameCategoryId, setRenameCategoryId] = useState<string | null>(null)
  const [renameCategoryDraft, setRenameCategoryDraft] = useState('')
  const [dragChannelId, setDragChannelId] = useState<string | null>(null)
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [memberTab, setMemberTab] = useState<'group' | 'voice'>('group')
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipantInfo[]>([])
  const [groupRoles, setGroupRoles] = useState<PlayRole[]>([])
  const [roleIdsByUser, setRoleIdsByUser] = useState<Record<string, string[]>>({})
  const [roleQuickMenu, setRoleQuickMenu] = useState<{ userId: string; name: string; x: number; y: number } | null>(null)
  const [roleQuickMenuIds, setRoleQuickMenuIds] = useState<Set<string>>(new Set())

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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_group_members', filter: `group_id=eq.${group.id}` }, () => loadMembers())
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [group.id])

  const onlineMembers = members.filter((m) => getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) !== 'offline')
  const offlineMembers = members.filter((m) => getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) === 'offline')
  const inVoiceIds = new Set(voiceParticipants.map((p) => p.id))
  // Cargos com "mostrar separado": quem tem mais de um cai no de cima (ordem = prioridade)
  const hoistedRoles = groupRoles.filter((r) => r.hoisted).sort((a, b) => a.position - b.position)
  const isOnline = (m: GroupMember) => getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) !== 'offline'
  const renderMemberRow = (m: GroupMember, offline: boolean) => (
    <div key={m.profile.id} className={'play-member-row' + (offline ? ' offline' : '')}>
      <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" />
      <span
        className="play-name-clickable"
        onContextMenu={(e) => { e.preventDefault(); openRoleQuickMenu(m.profile.id, displayName(m.profile), e.clientX, e.clientY) }}
        onClick={() => setProfileCardId(m.profile.id)}
      >
        {offline ? displayName(m.profile) : <StyledName name={displayName(m.profile)} font={m.profile.name_style_font} effect={m.profile.name_style_effect} color={m.profile.name_style_color} />}
      </span>
      {!offline && inVoiceIds.has(m.profile.id) && <IconHeadphones size={14} />}
    </div>
  )
  const roleSections = hoistedRoles
    .map((role) => ({
      role,
      list: members
        .filter((m) => hoistedRoles.find((r) => (roleIdsByUser[m.profile.id] || []).includes(r.id))?.id === role.id)
        .sort((a, b) => Number(isOnline(b)) - Number(isOnline(a))),
    }))
    .filter((sec) => sec.list.length > 0)
  const sectionedIds = new Set(roleSections.flatMap((sec) => sec.list.map((m) => m.profile.id)))
  const onlineRest = onlineMembers.filter((m) => !sectionedIds.has(m.profile.id))
  const offlineRest = offlineMembers.filter((m) => !sectionedIds.has(m.profile.id))
  const myRole = members.find((m) => m.profile.id === me.id)?.role || null
  const membersById = Object.fromEntries(members.map((m) => [m.profile.id, m.profile]))
  const isStaff = myRole === 'owner' || myRole === 'admin'
  const can = (perm: string) => isStaff || (myRolePerms === null ? DEFAULT_MEMBER_PERMS.includes(perm) : myRolePerms.includes(perm))
  const canManage = can('manage_channels')
  const canAssign = can('assign_roles')
  const canConfigure = ['manage_server', 'manage_privacy', 'manage_bots', 'manage_roles', 'assign_roles', 'kick_members', 'ban_members'].some(can)
  const channelsByCategory = (categoryId: string) => channels.filter((c) => c.category_id === categoryId).sort((a, b) => a.position - b.position)
  const uncategorized = channels.filter((c) => !c.category_id || !categories.some((cat) => cat.id === c.category_id)).sort((a, b) => a.position - b.position)

  async function openRoleQuickMenu(userId: string, name: string, x: number, y: number) {
    if (!canAssign || userId === me.id) return
    setRoleQuickMenu({ userId, name, x, y })
    let roleList = groupRoles
    if (!roleList.length) {
      const { data } = await supabase.from('play_roles').select('*').eq('group_id', group.id).order('position', { ascending: true })
      roleList = (data || []) as PlayRole[]
      setGroupRoles(roleList)
    }
    if (!roleList.length) { setRoleQuickMenuIds(new Set()); return }
    const { data: rm } = await supabase.from('play_role_members').select('role_id').eq('user_id', userId).in('role_id', roleList.map((r) => r.id))
    setRoleQuickMenuIds(new Set((rm || []).map((r) => r.role_id as string)))
  }

  async function toggleUserRole(userId: string, roleId: string, has: boolean) {
    if (has) await supabase.from('play_role_members').delete().eq('role_id', roleId).eq('user_id', userId)
    else await supabase.from('play_role_members').insert({ role_id: roleId, user_id: userId })
    setRoleIdsByUser((prev) => ({ ...prev, [userId]: has ? (prev[userId] || []).filter((x) => x !== roleId) : [...(prev[userId] || []), roleId] }))
  }

  async function toggleQuickMenuRole(roleId: string, has: boolean) {
    if (!roleQuickMenu) return
    if (has) {
      await supabase.from('play_role_members').delete().eq('role_id', roleId).eq('user_id', roleQuickMenu.userId)
      setRoleQuickMenuIds((prev) => { const next = new Set(prev); next.delete(roleId); return next })
    } else {
      await supabase.from('play_role_members').insert({ role_id: roleId, user_id: roleQuickMenu.userId })
      setRoleQuickMenuIds((prev) => new Set(prev).add(roleId))
    }
  }

  function openNewChannelModal(categoryId: string | null, kind: 'text' | 'voice' = 'text') {
    setNewChannelCategoryId(categoryId)
    setNewChannelKind(kind)
    setNewChannelName('')
    setNewChannelPrivate(false)
    setShowNewChannel(true)
  }

  async function createChannel() {
    if (!newChannelName.trim()) return
    const siblingCount = newChannelCategoryId ? channelsByCategory(newChannelCategoryId).length : uncategorized.length
    const { error } = await supabase.from('play_channels').insert({
      group_id: group.id, name: newChannelName.trim(), kind: newChannelKind, category_id: newChannelCategoryId, position: siblingCount,
    })
    if (error) { console.error('create channel failed', error); return }
    setNewChannelName('')
    setShowNewChannel(false)
    onChannelsChange()
  }

  async function createCategory() {
    if (!newCategoryName.trim()) return
    const { error } = await supabase.from('play_categories').insert({ group_id: group.id, name: newCategoryName.trim(), position: categories.length })
    if (error) { console.error('create category failed', error); return }
    setNewCategoryName('')
    setShowNewCategory(false)
    onCategoriesChange()
  }

  async function renameCategory() {
    if (!renameCategoryId || !renameCategoryDraft.trim()) return
    await supabase.from('play_categories').update({ name: renameCategoryDraft.trim() }).eq('id', renameCategoryId)
    setRenameCategoryId(null)
    onCategoriesChange()
  }

  async function renameChannelSave() {
    if (!renameChannelDraft || !renameChannelDraft.name.trim()) return
    await supabase.from('play_channels').update({ name: renameChannelDraft.name.trim() }).eq('id', renameChannelDraft.id)
    setRenameChannelDraft(null)
    onChannelsChange()
  }

  async function deleteChannel(channelId: string) {
    const ch = channels.find((c) => c.id === channelId)
    if (!ch) return
    if (!confirm('Excluir o canal "' + ch.name + '"? As mensagens dele são apagadas junto.')) return
    if (joinedVoiceChannel?.id === channelId) setJoinedVoiceChannel(null)
    const { error } = await supabase.from('play_channels').delete().eq('id', channelId)
    if (error) { console.error('delete channel failed', error); return }
    if (selectedChannel?.id === channelId) {
      const other = channels.find((c) => c.id !== channelId && c.kind === 'text')
      if (other) onSelectChannel(other)
    }
    onChannelsChange()
  }

  async function deleteCategory(categoryId: string) {
    if (!confirm('Excluir esta categoria? Os canais dela ficam sem categoria.')) return
    await supabase.from('play_categories').delete().eq('id', categoryId)
    onCategoriesChange()
  }

  async function reorderCategories(draggedId: string, targetId: string) {
    const ordered = [...categories].sort((a, b) => a.position - b.position)
    const fromIdx = ordered.findIndex((c) => c.id === draggedId)
    const toIdx = ordered.findIndex((c) => c.id === targetId)
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return
    const [moved] = ordered.splice(fromIdx, 1)
    ordered.splice(toIdx, 0, moved)
    await Promise.all(ordered.map((c, i) => (c.position === i ? null : supabase.from('play_categories').update({ position: i }).eq('id', c.id))))
    onCategoriesChange()
  }

  async function moveChannel(draggedId: string, targetCategoryId: string | null, targetChannelId: string | null) {
    const dragged = channels.find((c) => c.id === draggedId)
    if (!dragged) return
    const destList = (targetCategoryId ? channelsByCategory(targetCategoryId) : uncategorized).filter((c) => c.id !== draggedId)
    const targetIdx = targetChannelId ? destList.findIndex((c) => c.id === targetChannelId) : destList.length
    destList.splice(targetIdx === -1 ? destList.length : targetIdx, 0, dragged)
    await Promise.all(destList.map((c, i) => {
      const patch: { position: number; category_id?: string | null } = { position: i }
      if (c.id === draggedId) patch.category_id = targetCategoryId
      if (c.position === i && c.category_id === (c.id === draggedId ? targetCategoryId : c.category_id)) return null
      return supabase.from('play_channels').update(patch).eq('id', c.id)
    }))
    onChannelsChange()
  }

  useEffect(() => {
    setMobileScreen('channels')
  }, [group.id])

  useEffect(() => {
    function onBackButton(e: Event) {
      const detail = (e as CustomEvent<{ handled: boolean }>).detail
      if (detail.handled) return
      if (mobileScreenRef.current === 'members') { setMobileScreen('chat'); detail.handled = true }
      else if (mobileScreenRef.current === 'chat') { setMobileScreen('channels'); detail.handled = true }
    }
    window.addEventListener('play-back-button', onBackButton)
    return () => window.removeEventListener('play-back-button', onBackButton)
  }, [])

  useEffect(() => {
    const shell = document.querySelector('.play-app-shell')
    shell?.classList.toggle('play-focus', mobileScreen !== 'channels')
    return () => shell?.classList.remove('play-focus')
  }, [mobileScreen])

  useEffect(() => {
    let cancelled = false
    supabase.from('play_sonor_sessions').select('*').eq('group_id', group.id).maybeSingle().then(({ data }) => {
      if (!cancelled) setSonorSession((data as PlaySonorSession) || null)
    })
    const channel = supabase
      .channel('play-sonor:' + group.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_sonor_sessions', filter: 'group_id=eq.' + group.id }, (payload) => {
        if (payload.eventType === 'DELETE') setSonorSession(null)
        else setSonorSession(payload.new as PlaySonorSession)
      })
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [group.id])

  useEffect(() => {
    const audio = sonorAudioRef.current
    if (!audio) return
    sonorHlsRef.current?.destroy()
    sonorHlsRef.current = null
    if (!sonorSession) { audio.pause(); audio.removeAttribute('src'); audio.load(); return }
    if (sonorSession.is_hls) {
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls()
          hls.loadSource(sonorSession.stream_url)
          hls.attachMedia(audio)
          sonorHlsRef.current = hls
          audio.play().catch(() => {})
        } else {
          audio.src = sonorSession.stream_url
          audio.play().catch(() => {})
        }
      })
    } else {
      audio.src = sonorSession.stream_url
      audio.play().catch(() => {})
    }
  }, [sonorSession?.stream_url, sonorSession?.is_hls])

  useEffect(() => {
    if (sonorAudioRef.current) sonorAudioRef.current.volume = sonorVolume
    try { localStorage.setItem('ferus-sonor-volume', String(sonorVolume)) } catch { /* ignore */ }
  }, [sonorVolume, sonorSession?.stream_url])

  useEffect(() => {
    let cancelled = false
    async function loadMyPerms() {
      const { data } = await supabase
        .from('play_role_members')
        .select('role_id, play_roles!inner(group_id, permissions)')
        .eq('user_id', me.id)
        .eq('play_roles.group_id', group.id)
      if (cancelled) return
      const rows = (data || []) as unknown as { play_roles: { permissions: string[] } | { permissions: string[] }[] }[]
      if (!rows.length) { setMyRolePerms(null); return }
      const all = rows.flatMap((r) => (Array.isArray(r.play_roles) ? r.play_roles : [r.play_roles]).flatMap((x) => x.permissions || []))
      setMyRolePerms([...new Set(all)])
    }
    loadMyPerms()
    const ch = supabase
      .channel('play-myperms:' + group.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_role_members' }, () => loadMyPerms())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_roles', filter: 'group_id=eq.' + group.id }, () => loadMyPerms())
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(ch)
    }
  }, [group.id, me.id])

  // cargos do servidor + quem tem quais - alimenta a separacao por cargo na lista de membros
  useEffect(() => {
    let cancelled = false
    async function loadRoleData() {
      const { data: roleRows } = await supabase.from('play_roles').select('*').eq('group_id', group.id).order('position', { ascending: true })
      const list = (roleRows || []) as PlayRole[]
      if (cancelled) return
      setGroupRoles(list)
      if (!list.length) { setRoleIdsByUser({}); return }
      const { data: rm } = await supabase.from('play_role_members').select('role_id, user_id').in('role_id', list.map((r) => r.id))
      if (cancelled) return
      const map: Record<string, string[]> = {}
      for (const row of rm || []) {
        const uid = row.user_id as string
        map[uid] = [...(map[uid] || []), row.role_id as string]
      }
      setRoleIdsByUser(map)
    }
    loadRoleData()
    const ch = supabase
      .channel('play-roledata:' + group.id)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_roles', filter: 'group_id=eq.' + group.id }, () => loadRoleData())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_role_members' }, () => loadRoleData())
      .subscribe()
    return () => {
      cancelled = true
      supabase.removeChannel(ch)
    }
  }, [group.id])

  // id de tile pode ser "usuario" (tela ou camera principal) ou "usuario:cam" (camera junto da transmissao)
  function trackOf(id: string): Track | undefined {
    const base = id.replace(':cam', '')
    const p = voiceParticipants.find((x) => x.id === base)
    return id.endsWith(':cam') ? p?.cameraTrack : p?.videoTrack
  }
  function nameOf(id: string): string {
    return voiceParticipants.find((x) => x.id === id.replace(':cam', ''))?.name || ''
  }

  function togglePip(id: string) {
    if (isTauriDesktop) {
      if (pipIds.includes(id)) {
        closePip(id)
        setPipIds((prev) => prev.filter((x) => x !== id))
        return
      }
      const tr = trackOf(id)
      if (!tr) return
      setPipIds((prev) => [...prev, id])
      openPip(id, nameOf(id), tr, () => setPipIds((prev) => prev.filter((x) => x !== id)))
      return
    }
    const next = pipIds.includes(id) ? pipIds.filter((x) => x !== id) : [...pipIds, id]
    setPipIds(next)
    if (next.length === 0) { pipWin?.close(); setPipWin(null); return }
    const dpip = (window as unknown as { documentPictureInPicture?: { requestWindow: (o: { width: number; height: number }) => Promise<Window> } }).documentPictureInPicture
    if (dpip) {
      const height = 270 * next.length
      if (!pipWin || pipWin.closed) {
        dpip.requestWindow({ width: 480, height }).then((w) => {
          w.document.body.style.cssText = 'margin:0;background:#000;display:flex;flex-direction:column;overflow:hidden'
          w.addEventListener('pagehide', () => { setPipIds([]); setPipWin(null) })
          setPipWin(w)
        }).catch(() => setPipIds([]))
      } else {
        try { pipWin.resizeTo(480, height) } catch { /* ignore */ }
      }
    } else {
      const el = document.querySelector('video[data-stream-id="' + id + '"]') as (HTMLVideoElement & { requestPictureInPicture?: () => Promise<unknown> }) | null
      el?.requestPictureInPicture?.()
    }
  }

  useEffect(() => {
    const live = new Set(voiceParticipants.flatMap((p) => [p.videoTrack ? p.id : '', p.cameraTrack ? p.id + ':cam' : '']).filter(Boolean))
    if (isTauriDesktop) {
      for (const id of pipIds) {
        if (!live.has(id)) closePip(id)
        else { const tr = trackOf(id); if (tr) updatePipTrack(id, tr) }
      }
    }
    if (pipIds.some((id) => !live.has(id))) {
      const next = pipIds.filter((id) => live.has(id))
      setPipIds(next)
      if (next.length === 0) { pipWin?.close(); setPipWin(null) }
    }
    if (fullscreenId && !live.has(fullscreenId)) setFullscreenId(null)
    if (maximizedId && !live.has(maximizedId)) setMaximizedId(null)
  }, [voiceParticipants])

  async function postBot(slug: string, channelId: string, text: string) {
    const { error } = await supabase.rpc('post_play_bot_message', { p_channel_id: channelId, p_bot_slug: slug, p_content: text })
    if (error) console.error('bot post failed', error)
  }

  async function startStation(channelId: string, station: RadioStation) {
    setSonorBusy(true)
    const { error } = await supabase.rpc('play_sonor_set', {
      p_group_id: group.id, p_title: station.name, p_stream_url: station.url, p_is_hls: isHlsStream(station.url),
    })
    setSonorBusy(false)
    if (error) { setSonorNotice('não consegui tocar: ' + error.message); return }
    setSonorModal(null)
    await postBot('sonor', channelId, 'Tocando ' + station.name + ' (pedido por ' + displayName(myPlayProfile) + ')')
  }

  async function handleBotAction(action: string, channelId: string) {
    setSonorNotice(null)
    if (action === 'sonor_play') { setSonorQuery(''); setSonorResults([]); setSonorModal('search'); return }
    if (action === 'sonor_random') {
      setSonorBusy(true)
      const st = await fetchRandomStation()
      setSonorBusy(false)
      if (!st) { setSonorNotice('não achei nenhuma rádio agora, tenta de novo'); return }
      await startStation(channelId, st)
      return
    }
    if (action === 'sonor_stop') {
      await supabase.rpc('play_sonor_stop', { p_group_id: group.id })
      await postBot('sonor', channelId, 'Rádio parada por ' + displayName(myPlayProfile))
      return
    }
    if (action === 'sonor_save') {
      if (!sonorSession) { setSonorNotice('nenhuma rádio tocando agora'); return }
      const { error } = await supabase.from('sonor_favorites').insert({ user_id: me.id, name: sonorSession.title, stream_url: sonorSession.stream_url, is_hls: sonorSession.is_hls })
      setSonorNotice(error ? 'não consegui salvar' : sonorSession.title + ' salva nos seus favoritos')
      return
    }
    if (action === 'sonor_favs') {
      const { data } = await supabase.from('sonor_favorites').select('name, stream_url').eq('user_id', me.id).order('created_at', { ascending: false })
      setSonorFavs((data || []).map((r) => ({ name: r.name as string, url: r.stream_url as string, country: '' })))
      setSonorModal('favs')
      return
    }
    if (action.startsWith('zelador_d')) {
      const sides = parseInt(action.slice('zelador_d'.length), 10) || 6
      await postBot('zelador', channelId, displayName(myPlayProfile) + ' rolou ' + (1 + Math.floor(Math.random() * sides)) + ' (d' + sides + ')')
      return
    }
    if (action === 'zelador_draw') {
      const picked = members[Math.floor(Math.random() * members.length)]
      if (picked) await postBot('zelador', channelId, 'Sorteado: ' + displayName(picked.profile))
    }
  }

  async function searchStations() {
    if (!sonorQuery.trim()) return
    setSonorBusy(true)
    setSonorResults(await searchPublicStations(sonorQuery.trim()))
    setSonorBusy(false)
  }

  async function handleChatFilePicked(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setChatUploading(true)
    try {
      const url = await uploadImage(file, me.id, 'play-media')
      onSendContent(url)
    } catch (err) {
      console.error('play media upload failed', err)
    } finally {
      setChatUploading(false)
    }
  }

  function handleSelectChannel(c: PlayChannel) {
    setMobileScreen('chat')
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

  async function leaveGroup() {
    if (!confirm(`Sair de "${group.name}"?`)) return
    await supabase.from('play_group_members').delete().eq('group_id', group.id).eq('user_id', me.id)
    onLeftGroup()
  }

  const typingNames = Object.entries(liveTyping)
    .map(([userId, text]) => ({ name: members.find((m) => m.profile.id === userId)?.profile ? displayName(members.find((m) => m.profile.id === userId)!.profile) : 'alguém', text }))

  function startSidebarResize(e: ReactMouseEvent) {
    e.preventDefault()
    resizingRef.current = true
    const startX = e.clientX
    const startWidth = sidebarWidth ?? sidebarWrapRef.current?.getBoundingClientRect().width ?? 220
    function onMove(ev: MouseEvent) {
      if (!resizingRef.current) return
      const next = Math.min(420, Math.max(180, startWidth + (ev.clientX - startX)))
      setSidebarWidth(next)
    }
    function onUp() {
      resizingRef.current = false
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
      setSidebarWidth((w) => { localStorage.setItem('play-channel-sidebar-width', String(w)); return w })
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  return (
    <main className="play-group-view">
      <div className="play-group-main">
        <header className="play-group-topbar">
          <button type="button" className="play-group-topbar-avatar-btn" onClick={() => setShowServerInfo(true)} title="Sobre o servidor">
            <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
          </button>
          <div className="play-group-topbar-copy">
            <div className="play-group-topbar-title">
              <button type="button" className="play-group-topbar-name-btn" onClick={() => setShowServerInfo(true)} title="Sobre o servidor">
                <strong>{group.name}</strong>
              </button>
              <div className="play-group-menu-wrap">
                <button type="button" className="play-group-menu-trigger" onClick={() => setShowGroupMenu((v) => !v)} title="Menu do servidor">
                  <IconChevronDown size={14} />
                </button>
                {showGroupMenu && (
                  <>
                    <div className="play-group-menu-backdrop" onClick={() => setShowGroupMenu(false)} />
                    <div className="play-group-menu">
                      <button type="button" onClick={() => { setShowGroupMenu(false); setShowGroupInfo(true) }}>
                        <IconSettingsGear size={15} /> Config. do servidor
                      </button>
                      <button type="button" onClick={() => { setShowGroupMenu(false); setShowInvite(true) }}>
                        <IconCopy size={15} /> Convidar
                      </button>
                      <button type="button" className="danger" onClick={() => { setShowGroupMenu(false); leaveGroup() }}>
                        <IconLogout size={15} /> Sair
                      </button>
                      <div className="play-group-menu-sep" />
                      <button type="button" onClick={() => { setShowGroupMenu(false); onExitToMessenger() }}>
                        <IconArrowLeft size={15} /> Messenger
                      </button>
                    </div>
                  </>
                )}
              </div>
              <button type="button" className="play-quick-invite-btn" onClick={() => setShowInvite(true)} title="Convidar para o servidor">
                <IconUser size={13} /> {members.length} <IconPlus size={11} />
              </button>
            </div>
            {group.description && <span>{group.description}</span>}
          </div>
        </header>

        {showInvite && (
          <div className="modal-backdrop" onClick={() => setShowInvite(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2>Convidar para {group.name}</h2>
              <p className="play-invite-hint">Compartilhe o código com quem você quer chamar pro servidor.</p>
              <div className="play-invite-code-row">
                <input readOnly value={group.invite_code} onFocus={(e) => e.target.select()} />
                <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={copyInvite}>
                  <IconCopy size={14} /> {copied ? 'copiado!' : 'Copiar'}
                </button>
              </div>
              <button type="button" className="modal-close" onClick={() => setShowInvite(false)}>fechar</button>
            </div>
          </div>
        )}

        <div className={`play-group-body mobile-screen-${mobileScreen}`}>
          <div className="play-mobile-bar">
            <button type="button" className="icon-btn" onClick={() => setMobileScreen(mobileScreen === 'members' ? 'chat' : 'channels')} title="Voltar"><IconArrowLeft size={20} /></button>
            <strong>{mobileScreen === 'members' ? 'Membros' : selectedChannel?.name || ''}</strong>
            <button type="button" className={`icon-btn${mobileScreen === 'members' ? ' active' : ''}`} onClick={() => setMobileScreen(mobileScreen === 'members' ? 'chat' : 'members')} title="Mostrar/esconder membros"><IconPanelLeft size={20} /></button>
          </div>
          <div className="play-channel-sidebar-wrap" ref={sidebarWrapRef} style={sidebarWidth ? { width: sidebarWidth } : undefined}>
            <aside
              className="play-channel-sidebar"
              style={sidebarWidth ? { width: sidebarWidth } : undefined}
              onContextMenu={(e) => {
                if (!canManage || (e.target as HTMLElement).closest('.play-channel-group-title, .play-channel-item, .play-channel-voice-member, .play-group-menu, .play-group-menu-backdrop')) return
                e.preventDefault()
                setShowNewCategory(true)
              }}
            >
              {categories.slice().sort((a, b) => a.position - b.position).map((cat) => (
                <div
                  key={cat.id}
                  draggable={canManage}
                  onDragStart={() => setDragCategoryId(cat.id)}
                  onDragOver={(e) => { if (dragCategoryId) e.preventDefault() }}
                  onDrop={(e) => { e.preventDefault(); if (dragCategoryId && dragCategoryId !== cat.id) reorderCategories(dragCategoryId, cat.id); setDragCategoryId(null) }}
                >
                  <div
                    className="play-channel-group-title"
                    onContextMenu={(e) => { if (!canManage) return; e.preventDefault(); setCatMenu({ categoryId: cat.id, x: e.clientX, y: e.clientY }) }}
                  >
                    {canManage && <span className="play-category-grip"><IconGrip size={12} /></span>}
                    <span>{cat.name}</span>
                    {canManage && (
                      <button type="button" onClick={() => openNewChannelModal(cat.id)} title="Criar canal"><IconPlus size={14} /></button>
                    )}
                  </div>
                  <div
                    onDragOver={(e) => { if (dragChannelId) e.preventDefault() }}
                    onDrop={(e) => { e.preventDefault(); if (dragChannelId) moveChannel(dragChannelId, cat.id, null); setDragChannelId(null) }}
                  >
                    {channelsByCategory(cat.id).map((c) => (
                      <div
                        key={c.id}
                        draggable={canManage}
                        onContextMenu={(e) => { if (!canManage) return; e.preventDefault(); e.stopPropagation(); setChanMenu({ channelId: c.id, x: e.clientX, y: e.clientY }) }}
                        onDragStart={(e) => { e.stopPropagation(); setDragChannelId(c.id) }}
                        onDragOver={(e) => { if (dragChannelId) { e.preventDefault(); e.stopPropagation() } }}
                        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragChannelId) moveChannel(dragChannelId, c.category_id, c.id); setDragChannelId(null) }}
                      >
                        <button type="button" className={`play-channel-item${selectedChannel?.id === c.id ? ' active' : ''}`} onClick={() => handleSelectChannel(c)}>
                          {canManage && <span className="play-channel-grip"><IconGrip size={11} /></span>}
                          {c.kind === 'text' ? <IconHash size={15} /> : <IconVideo size={15} />} {c.name}
                        </button>
                        {c.kind === 'voice' && joinedVoiceChannel?.id === c.id && voiceParticipants.map((p) => (
                          <div key={p.id} className="play-channel-voice-member">
                            <AvatarBox
                              src={p.id === me.id ? myPlayProfile.avatar_url : membersById[p.id]?.avatar_url || null}
                              id={p.id}
                              fallbackLetter={p.name[0]?.toUpperCase()}
                              className="avatar-sm"
                            />
                            {p.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              ))}

              {uncategorized.length > 0 && (
                <div>
                  <div className="play-channel-group-title"><span>Sem categoria</span></div>
                  <div
                    onDragOver={(e) => { if (dragChannelId) e.preventDefault() }}
                    onDrop={(e) => { e.preventDefault(); if (dragChannelId) moveChannel(dragChannelId, null, null); setDragChannelId(null) }}
                  >
                    {uncategorized.map((c) => (
                      <div
                        key={c.id}
                        draggable={canManage}
                        onContextMenu={(e) => { if (!canManage) return; e.preventDefault(); e.stopPropagation(); setChanMenu({ channelId: c.id, x: e.clientX, y: e.clientY }) }}
                        onDragStart={(e) => { e.stopPropagation(); setDragChannelId(c.id) }}
                        onDragOver={(e) => { if (dragChannelId) { e.preventDefault(); e.stopPropagation() } }}
                        onDrop={(e) => { e.preventDefault(); e.stopPropagation(); if (dragChannelId) moveChannel(dragChannelId, c.category_id, c.id); setDragChannelId(null) }}
                      >
                        <button type="button" className={`play-channel-item${selectedChannel?.id === c.id ? ' active' : ''}`} onClick={() => handleSelectChannel(c)}>
                          {canManage && <span className="play-channel-grip"><IconGrip size={11} /></span>}
                          {c.kind === 'text' ? <IconHash size={15} /> : <IconVideo size={15} />} {c.name}
                        </button>
                        {c.kind === 'voice' && joinedVoiceChannel?.id === c.id && voiceParticipants.map((p) => (
                          <div key={p.id} className="play-channel-voice-member">
                            <AvatarBox
                              src={p.id === me.id ? myPlayProfile.avatar_url : membersById[p.id]?.avatar_url || null}
                              id={p.id}
                              fallbackLetter={p.name[0]?.toUpperCase()}
                              className="avatar-sm"
                            />
                            {p.name}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {chanMenu && (
                <>
                  <div className="play-group-menu-backdrop" onClick={() => setChanMenu(null)} onContextMenu={(e) => { e.preventDefault(); setChanMenu(null) }} />
                  <div className="play-group-menu" style={{ position: 'fixed', top: chanMenu.y, left: chanMenu.x }}>
                    <button type="button" onClick={() => { const ch = channels.find((c) => c.id === chanMenu.channelId); setChanMenu(null); if (ch) setRenameChannelDraft({ id: ch.id, name: ch.name }) }}>
                      <IconEdit size={14} /> Renomear canal
                    </button>
                    <button type="button" className="danger" onClick={() => { const id = chanMenu.channelId; setChanMenu(null); deleteChannel(id) }}>
                      <IconTrash size={14} /> Excluir canal
                    </button>
                  </div>
                </>
              )}

              {catMenu && (
                <>
                  <div className="play-group-menu-backdrop" onClick={() => setCatMenu(null)} onContextMenu={(e) => { e.preventDefault(); e.stopPropagation(); setCatMenu(null) }} />
                  <div className="play-group-menu" style={{ position: 'fixed', top: catMenu.y, left: catMenu.x }}>
                    <button type="button" onClick={() => { openNewChannelModal(catMenu.categoryId); setCatMenu(null) }}>
                      <IconPlus size={14} /> Criar canal aqui
                    </button>
                    <button type="button" onClick={() => { setShowNewCategory(true); setCatMenu(null) }}>
                      <IconPlus size={14} /> Criar categoria
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const cat = categories.find((c) => c.id === catMenu.categoryId)
                        setRenameCategoryId(catMenu.categoryId)
                        setRenameCategoryDraft(cat?.name || '')
                        setCatMenu(null)
                      }}
                    >
                      <IconEdit size={14} /> Renomear
                    </button>
                    <button type="button" className="danger" onClick={() => { deleteCategory(catMenu.categoryId); setCatMenu(null) }}>
                      <IconTrash size={14} /> Excluir categoria
                    </button>
                  </div>
                </>
              )}
            </aside>
            <div className="play-sidebar-resize-handle" onMouseDown={startSidebarResize} />
            <GroupInfoPanel
              group={group}
              myRole={myRole}
              members={members}
              me={me}
              can={can}
              channels={channels}
              categories={categories}
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
                {messages.map((m) => m.kind === 'bot_panel' ? (
                  <div key={m.id} className="play-message">
                    <AvatarBox src={m.author?.avatar_url} id={m.author_id} fallbackLetter={(m.author ? displayName(m.author) : 'B')[0]?.toUpperCase()} className="avatar-sm" />
                    <div className="play-message-body">
                      <div className="play-message-row"><strong>{m.author ? displayName(m.author) : 'Bot'}</strong><span className="play-bot-badge">APP</span></div>
                      {(() => {
                        let info: { title?: string; description?: string } = {}
                        try { info = JSON.parse(m.content) } catch { info = { title: m.content } }
                        return (
                          <div className="play-bot-panel">
                            <strong>{info.title}</strong>
                            {info.description && <p>{info.description}</p>}
                            <div className="play-bot-panel-buttons">
                              {(m.components || []).map((b) => (
                                <button key={b.id} type="button" disabled={sonorBusy} onClick={() => handleBotAction(b.action, m.channel_id)}>{b.label}</button>
                              ))}
                            </div>
                            {sonorNotice && <span className="play-bot-panel-notice">{sonorNotice}</span>}
                          </div>
                        )
                      })()}
                    </div>
                  </div>
                ) : (
                  <div key={m.id} className="play-message">
                    <AvatarBox src={m.author?.avatar_url} id={m.author_id} fallbackLetter={(m.author ? displayName(m.author) : '?')[0]?.toUpperCase()} className="avatar-sm" />
                    <div className="play-message-body">
                      <div className="play-message-row">
                        <strong
                          className="play-name-clickable"
                          onContextMenu={(e) => { if (m.author) { e.preventDefault(); openRoleQuickMenu(m.author_id, displayName(m.author), e.clientX, e.clientY) } }}
                          onClick={() => { if (m.author) setProfileCardId(m.author_id) }}
                        >
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
                        isImageMessage(m.content) ? <img className="play-message-img" src={m.content} alt="" /> : <p>{m.content}</p>
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
                {showChatEmoji && (
                  <>
                    <div className="play-group-menu-backdrop" onClick={() => setShowChatEmoji(false)} />
                    <div className="emoji-picker play-chat-emoji-picker">
                      {CHAT_EMOJIS.map((em) => (
                        <button key={em} type="button" onClick={() => { onDraftChange(draft + em); setShowChatEmoji(false) }}>{em}</button>
                      ))}
                    </div>
                  </>
                )}
                <button type="button" className="play-composer-tool" title="Emoji" onClick={() => setShowChatEmoji((v) => !v)}><IconSmile size={20} /></button>
                <button type="button" className="play-composer-tool" title="Enviar imagem" disabled={chatUploading} onClick={() => chatFileRef.current?.click()}><IconAttach size={20} /></button>
                <input ref={chatFileRef} type="file" accept="image/*" hidden onChange={handleChatFilePicked} />
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
            <div className="play-voice-holder" style={{ display: selectedChannel?.id === joinedVoiceChannel.id ? 'flex' : 'none', flex: 1, minWidth: 0, flexDirection: 'column', overflow: 'hidden' }}>
              <VoiceChannel key={joinedVoiceChannel.id} allow={{ speak: can('voice_speak'), camera: can('voice_camera'), screen: can('voice_screen') }} me={myPlayProfile} membersById={membersById} channel={joinedVoiceChannel} onParticipantsChange={setVoiceParticipants} onLeave={leaveVoice} pipIds={pipIds} maximizedId={maximizedId} onFullscreen={setFullscreenId} onTogglePip={togglePip} onToggleMaximize={(id) => setMaximizedId((cur) => (cur === id ? null : id))} onMediaMenu={(id, x, y) => setMediaMenu({ id, x, y, fromGrid: true })} />
            </div>
          )}

          <aside className="play-member-sidebar">
            <div className="play-member-tabs">
              <button type="button" className={memberTab === 'group' ? 'active' : ''} onClick={() => setMemberTab('group')}>No servidor</button>
              <button type="button" className={memberTab === 'voice' ? 'active' : ''} onClick={() => setMemberTab('voice')}>Na voz</button>
            </div>
            {memberTab === 'group' ? (
              <>
                {roleSections.map((sec) => (
                  <div key={sec.role.id}>
                    <div className="play-member-group-title">{sec.role.emoji ? sec.role.emoji + ' ' : ''}{sec.role.name.toUpperCase()} — {sec.list.length}</div>
                    {sec.list.map((m) => renderMemberRow(m, !isOnline(m)))}
                  </div>
                ))}
                {onlineRest.length > 0 && (
                  <div className="play-member-group-title">ONLINE — {onlineRest.length}</div>
                )}
                {onlineRest.map((m) => renderMemberRow(m, false))}
                {offlineRest.length > 0 && (
                  <div className="play-member-group-title">OFFLINE — {offlineRest.length}</div>
                )}
                {offlineRest.map((m) => renderMemberRow(m, true))}
              </>
            ) : (
              <>
                {voiceParticipants.length === 0 && <p className="play-empty">ninguém na voz agora</p>}
                {voiceParticipants.map((p) => (
                  <div key={p.id} className="play-member-row">
                    <AvatarBox src={p.id === me.id ? myPlayProfile.avatar_url : membersById[p.id]?.avatar_url || null} id={p.id} fallbackLetter={p.name[0]?.toUpperCase()} className="avatar-sm" />
                    <span
                      className="play-name-clickable"
                      onContextMenu={(e) => { e.preventDefault(); openRoleQuickMenu(p.id, p.name, e.clientX, e.clientY) }}
                      onClick={() => setProfileCardId(p.id)}
                    >
                      {p.name}
                    </span>
                    <IconHeadphones size={14} />
                    {p.videoTrack && !(p.id === me.id && p.isScreen) && (
                      <div className="play-mini-stream">
                        <StreamView track={p.videoTrack} muted className="play-mini-stream-video" />
                        <button type="button" className="play-mini-stream-menu" title="Opções" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMediaMenu({ id: p.id, x: Math.max(8, Math.min(r.left, window.innerWidth - 220)), y: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 140)), fromGrid: false }) }}><IconMore size={16} /></button>
                      </div>
                    )}
                  </div>
                ))}
              </>
            )}
          </aside>
        </div>
      </div>

      {mediaMenu && (
        <>
          <div className="play-group-menu-backdrop" onClick={() => setMediaMenu(null)} onContextMenu={(e) => { e.preventDefault(); setMediaMenu(null) }} />
          <div className="play-group-menu" style={{ position: 'fixed', top: Math.max(8, Math.min(mediaMenu.y, window.innerHeight - 150)), left: Math.max(8, Math.min(mediaMenu.x, window.innerWidth - 210)), minWidth: 190 }}>
            <button type="button" onClick={() => { const id = mediaMenu.id; setMediaMenu(null); togglePip(id) }}>
              <IconMonitorShare size={15} /> {pipIds.includes(mediaMenu.id) ? 'Sair do picture in picture' : 'Picture in picture'}
            </button>
            <button type="button" onClick={() => { const id = mediaMenu.id; setMediaMenu(null); setFullscreenId(id) }}>
              <IconFullscreen size={15} /> Tela cheia
            </button>
            {mediaMenu.fromGrid && (
              <button type="button" onClick={() => { const id = mediaMenu.id; setMediaMenu(null); setMaximizedId((cur) => (cur === id ? null : id)) }}>
                {maximizedId === mediaMenu.id ? <IconShrink size={15} /> : <IconFullscreen size={15} />} {maximizedId === mediaMenu.id ? 'Restaurar' : 'Maximizar'}
              </button>
            )}
          </div>
        </>
      )}
      {fullscreenId && trackOf(fullscreenId) && (
        <FullscreenOverlay name={nameOf(fullscreenId)} track={trackOf(fullscreenId)!} onClose={() => setFullscreenId(null)} />
      )}
      {pipWin && !pipWin.closed && createPortal(
        <div style={{ display: 'flex', flexDirection: 'column', width: '100%' }}>
          {pipIds.map((id) => {
            const tr = trackOf(id)
            if (!tr) return null
            return (
              <div key={id} style={{ position: 'relative', height: 270, flex: 'none', background: '#000' }}>
                <StreamView track={tr} muted style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                <span style={{ position: 'absolute', left: 8, top: 6, color: '#fff', font: '600 12px sans-serif', textShadow: '0 1px 3px #000' }}>{nameOf(id)}</span>
              </div>
            )
          })}
        </div>,
        pipWin.document.body,
      )}
      <audio ref={sonorAudioRef} hidden />
      {sonorSession && (
        <div className="play-sonor-bar">
          <span className="play-sonor-bar-title">Tocando: {sonorSession.title}</span>
          <input type="range" min="0" max="1" step="0.05" value={sonorVolume} onChange={(e) => setSonorVolume(Number(e.target.value))} />
          <button type="button" onClick={() => supabase.rpc('play_sonor_stop', { p_group_id: group.id })}>Parar</button>
        </div>
      )}
      {sonorModal && (
        <div className="modal-backdrop" onClick={() => setSonorModal(null)}>
          <div className="modal-card play-channel-modal" onClick={(e) => e.stopPropagation()}>
            <h2>{sonorModal === 'search' ? 'Tocar rádio' : 'Rádios favoritas'}</h2>
            {sonorModal === 'search' && (
              <div className="play-invite-code-row" style={{ marginBottom: 10 }}>
                <input placeholder="Nome da rádio" value={sonorQuery} onChange={(e) => setSonorQuery(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') searchStations() }} />
                <button type="button" className="google-btn" style={{ width: 'auto' }} disabled={sonorBusy} onClick={searchStations}>Buscar</button>
              </div>
            )}
            {(sonorModal === 'search' ? sonorResults : sonorFavs).map((st) => (
              <button key={st.url} type="button" className="play-sonor-station" disabled={sonorBusy} onClick={() => startStation(selectedChannel?.id || channels[0]?.id || '', st)}>
                {st.name}{st.country ? ' (' + st.country + ')' : ''}
              </button>
            ))}
            {sonorModal === 'favs' && sonorFavs.length === 0 && <p className="play-empty">você ainda não salvou nenhuma rádio</p>}
            <button type="button" className="modal-close" onClick={() => setSonorModal(null)}>fechar</button>
          </div>
        </div>
      )}

      {profileCardId && membersById[profileCardId] && (
        <PlayProfileCard
          profile={membersById[profileCardId]}
          roles={groupRoles}
          userRoleIds={roleIdsByUser[profileCardId] || []}
          canAssign={canAssign && profileCardId !== me.id}
          onToggleRole={(roleId, has) => toggleUserRole(profileCardId, roleId, has)}
          onClose={() => setProfileCardId(null)}
        />
      )}

      {roleQuickMenu && (
        <>
          <div className="play-group-menu-backdrop" onClick={() => setRoleQuickMenu(null)} />
          <div className="play-group-menu" style={{ position: 'fixed', top: roleQuickMenu.y, left: roleQuickMenu.x, minWidth: 200 }}>
            <div className="play-role-quick-menu-title">Cargos de {roleQuickMenu.name}</div>
            {groupRoles.length === 0 && <p className="play-empty" style={{ padding: '0 10px 8px' }}>nenhum cargo criado ainda</p>}
            {groupRoles.map((role) => {
              const has = roleQuickMenuIds.has(role.id)
              return (
                <button key={role.id} type="button" onClick={() => toggleQuickMenuRole(role.id, has)}>
                  <span className="play-role-quick-menu-check">{has ? '✓' : ''}</span>
                  {role.emoji ? `${role.emoji} ` : ''}{role.name}
                </button>
              )
            })}
          </div>
        </>
      )}

      {showServerInfo && (
        <ServerInfoScreen
          group={group}
          members={members}
          onClose={() => setShowServerInfo(false)}
          onConfigure={canConfigure ? () => { setShowServerInfo(false); setShowGroupInfo(true) } : undefined}
        />
      )}

      {showNewChannel && (
        <div className="modal-backdrop" onClick={() => setShowNewChannel(false)}>
          <div className="modal-card play-channel-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Criar canal</h2>
            <span className="play-channel-modal-subtitle">
              em {(categories.find((c) => c.id === newChannelCategoryId)?.name || 'sem categoria').toUpperCase()}
            </span>

            <label className="play-channel-modal-label">Tipo de canal</label>
            <div className="play-channel-kind-options">
              <label className={`play-channel-kind-option${newChannelKind === 'text' ? ' active' : ''}`}>
                <input type="radio" name="channel-kind" checked={newChannelKind === 'text'} onChange={() => setNewChannelKind('text')} />
                <IconHash size={18} />
                <div><strong>Texto</strong><span>Envie mensagens, imagens e emojis</span></div>
              </label>
              <label className={`play-channel-kind-option${newChannelKind === 'voice' ? ' active' : ''}`}>
                <input type="radio" name="channel-kind" checked={newChannelKind === 'voice'} onChange={() => setNewChannelKind('voice')} />
                <IconVideo size={18} />
                <div><strong>Voz</strong><span>Converse com áudio, vídeo e tela compartilhada</span></div>
              </label>
            </div>

            <label className="play-channel-modal-label" style={{ marginTop: 14 }}>Nome do canal</label>
            <div className="play-channel-modal-name-input">
              {newChannelKind === 'text' ? <IconHash size={16} /> : <IconVideo size={16} />}
              <input placeholder="novo-canal" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} />
            </div>

            <div className="play-channel-modal-private">
              <div>
                <strong><IconLock size={12} /> Canal privado</strong>
                <span>Somente membros e cargos selecionados poderão ver esse canal.</span>
              </div>
              <button type="button" className={`play-bot-switch${newChannelPrivate ? ' on' : ''}`} onClick={() => setNewChannelPrivate((v) => !v)}>
                <span className="play-bot-switch-knob" />
              </button>
            </div>
            {newChannelPrivate && <p className="play-empty">Defina quem pode ver esse canal na aba Cargos, no Config. do servidor, depois de criar.</p>}

            <div className="play-channel-modal-actions">
              <button type="button" className="modal-close" onClick={() => setShowNewChannel(false)}>Cancelar</button>
              <button type="button" className="google-btn" style={{ width: 'auto' }} disabled={!newChannelName.trim()} onClick={createChannel}>Criar canal</button>
            </div>
          </div>
        </div>
      )}

      {renameChannelDraft && (
        <div className="modal-backdrop" onClick={() => setRenameChannelDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Renomear canal</h2>
            <input autoFocus placeholder="Nome do canal" value={renameChannelDraft.name} onChange={(e) => setRenameChannelDraft({ ...renameChannelDraft, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') renameChannelSave() }} />
            <button type="button" className="google-btn" style={{ marginTop: 10 }} onClick={renameChannelSave}>Salvar</button>
            <button type="button" className="modal-close" onClick={() => setRenameChannelDraft(null)}>cancelar</button>
          </div>
        </div>
      )}

      {showNewCategory && (
        <div className="modal-backdrop" onClick={() => setShowNewCategory(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Criar categoria</h2>
            <input placeholder="Nome da categoria" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} />
            <button type="button" className="google-btn" style={{ marginTop: 10 }} onClick={createCategory}>Criar</button>
            <button type="button" className="modal-close" onClick={() => setShowNewCategory(false)}>fechar</button>
          </div>
        </div>
      )}

      {renameCategoryId && (
        <div className="modal-backdrop" onClick={() => setRenameCategoryId(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Renomear categoria</h2>
            <input placeholder="Nome da categoria" value={renameCategoryDraft} onChange={(e) => setRenameCategoryDraft(e.target.value)} />
            <button type="button" className="google-btn" style={{ marginTop: 10 }} onClick={renameCategory}>Salvar</button>
            <button type="button" className="modal-close" onClick={() => setRenameCategoryId(null)}>fechar</button>
          </div>
        </div>
      )}
    </main>
  )
}

function GroupInfoPanel({ group, myRole, members, me, can, channels, categories, open, onClose, onUpdate }: {
  group: PlayGroup; myRole: string | null; members: GroupMember[]; me: Profile; can: (perm: string) => boolean; channels: PlayChannel[]; categories: PlayCategory[]
  open: boolean; onClose: () => void; onUpdate: (patch: Partial<PlayGroup>) => void
}) {
  const isOwner = myRole === 'owner'
  const canGeral = can('manage_server')
  const canPrivacy = can('manage_privacy')
  const canKick = can('kick_members')
  const canBan = can('ban_members')
  const canMembersTab = canKick || canBan
  const canManageRoles = can('manage_roles')
  const canAssignRoles = can('assign_roles')
  const canRolesTab = canManageRoles || canAssignRoles
  const canBotsTab = can('manage_bots')
  const hasTabs = canGeral || canPrivacy || canMembersTab || canRolesTab || canBotsTab
  const [tab, setTab] = useState<'geral' | 'membros' | 'cargos' | 'bots'>('geral')
  const [name, setName] = useState(group.name)
  const [description, setDescription] = useState(group.description || '')
  const [tagDraft, setTagDraft] = useState('')
  const [tags, setTags] = useState<string[]>(group.tags || [])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [privacySaving, setPrivacySaving] = useState(false)
  const [closePassword, setClosePassword] = useState('')
  const [showClosePrompt, setShowClosePrompt] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [bans, setBans] = useState<{ user_id: string; profile?: Profile }[]>([])
  const [roles, setRoles] = useState<PlayRole[]>([])
  const [roleMemberIds, setRoleMemberIds] = useState<Record<string, string[]>>({})
  const [roleChannelIds, setRoleChannelIds] = useState<Record<string, string[]>>({})
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleEmoji, setNewRoleEmoji] = useState('')
  const [showRoleEmojiPicker, setShowRoleEmojiPicker] = useState(false)
  const [rosterRoleId, setRosterRoleId] = useState<string | null>(null)
  const [rosterAdding, setRosterAdding] = useState(false)
  const [roleEdit, setRoleEdit] = useState<{ id: string; name: string; emoji: string; permissions: string[]; hoisted: boolean } | null>(null)
  const [botCatalog, setBotCatalog] = useState<Bot[]>([])
  const [installedBotIds, setInstalledBotIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setName(group.name)
    setDescription(group.description || '')
    setTags(group.tags || [])
  }, [group.id, open])

  useEffect(() => {
    if (!open || tab !== 'membros' || !canBan) return
    let cancelled = false
    async function loadBans() {
      const { data: rows } = await supabase.from('play_group_bans').select('user_id').eq('group_id', group.id)
      const ids = (rows || []).map((r) => r.user_id as string)
      if (!ids.length) { if (!cancelled) setBans([]); return }
      const { data: profiles } = await supabase.from('profiles').select('*').in('id', ids)
      if (cancelled) return
      const profileMap = Object.fromEntries((profiles || []).map((p) => [p.id, p as Profile]))
      setBans(ids.map((id) => ({ user_id: id, profile: profileMap[id] })))
    }
    loadBans()
    return () => { cancelled = true }
  }, [open, tab, canBan, group.id])

  async function loadRoles() {
    const { data: roleRows } = await supabase.from('play_roles').select('*').eq('group_id', group.id).order('position', { ascending: true })
    const roleList = (roleRows || []) as PlayRole[]
    setRoles(roleList)
    if (!roleList.length) { setRoleMemberIds({}); setRoleChannelIds({}); return }
    const roleIds = roleList.map((r) => r.id)
    const { data: rm } = await supabase.from('play_role_members').select('role_id, user_id').in('role_id', roleIds)
    const memberMap: Record<string, string[]> = {}
    for (const row of rm || []) {
      const rId = row.role_id as string
      memberMap[rId] = [...(memberMap[rId] || []), row.user_id as string]
    }
    setRoleMemberIds(memberMap)
    const { data: ca } = await supabase.from('play_channel_role_access').select('role_id, channel_id').in('role_id', roleIds)
    const channelMap: Record<string, string[]> = {}
    for (const row of ca || []) {
      const rId = row.role_id as string
      channelMap[rId] = [...(channelMap[rId] || []), row.channel_id as string]
    }
    setRoleChannelIds(channelMap)
  }

  useEffect(() => {
    if (!open || tab !== 'cargos' || !canRolesTab) return
    loadRoles()
  }, [open, tab, canRolesTab, group.id])

  useEffect(() => {
    if (!open || tab !== 'bots' || !canBotsTab) return
    let cancelled = false
    async function loadBots() {
      const [{ data: catalog }, { data: installed }] = await Promise.all([
        supabase.from('bots').select('*'),
        supabase.from('play_group_bots').select('bot_id').eq('group_id', group.id),
      ])
      if (cancelled) return
      setBotCatalog((catalog || []) as Bot[])
      setInstalledBotIds(new Set((installed || []).map((r) => r.bot_id as string)))
    }
    loadBots()
    return () => { cancelled = true }
  }, [open, tab, canBotsTab, group.id])

  async function setupBotPanel(bot: Bot) {
    const cfg = bot.slug === 'sonor'
      ? {
          cat: 'SONOR', ch: 'painel', title: 'Painel de Rádio',
          desc: 'Toca rádio de verdade no servidor. Use os botões abaixo.',
          buttons: [
            { id: 'play', label: 'Tocar', action: 'sonor_play' },
            { id: 'random', label: 'Aleatória', action: 'sonor_random' },
            { id: 'stop', label: 'Parar', action: 'sonor_stop' },
            { id: 'save', label: 'Salvar atual', action: 'sonor_save' },
            { id: 'favs', label: 'Favoritos', action: 'sonor_favs' },
          ] as PlayBotButton[],
        }
      : bot.slug === 'zelador'
        ? {
            cat: 'ZELADOR', ch: 'comandos', title: 'Painel do Zelador',
            desc: 'Dados e sorteios pro servidor. Use os botões abaixo.',
            buttons: [
              { id: 'd6', label: 'Dado d6', action: 'zelador_d6' },
              { id: 'd20', label: 'Dado d20', action: 'zelador_d20' },
              { id: 'd100', label: 'Dado d100', action: 'zelador_d100' },
              { id: 'draw', label: 'Sorteio', action: 'zelador_draw' },
            ] as PlayBotButton[],
          }
        : null
    if (!cfg) return
    let cat = categories.find((c) => c.name.toUpperCase() === cfg.cat) || null
    if (!cat) {
      const { data } = await supabase.from('play_categories').insert({ group_id: group.id, name: cfg.cat, position: categories.length }).select().single()
      cat = (data as PlayCategory) || null
    }
    if (!cat) return
    let ch = channels.find((c) => c.category_id === cat!.id && c.name === cfg.ch) || null
    let created = false
    if (!ch) {
      const { data } = await supabase.from('play_channels').insert({ group_id: group.id, name: cfg.ch, kind: 'text', category_id: cat.id, position: 0 }).select().single()
      ch = (data as PlayChannel) || null
      created = true
    }
    if (ch && created) {
      const { error } = await supabase.rpc('post_play_bot_message', {
        p_channel_id: ch.id, p_bot_slug: bot.slug, p_content: JSON.stringify({ title: cfg.title, description: cfg.desc }),
        p_components: cfg.buttons, p_kind: 'bot_panel',
      })
      if (error) console.error('post bot panel failed', error)
    }
  }

  async function toggleBot(botId: string, installed: boolean) {
    if (installed) {
      await supabase.from('play_group_bots').delete().eq('group_id', group.id).eq('bot_id', botId)
      setInstalledBotIds((prev) => { const next = new Set(prev); next.delete(botId); return next })
    } else {
      const { error } = await supabase.from('play_group_bots').insert({ group_id: group.id, bot_id: botId, installed_by: me.id })
      if (error) { console.error('install bot failed', error); return }
      setInstalledBotIds((prev) => new Set(prev).add(botId))
      const bot = botCatalog.find((b) => b.id === botId)
      if (bot) await setupBotPanel(bot)
    }
  }

  async function createRole() {
    if (!newRoleName.trim() || roles.length >= 10) return
    await supabase.from('play_roles').insert({ group_id: group.id, name: newRoleName.trim(), emoji: newRoleEmoji.trim() || null, position: roles.length })
    setNewRoleName('')
    setNewRoleEmoji('')
    loadRoles()
  }

  async function moveRole(roleId: string, dir: -1 | 1) {
    const idx = roles.findIndex((r) => r.id === roleId)
    const target = idx + dir
    if (idx < 0 || target < 0 || target >= roles.length) return
    const next = [...roles]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    setRoles(next)
    await Promise.all(next.map((r, i) => (r.position === i ? null : supabase.from('play_roles').update({ position: i }).eq('id', r.id))))
    loadRoles()
  }

  async function saveRoleEdit() {
    if (!roleEdit || !roleEdit.name.trim()) return
    await supabase.from('play_roles').update({ name: roleEdit.name.trim(), emoji: roleEdit.emoji || null, permissions: roleEdit.permissions, hoisted: roleEdit.hoisted }).eq('id', roleEdit.id)
    setRoleEdit(null)
    loadRoles()
  }

  async function deleteRole(roleId: string) {
    if (!confirm('Excluir este cargo?')) return
    await supabase.from('play_roles').delete().eq('id', roleId)
    if (expandedRoleId === roleId) setExpandedRoleId(null)
    loadRoles()
  }

  async function toggleRoleMember(roleId: string, userId: string, has: boolean) {
    if (has) {
      await supabase.from('play_role_members').delete().eq('role_id', roleId).eq('user_id', userId)
      setRoleMemberIds((prev) => ({ ...prev, [roleId]: (prev[roleId] || []).filter((id) => id !== userId) }))
    } else {
      await supabase.from('play_role_members').insert({ role_id: roleId, user_id: userId })
      setRoleMemberIds((prev) => ({ ...prev, [roleId]: [...(prev[roleId] || []), userId] }))
    }
  }

  async function toggleRoleChannel(roleId: string, channelId: string, has: boolean) {
    if (has) {
      await supabase.from('play_channel_role_access').delete().eq('role_id', roleId).eq('channel_id', channelId)
      setRoleChannelIds((prev) => ({ ...prev, [roleId]: (prev[roleId] || []).filter((id) => id !== channelId) }))
    } else {
      await supabase.from('play_channel_role_access').insert({ role_id: roleId, channel_id: channelId })
      setRoleChannelIds((prev) => ({ ...prev, [roleId]: [...(prev[roleId] || []), channelId] }))
    }
  }

  async function save() {
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('play_groups').update({ name: name.trim(), description: description.trim() || null, tags }).eq('id', group.id)
    setSaving(false)
    if (err) { setError(err.message); return }
    onUpdate({ name: name.trim(), description: description.trim() || null, tags })
  }

  function addTag() {
    const t = tagDraft.trim()
    if (!t || tags.length >= 4) return
    setTags([...tags, t])
    setTagDraft('')
  }

  function removeTag(t: string) {
    setTags(tags.filter((x) => x !== t))
  }

  async function handleImagePick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      // O bucket "avatars" so aceita upload em pastas com o proprio auth.uid()
      // do usuario (RLS de storage) - usar group.id aqui era rejeitado
      // silenciosamente, dava a impressao de que a troca de imagem nao fazia nada.
      const url = await uploadImage(file, me.id, 'play-group')
      const { error } = await supabase.from('play_groups').update({ image_url: url }).eq('id', group.id)
      if (error) { console.error('update group image failed', error); return }
      onUpdate({ image_url: url })
    } catch (err) {
      console.error('group image upload failed', err)
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function togglePrivacy(nextClosed: boolean) {
    if (nextClosed) { setShowClosePrompt(true); return }
    setPrivacySaving(true)
    const { error: err } = await supabase.rpc('set_play_group_privacy', { p_group_id: group.id, p_is_closed: false })
    setPrivacySaving(false)
    if (!err) onUpdate({ is_closed: false })
  }

  async function confirmClose() {
    setPrivacySaving(true)
    const { error: err } = await supabase.rpc('set_play_group_privacy', { p_group_id: group.id, p_is_closed: true, p_password: closePassword || null })
    setPrivacySaving(false)
    if (!err) {
      onUpdate({ is_closed: true })
      setShowClosePrompt(false)
      setClosePassword('')
    }
  }

  async function deleteGroup() {
    await supabase.from('play_groups').delete().eq('id', group.id)
    onClose()
    window.location.reload()
  }

  async function kickMember(userId: string) {
    if (!confirm('Remover esta pessoa do servidor?')) return
    await supabase.from('play_group_members').delete().eq('group_id', group.id).eq('user_id', userId)
  }

  async function banMember(userId: string) {
    if (!confirm('Banir esta pessoa? Ela não vai poder voltar por convite até ser desbanida.')) return
    await supabase.rpc('ban_play_group_member', { p_group_id: group.id, p_user_id: userId })
    setBans((prev) => (prev.some((b) => b.user_id === userId) ? prev : [...prev, { user_id: userId }]))
  }

  async function unbanMember(userId: string) {
    await supabase.rpc('unban_play_group_member', { p_group_id: group.id, p_user_id: userId })
    setBans((prev) => prev.filter((b) => b.user_id !== userId))
  }

  const filteredMembers = members.filter((m) => displayName(m.profile).toLowerCase().includes(memberSearch.trim().toLowerCase()))

  return (
    <div className={`new-conv-panel${open ? ' open' : ''}`}>
      <div className="new-conv-header">
        <button type="button" className="icon-btn" onClick={onClose}><IconArrowLeft size={20} /></button>
        <strong>Sobre o servidor</strong>
      </div>

      {hasTabs && (
        <div className="play-group-info-tabs">
          <button type="button" className={tab === 'geral' ? 'active' : ''} onClick={() => setTab('geral')}>Geral</button>
          {canMembersTab && <button type="button" className={tab === 'membros' ? 'active' : ''} onClick={() => setTab('membros')}>Membros</button>}
          {canRolesTab && <button type="button" className={tab === 'cargos' ? 'active' : ''} onClick={() => setTab('cargos')}>Cargos</button>}
          {canBotsTab && <button type="button" className={tab === 'bots' ? 'active' : ''} onClick={() => setTab('bots')}>Bots</button>}
        </div>
      )}

      {(tab === 'geral' || !hasTabs) && (
        <div className="play-group-info-body">
          <div className="play-group-info-avatar">
            {canGeral ? (
              <button type="button" onClick={() => fileRef.current?.click()} style={{ border: 0, padding: 0, cursor: 'pointer', background: 'none' }} disabled={uploading}>
                <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
              </button>
            ) : (
              <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
            )}
            {canGeral && <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImagePick} />}
            {uploading && <span className="play-empty">enviando...</span>}
          </div>
          {canGeral || canPrivacy ? (
            <>
              {canGeral && (<>
              <label>Nome</label>
              <input value={name} onChange={(e) => setName(e.target.value)} />
              <label style={{ marginTop: 10 }}>Descrição</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Sem descrição" />
              <label style={{ marginTop: 10 }}>Características (até 4)</label>
              <div className="play-group-tags">
                {tags.map((t) => (
                  <span key={t} className="play-group-tag">{t} <button type="button" onClick={() => removeTag(t)}>×</button></span>
                ))}
              </div>
              {tags.length < 4 && (
                <div className="play-invite-code-row" style={{ marginTop: 6 }}>
                  <input placeholder="ex.: 🎮 gamer" value={tagDraft} onChange={(e) => setTagDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') addTag() }} />
                  <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={addTag}>Adicionar</button>
                </div>
              )}
              {error && <p className="auth-error">{error}</p>}
              <button type="button" className="google-btn" style={{ marginTop: 10 }} disabled={saving || !name.trim()} onClick={save}>
                {saving ? 'Salvando...' : 'Salvar'}
              </button>
              </>)}

              {canPrivacy && (<>
              <label style={{ marginTop: 16 }}>Privacidade</label>
              <div className="play-group-privacy-toggle">
                <button type="button" className={!group.is_closed ? 'active' : ''} disabled={privacySaving} onClick={() => togglePrivacy(false)}>
                  <IconLockOpen size={13} /> Aberto
                </button>
                <button type="button" className={group.is_closed ? 'active' : ''} disabled={privacySaving} onClick={() => togglePrivacy(true)}>
                  <IconLock size={13} /> Fechado
                </button>
              </div>
              {showClosePrompt && (
                <div className="play-invite-code-row" style={{ marginTop: 8 }}>
                  <input type="password" placeholder="Senha (opcional)" value={closePassword} onChange={(e) => setClosePassword(e.target.value)} />
                  <button type="button" className="google-btn" style={{ width: 'auto' }} disabled={privacySaving} onClick={confirmClose}>Confirmar</button>
                </div>
              )}
              </>)}
            </>
          ) : (
            <>
              <h2 style={{ margin: '8px 0 4px' }}>{group.name}</h2>
              <p style={{ color: 'var(--text-secondary)' }}>{group.description || 'sem descrição'}</p>
              {tags.length > 0 && (
                <div className="play-group-tags">
                  {tags.map((t) => <span key={t} className="play-group-tag">{t}</span>)}
                </div>
              )}
            </>
          )}
          <div className="play-group-info-badge">
            {group.is_closed ? <><IconLock size={13} /> Servidor fechado</> : <><IconLockOpen size={13} /> Servidor aberto</>}
          </div>

          {isOwner && (
            confirmDelete ? (
              <div style={{ marginTop: 20 }}>
                <p style={{ color: 'var(--danger, #e5484d)' }}>Excluir o servidor apaga todos os canais e mensagens. Não dá pra desfazer.</p>
                <button type="button" className="settings-danger-btn" onClick={deleteGroup}>Confirmar exclusão</button>
                <button type="button" className="modal-close" onClick={() => setConfirmDelete(false)}>cancelar</button>
              </div>
            ) : (
              <button type="button" className="settings-danger-btn" style={{ marginTop: 20 }} onClick={() => setConfirmDelete(true)}>Excluir servidor</button>
            )
          )}
        </div>
      )}

      {tab === 'membros' && canMembersTab && (
        <div className="play-group-info-body">
          <div className="play-member-search">
            <IconSearch size={14} />
            <input placeholder="Buscar membro..." value={memberSearch} onChange={(e) => setMemberSearch(e.target.value)} />
          </div>
          {filteredMembers.map((m) => (
            <div key={m.profile.id} className="play-manage-member-row">
              <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" />
              <span>{displayName(m.profile)}{m.profile.id === me.id ? ' (você)' : ''}</span>
              <span className="play-manage-member-role">{m.role}</span>
              {m.role === 'member' && m.profile.id !== me.id && (
                <div className="play-manage-member-actions">
                  {canKick && <button type="button" onClick={() => kickMember(m.profile.id)} title="Remover"><IconLogout size={14} /></button>}
                  {canBan && <button type="button" className="danger" onClick={() => banMember(m.profile.id)} title="Banir"><IconTrash size={14} /></button>}
                </div>
              )}
            </div>
          ))}

          {bans.length > 0 && (
            <>
              <label style={{ marginTop: 16 }}>Banidos</label>
              {bans.map((b) => (
                <div key={b.user_id} className="play-manage-member-row">
                  <AvatarBox src={b.profile?.avatar_url || null} id={b.user_id} fallbackLetter={(b.profile ? displayName(b.profile) : '?')[0]?.toUpperCase()} className="avatar-sm" />
                  <span>{b.profile ? displayName(b.profile) : 'usuário'}</span>
                  <button type="button" className="play-manage-member-unban" onClick={() => unbanMember(b.user_id)}>Desbanir</button>
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {tab === 'cargos' && canRolesTab && (
        <div className="play-group-info-body">
          {canManageRoles && roles.length < 10 && (
            <div className="play-invite-code-row" style={{ marginBottom: 12, position: 'relative' }}>
              <button type="button" className="play-role-emoji-btn" onClick={() => setShowRoleEmojiPicker((v) => !v)}>
                {newRoleEmoji || '🙂'}
              </button>
              {showRoleEmojiPicker && (
                <>
                  <div className="play-group-menu-backdrop" onClick={() => setShowRoleEmojiPicker(false)} />
                  <div className="emoji-picker" style={{ top: '110%', left: 0 }}>
                    {ROLE_EMOJIS.map((em) => (
                      <button key={em} type="button" onClick={() => { setNewRoleEmoji(em); setShowRoleEmojiPicker(false) }}>{em}</button>
                    ))}
                  </div>
                </>
              )}
              <input placeholder="Nome do cargo" value={newRoleName} onChange={(e) => setNewRoleName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createRole() }} />
              <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={createRole}>Criar</button>
            </div>
          )}
          {roles.length === 0 && <p className="play-empty">nenhum cargo criado ainda</p>}
          {roles.map((role) => {
            const memberIds = new Set(roleMemberIds[role.id] || [])
            const channelIds = new Set(roleChannelIds[role.id] || [])
            const expanded = expandedRoleId === role.id
            return (
              <div key={role.id} className="play-role-block">
                <button type="button" className="play-role-header" onClick={() => setExpandedRoleId(expanded ? null : role.id)}>
                  <span>{role.emoji ? `${role.emoji} ` : ''}{role.name}</span>
                  <span className="play-manage-member-role">{memberIds.size} membro(s)</span>
                </button>
                {expanded && (
                  <div className="play-role-detail">
                    <button type="button" className="play-role-list-btn" onClick={() => { setRosterRoleId(role.id); setRosterAdding(false) }}>
                      Listar membros ({memberIds.size})
                    </button>

                    {canManageRoles && (
                      <div className="play-role-order-row">
                        <button type="button" className="play-role-list-btn" onClick={() => moveRole(role.id, -1)}>Subir na lista</button>
                        <button type="button" className="play-role-list-btn" onClick={() => moveRole(role.id, 1)}>Descer</button>
                      </div>
                    )}
                    {canManageRoles && (
                      <button type="button" className="play-role-list-btn" style={{ marginTop: 8 }} onClick={() => setRoleEdit({ id: role.id, name: role.name, emoji: role.emoji || '', permissions: [...(role.permissions || [])], hoisted: !!role.hoisted })}>
                        Configurar cargo
                      </button>
                    )}

                    <label style={{ marginTop: 14 }}>Canais visíveis (nenhum marcado = visível pra todo mundo)</label>
                    {categories.map((cat) => (
                      <div key={cat.id}>
                        <span className="play-role-cat-label">{cat.name}</span>
                        {channels.filter((c) => c.category_id === cat.id).map((c) => (
                          <label key={c.id} className="play-role-check-row">
                            <input type="checkbox" checked={channelIds.has(c.id)} onChange={() => toggleRoleChannel(role.id, c.id, channelIds.has(c.id))} />
                            {c.kind === 'text' ? <IconHash size={13} /> : <IconVideo size={13} />} {c.name}
                          </label>
                        ))}
                      </div>
                    ))}

                    {canManageRoles && <button type="button" className="settings-danger-btn" style={{ marginTop: 18 }} onClick={() => deleteRole(role.id)}>Excluir cargo</button>}
                  </div>
                )}
              </div>
            )
          })}

          {roleEdit && (
            <div className="modal-backdrop" onClick={() => setRoleEdit(null)}>
              <div className="modal-card play-channel-modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '86vh', overflowY: 'auto' }}>
                <h2>Configurar cargo</h2>
                <label className="play-channel-modal-label">Nome e ícone</label>
                <div className="play-invite-code-row" style={{ marginBottom: 6 }}>
                  <input placeholder="Nome do cargo" value={roleEdit.name} onChange={(e) => setRoleEdit({ ...roleEdit, name: e.target.value })} />
                </div>
                <div className="play-role-emoji-row">
                  <button type="button" className={roleEdit.emoji === '' ? 'active' : ''} onClick={() => setRoleEdit({ ...roleEdit, emoji: '' })}>sem</button>
                  {ROLE_EMOJIS.map((em) => (
                    <button key={em} type="button" className={roleEdit.emoji === em ? 'active' : ''} onClick={() => setRoleEdit({ ...roleEdit, emoji: em })}>{em}</button>
                  ))}
                </div>
                <label className="play-role-check-row" style={{ marginTop: 14 }}>
                  <input type="checkbox" checked={roleEdit.hoisted} onChange={() => setRoleEdit({ ...roleEdit, hoisted: !roleEdit.hoisted })} />
                  Mostrar este cargo separado na lista de membros
                </label>
                <label className="play-channel-modal-label" style={{ marginTop: 14 }}>O que este cargo pode fazer</label>
                {PLAY_PERMISSIONS.map((grp) => (
                  <div key={grp.group}>
                    <span className="play-role-cat-label">{grp.group}</span>
                    {grp.items.map((it) => (
                      <label key={it.key} className="play-role-check-row">
                        <input
                          type="checkbox"
                          checked={roleEdit.permissions.includes(it.key)}
                          onChange={() => setRoleEdit({ ...roleEdit, permissions: roleEdit.permissions.includes(it.key) ? roleEdit.permissions.filter((x) => x !== it.key) : [...roleEdit.permissions, it.key] })}
                        />
                        {it.label}
                      </label>
                    ))}
                  </div>
                ))}
                <div className="play-channel-modal-actions">
                  <button type="button" className="modal-close" onClick={() => setRoleEdit(null)}>Cancelar</button>
                  <button type="button" className="google-btn" style={{ width: 'auto' }} disabled={!roleEdit.name.trim()} onClick={saveRoleEdit}>Salvar</button>
                </div>
              </div>
            </div>
          )}

          {rosterRoleId && (() => {
            const role = roles.find((r) => r.id === rosterRoleId)
            if (!role) return null
            const memberIds = new Set(roleMemberIds[role.id] || [])
            const withRole = members.filter((m) => memberIds.has(m.profile.id))
            const withoutRole = members.filter((m) => !memberIds.has(m.profile.id))
            return (
              <div className="modal-backdrop" onClick={() => setRosterRoleId(null)}>
                <div className="modal-card play-channel-modal" onClick={(e) => e.stopPropagation()}>
                  <div className="play-role-roster-header">
                    <h2>{role.emoji ? `${role.emoji} ` : ''}{role.name}</h2>
                    {!rosterAdding && (
                      <button type="button" className="icon-btn" onClick={() => setRosterAdding(true)} title="Adicionar membro"><IconPlus size={18} /></button>
                    )}
                  </div>
                  {rosterAdding ? (
                    <>
                      {withoutRole.length === 0 && <p className="play-empty">todo mundo já tem esse cargo</p>}
                      {withoutRole.map((m) => (
                        <div key={m.profile.id} className="play-manage-member-row">
                          <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" />
                          <span>{displayName(m.profile)}</span>
                          <button type="button" className="play-manage-member-unban" onClick={() => toggleRoleMember(role.id, m.profile.id, false)}>Adicionar</button>
                        </div>
                      ))}
                      <button type="button" className="modal-close" onClick={() => setRosterAdding(false)}>voltar</button>
                    </>
                  ) : (
                    <>
                      {withRole.length === 0 && <p className="play-empty">ninguém tem esse cargo ainda</p>}
                      {withRole.map((m) => (
                        <div key={m.profile.id} className="play-manage-member-row">
                          <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" />
                          <span>{displayName(m.profile)}</span>
                          <div className="play-manage-member-actions">
                            <button type="button" onClick={() => toggleRoleMember(role.id, m.profile.id, true)} title="Remover"><IconLogout size={14} /></button>
                          </div>
                        </div>
                      ))}
                      <button type="button" className="modal-close" onClick={() => setRosterRoleId(null)}>fechar</button>
                    </>
                  )}
                </div>
              </div>
            )
          })()}
        </div>
      )}

      {tab === 'bots' && canBotsTab && (
        <div className="play-group-info-body">
          {botCatalog.length === 0 && <p className="play-empty">nenhum bot disponível no catálogo ainda</p>}
          {botCatalog.map((bot) => {
            const installed = installedBotIds.has(bot.id)
            return (
              <div key={bot.id} className="play-bot-row">
                <div className="play-bot-row-copy">
                  <strong>{bot.name}</strong>
                  <span>{bot.description}</span>
                </div>
                {installed && (bot.slug === 'sonor' || bot.slug === 'zelador') && (
                  <button type="button" className="play-manage-member-unban" onClick={() => setupBotPanel(bot)}>Criar painel</button>
                )}
                <button type="button" className={`play-bot-switch${installed ? ' on' : ''}`} onClick={() => toggleBot(bot.id, installed)}>
                  <span className="play-bot-switch-knob" />
                </button>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function ProfilePanel({ me, open, onClose, onSaved }: { me: Profile; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [loaded, setLoaded] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatar_url ?? null)
  const [displayNameDraft, setDisplayNameDraft] = useState(me.display_name || me.username)
  const [statusDraft, setStatusDraft] = useState(me.status || '')
  const [font, setFont] = useState<string | null>(null)
  const [effect, setEffect] = useState<'solid' | 'gradient' | 'neon' | 'prism' | null>(null)
  const [color, setColor] = useState<string | null>(null)
  const [themePref, setThemePref] = useState<'light' | 'dark'>('dark')
  const [bannerColor, setBannerColor] = useState<string | null>(null)
  const [bannerImage, setBannerImage] = useState<string | null>(null)
  const [bannerUploading, setBannerUploading] = useState(false)
  const bannerFileRef = useRef<HTMLInputElement>(null)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
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
      setThemePref(p?.theme_preference || 'dark')
      setBannerColor(p?.banner_color || null)
      setBannerImage(p?.banner_image_url || null)
      setLoaded(true)
    })
  }, [me.id, open])

  async function upsert(patch: Partial<PlayProfile>) {
    await supabase.from('play_profiles').upsert({ user_id: me.id, ...patch }, { onConflict: 'user_id' })
  }

  // Tema aplica na hora (nao espera o "Salvar" geral) - senao clicar em
  // Claro/Escuro parece nao fazer nada ate a pessoa lembrar de salvar.
  async function applyTheme(next: 'light' | 'dark') {
    setThemePref(next)
    await upsert({ theme_preference: next })
    onSaved()
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
      theme_preference: themePref,
      banner_color: bannerColor,
      banner_image_url: bannerImage,
    })
    setSaving(false)
    onSaved()
  }

  async function handleBannerPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBannerUploading(true)
    try {
      const url = await uploadImage(file, me.id, 'play-banner')
      setBannerImage(url)
    } finally {
      setBannerUploading(false)
    }
  }

  function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) setCropFile(file)
    e.target.value = ''
  }

  async function handleCropConfirm(blob: Blob) {
    setCropFile(null)
    setUploading(true)
    try {
      const url = await uploadImage(new File([blob], 'avatar.jpg', { type: 'image/jpeg' }), me.id, 'play-avatar')
      setAvatarUrl(url)
      await upsert({ avatar_url: url })
      onSaved()
    } finally {
      setUploading(false)
    }
  }

  return (
    <>
      {open && <div className="play-profile-panel-backdrop" onClick={onClose} />}
      <div className={`new-conv-panel play-profile-panel${open ? ' open' : ''}`}>
      <div className="new-conv-header">
        <button type="button" className="icon-btn" onClick={onClose}><IconArrowLeft size={20} /></button>
        <strong>Perfil</strong>
      </div>
      <div className="play-group-info-body">
        <p style={{ color: 'var(--muted)', fontSize: 12 }}>Esse perfil é só do Thoth Play - editar aqui não muda seu perfil no resto do Thoth Messenger.</p>
        <button type="button" className="play-group-info-avatar" onClick={() => fileRef.current?.click()} style={{ border: 0, cursor: 'pointer' }}>
          <AvatarBox src={avatarUrl} id={me.id} fallbackLetter={(displayNameDraft || '?')[0]?.toUpperCase()} className="play-group-avatar" />
        </button>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarPick} />
        {uploading && <p className="play-empty">enviando foto...</p>}
        <label>Nome de exibição</label>
        <input value={displayNameDraft} onChange={(e) => setDisplayNameDraft(e.target.value)} />
        <label style={{ marginTop: 10 }}>Status</label>
        <input value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} placeholder="De boa" />

        <label style={{ marginTop: 14 }}>Card do perfil (aparece quando clicam no seu nome)</label>
        <div
          className="play-card-banner-preview"
          style={{ backgroundColor: bannerColor || '#3b6ef6', backgroundImage: bannerImage ? 'url(' + bannerImage + ')' : undefined }}
        />
        <div className="play-invite-code-row" style={{ marginTop: 6 }}>
          <input type="color" value={bannerColor && bannerColor.startsWith('#') ? bannerColor : '#3b6ef6'} onChange={(ev) => setBannerColor(ev.target.value)} style={{ width: 48, flex: 'none', padding: 2 }} />
          <button type="button" className="google-btn" style={{ width: 'auto' }} disabled={bannerUploading} onClick={() => bannerFileRef.current?.click()}>{bannerUploading ? 'Enviando...' : 'Imagem de fundo'}</button>
          {bannerImage && <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={() => setBannerImage(null)}>Remover</button>}
        </div>
        <input ref={bannerFileRef} type="file" accept="image/*" hidden onChange={handleBannerPick} />

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
            {effect === 'prism' ? (
              <>
                <label style={{ marginTop: 10 }}>Cores do prisma</label>
                <div className="prism-palette-picker">
                  {PRISM_PALETTES.map((pal) => (
                    <button
                      key={pal.id}
                      type="button"
                      title={pal.label}
                      className={'prism-palette' + ((color || 'rainbow') === pal.id ? ' active' : '')}
                      style={{ backgroundImage: 'linear-gradient(90deg,' + pal.colors.join(',') + ')' }}
                      onClick={() => setColor(pal.id)}
                    />
                  ))}
                </div>
              </>
            ) : (
              <>
                <label style={{ marginTop: 10 }}>Cor</label>
                <input
                  type="color"
                  value={color && color.startsWith('#') ? color : '#3b6ef6'}
                  onChange={(ev) => setColor(ev.target.value)}
                  style={{ width: 60, height: 34, padding: 2, marginTop: 2 }}
                />
              </>
            )}

            <label style={{ marginTop: 14 }}>Tema do Play</label>
            <div className="play-group-privacy-toggle">
              <button type="button" className={themePref === 'light' ? 'active' : ''} onClick={() => applyTheme('light')}>Claro</button>
              <button type="button" className={themePref === 'dark' ? 'active' : ''} onClick={() => applyTheme('dark')}>Escuro</button>
            </div>
          </>
        )}

        <button type="button" className="google-btn" style={{ marginTop: 14 }} disabled={saving} onClick={save}>
          {saving ? 'Salvando...' : 'Salvar'}
        </button>
      </div>
      </div>
      {cropFile && <AvatarCropModal file={cropFile} onCancel={() => setCropFile(null)} onConfirm={handleCropConfirm} />}
    </>
  )
}

function AvatarCropModal({ file, onCancel, onConfirm }: { file: File; onCancel: () => void; onConfirm: (blob: Blob) => void }) {
  const SIZE = 240
  const OUT = 256
  const [imgUrl] = useState(() => URL.createObjectURL(file))
  const [zoom, setZoom] = useState(1)
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const dragRef = useRef<{ startX: number; startY: number; origX: number; origY: number } | null>(null)
  const imgRef = useRef<HTMLImageElement>(null)

  useEffect(() => () => URL.revokeObjectURL(imgUrl), [imgUrl])

  function onPointerDown(e: ReactPointerEvent<HTMLDivElement>) {
    dragRef.current = { startX: e.clientX, startY: e.clientY, origX: pos.x, origY: pos.y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  function onPointerMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return
    setPos({ x: dragRef.current.origX + (e.clientX - dragRef.current.startX), y: dragRef.current.origY + (e.clientY - dragRef.current.startY) })
  }
  function onPointerUp() { dragRef.current = null }

  function confirm() {
    const img = imgRef.current
    if (!img) return
    const canvas = document.createElement('canvas')
    canvas.width = OUT
    canvas.height = OUT
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const baseScale = Math.max(SIZE / img.naturalWidth, SIZE / img.naturalHeight)
    const scale = baseScale * zoom * (OUT / SIZE)
    const drawW = img.naturalWidth * scale
    const drawH = img.naturalHeight * scale
    const drawX = OUT / 2 - drawW / 2 + pos.x * (OUT / SIZE)
    const drawY = OUT / 2 - drawH / 2 + pos.y * (OUT / SIZE)
    // Sem clip circular aqui - os avatares do Play sao quadrado-arredondado
    // (border-radius via CSS), nao circulo; recortar em circulo deixava as
    // quatro pontas da imagem pretas quando exibida no formato quadrado.
    ctx.drawImage(img, drawX, drawY, drawW, drawH)
    canvas.toBlob((blob) => { if (blob) onConfirm(blob) }, 'image/jpeg', 0.9)
  }

  return (
    <div className="modal-backdrop" onClick={onCancel}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Ajustar foto</h2>
        <div
          className="play-avatar-crop-viewport"
          style={{ width: SIZE, height: SIZE }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
        >
          <img
            ref={imgRef}
            src={imgUrl}
            alt=""
            draggable={false}
            style={{ transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px)) scale(${zoom})` }}
          />
        </div>
        <input type="range" min="1" max="3" step="0.05" value={zoom} onChange={(e) => setZoom(Number(e.target.value))} style={{ width: '100%', marginTop: 12 }} />
        <button type="button" className="google-btn" style={{ marginTop: 10 }} onClick={confirm}>Usar essa foto</button>
        <button type="button" className="modal-close" onClick={onCancel}>cancelar</button>
      </div>
    </div>
  )
}

type ParticipantTile = {
  id: string
  name: string
  isLocal: boolean
  micOn: boolean
  isScreen: boolean
  videoTrack?: Track
  cameraTrack?: Track
}

function fmtElapsed(ms: number) {
  const t = Math.max(0, Math.floor(ms / 1000))
  const h = Math.floor(t / 3600)
  const mm = String(Math.floor((t % 3600) / 60)).padStart(2, '0')
  const ss = String(t % 60).padStart(2, '0')
  return h > 0 ? h + ':' + mm + ':' + ss : mm + ':' + ss
}

function StreamView({ track, muted, videoRef, className, style, streamId }: {
  track: Track; muted?: boolean; videoRef?: { current: HTMLVideoElement | null }; className?: string; style?: React.CSSProperties; streamId?: string
}) {
  const elRef = useRef<HTMLVideoElement | null>(null)
  useEffect(() => {
    const el = elRef.current
    if (!el) return
    track.attach(el)
    return () => { track.detach(el) }
  }, [track])
  return (
    <video
      ref={(el) => { elRef.current = el; if (videoRef) videoRef.current = el }}
      data-stream-id={streamId}
      autoPlay
      playsInline
      muted={muted}
      className={className}
      style={style}
    />
  )
}

// Tela cheia propria (janela sem borda + video), em vez do fullscreen nativo do
// navegador que engasgava/duplicava a imagem. Botao quadradinho no canto volta.
function FullscreenOverlay({ name, track, onClose }: { name: string; track: Track; onClose: () => void }) {
  const [showUi, setShowUi] = useState(true)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  function poke() {
    setShowUi(true)
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => setShowUi(false), 2500)
  }
  useEffect(() => {
    poke()
    const winPromise = isTauriDesktop
      ? import('../lib/desktopWindows').then(async ({ currentWindow }) => {
          const w = currentWindow()
          await w.setFullscreen(true).catch(() => {})
          return w
        })
      : null
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('keydown', onKey)
      if (timerRef.current) clearTimeout(timerRef.current)
      winPromise?.then((w) => w.setFullscreen(false).catch(() => {}))
    }
  }, [])
  return createPortal(
    <div className="play-fullscreen" onMouseMove={poke} onContextMenu={(e) => e.preventDefault()}>
      <StreamView track={track} muted className="play-fullscreen-video" />
      <span className={'play-fullscreen-name' + (showUi ? ' show' : '')}>{name}</span>
      <button type="button" className={'play-fullscreen-exit' + (showUi ? ' show' : '')} onClick={onClose} title="Sair da tela cheia"><IconShrink size={20} /></button>
    </div>,
    document.body,
  )
}

function VoiceTile({ p, avatarUrl, startedAt, maximized, inPip, screenAudio, onFullscreen, onToggleMaximize, onMediaMenu }: {
  p: ParticipantTile; avatarUrl: string | null; startedAt?: number; maximized: boolean; inPip: boolean; screenAudio?: HTMLMediaElement
  onFullscreen: (id: string) => void; onTogglePip: (id: string) => void; onToggleMaximize: (id: string) => void
  onMediaMenu: (id: string, x: number, y: number) => void
}) {
  const videoElRef = useRef<HTMLVideoElement | null>(null)
  const [paused, setPaused] = useState(false)
  const [showOwnPreview, setShowOwnPreview] = useState(false)
  const [volume, setVolume] = useState(1)
  const [now, setNow] = useState(Date.now())
  const ownScreen = p.isLocal && p.isScreen

  useEffect(() => {
    if (!p.isScreen) return
    const t = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(t)
  }, [p.isScreen])

  useEffect(() => {
    if (screenAudio) screenAudio.volume = volume
  }, [volume, screenAudio])

  function togglePause() {
    const el = videoElRef.current
    if (!el) return
    if (el.paused) { el.play().catch(() => {}); screenAudio?.play().catch(() => {}); setPaused(false) }
    else { el.pause(); screenAudio?.pause(); setPaused(true) }
  }

  const showVideo = !!p.videoTrack && (!ownScreen || showOwnPreview)

  return (
    <div className={'play-voice-tile' + (maximized ? ' maximized' : '')}>
      <div className="play-voice-tile-head">
        {p.micOn ? <IconMic size={13} /> : <IconMicOff size={13} />}
        <span>{p.name}{p.isLocal ? ' (você)' : ''}</span>
        {p.isScreen && <em>transmitindo</em>}
        {inPip && <em>PiP</em>}
      </div>
      <div
        className="play-voice-tile-stage"
        onClick={() => { if (showVideo && !ownScreen) onToggleMaximize(p.id) }}
        onContextMenu={(e) => { e.preventDefault(); if (showVideo && !ownScreen) onMediaMenu(p.id, e.clientX, e.clientY) }}
      >
        {showVideo ? (
          <StreamView track={p.videoTrack!} muted={p.isLocal} videoRef={videoElRef} streamId={p.id} />
        ) : ownScreen ? (
          <div className="play-voice-own-share">
            <span>Você está transmitindo sua tela</span>
          </div>
        ) : (
          <AvatarBox src={avatarUrl} id={p.id} fallbackLetter={p.name[0]?.toUpperCase()} className="play-voice-avatar" />
        )}
        {ownScreen && (
          <button type="button" className="play-voice-preview-toggle" onClick={(e) => { e.stopPropagation(); setShowOwnPreview((v) => !v) }}>
            {showOwnPreview ? 'Ocultar prévia' : 'Mostrar prévia'}
          </button>
        )}
        {showVideo && !ownScreen && (
          <div className="play-voice-tile-controls" onClick={(e) => e.stopPropagation()}>
            <button type="button" onClick={togglePause} title={paused ? 'Continuar' : 'Pausar'}>{paused ? <IconPlay size={16} /> : <IconPause size={16} />}</button>
            {p.isScreen && startedAt && <span className="play-voice-time">{fmtElapsed(now - startedAt)}</span>}
            <span className="play-voice-controls-spacer" />
            {screenAudio && (
              <>
                <button type="button" onClick={() => setVolume((v) => (v > 0 ? 0 : 1))} title="Som">{volume > 0 ? <IconVolume size={16} /> : <IconVolumeOff size={16} />}</button>
                <input type="range" min="0" max="1" step="0.05" value={volume} onChange={(e) => setVolume(Number(e.target.value))} />
              </>
            )}
            <button type="button" onClick={() => onFullscreen(p.id)} title="Tela cheia"><IconFullscreen size={16} /></button>
            <button type="button" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onMediaMenu(p.id, r.left, r.top - 130) }} title="Mais opções"><IconMore size={16} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function VoiceChannel({ allow, me, membersById, channel, onParticipantsChange, onLeave, pipIds, maximizedId, onFullscreen, onTogglePip, onToggleMaximize, onMediaMenu }: {
  allow: { speak: boolean; camera: boolean; screen: boolean }
  me: Profile; membersById: Record<string, Profile>; channel: PlayChannel; onParticipantsChange: (p: VoiceParticipantInfo[]) => void; onLeave: () => void
  pipIds: string[]; maximizedId: string | null; onFullscreen: (id: string) => void; onTogglePip: (id: string) => void; onToggleMaximize: (id: string) => void
  onMediaMenu: (id: string, x: number, y: number) => void
}) {
  const roomRef = useRef<Room | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [micEnabled, setMicEnabled] = useState(true)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [screenEnabled, setScreenEnabled] = useState(false)
  const [participants, setParticipants] = useState<ParticipantTile[]>([])
  const [screenAudio, setScreenAudio] = useState<Record<string, HTMLMediaElement>>({})
  const shareStart = useRef<Record<string, number>>({})
  // Modo fone: liga o microfone SEM cancelamento de eco/supressao/ganho automatico. No Windows
  // essas funcoes colocam o dispositivo em modo "comunicacao" e deixam o som dos outros apps
  // abafado; com fone (sem retorno do alto-falante pro mic) nao precisam.
  const [headphoneMode, setHeadphoneMode] = useState(() => localStorage.getItem('play-headphone-mode') === '1')
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [shareQuality, setShareQuality] = useState<'480' | '720'>('720')
  const [shareLimit, setShareLimit] = useState<10 | 20 | 30>(30)
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const attachedAudio = useRef<HTMLMediaElement[]>([])

  function syncParticipants(room: Room) {
    const all: (LocalParticipant | RemoteParticipant)[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())]
    const tiles: ParticipantTile[] = all.map((p) => {
      const pubs = Array.from(p.trackPublications.values() as IterableIterator<TrackPublication>)
      const screenPub = pubs.find((pub) => pub.source === Track.Source.ScreenShare && !!pub.track)
      const camPub = pubs.find((pub) => pub.source === Track.Source.Camera && !!pub.track)
      const videoPub = screenPub || camPub
      if (screenPub) { if (!shareStart.current[p.identity]) shareStart.current[p.identity] = Date.now() }
      else delete shareStart.current[p.identity]
      return {
        id: p.identity,
        name: p.name || p.identity,
        isLocal: p === room.localParticipant,
        micOn: p.isMicrophoneEnabled,
        isScreen: !!screenPub,
        videoTrack: videoPub?.track,
        cameraTrack: screenPub ? camPub?.track : undefined,
      }
    })
    setParticipants(tiles)
    onParticipantsChange(tiles.map((t) => ({ id: t.id, name: t.name, micOn: t.micOn, isScreen: t.isScreen, videoTrack: t.videoTrack, cameraTrack: t.cameraTrack })))
  }

  useEffect(() => {
    let cancelled = false
    const room = new Room({
      audioCaptureDefaults: headphoneMode
        ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
        : undefined,
    })
    roomRef.current = room

    room
      .on(RoomEvent.ParticipantConnected, () => syncParticipants(room))
      .on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room))
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach()
          el.style.display = 'none'
          document.body.appendChild(el)
          attachedAudio.current.push(el)
          if (pub.source === Track.Source.ScreenShareAudio) setScreenAudio((prev) => ({ ...prev, [participant.identity]: el }))
        }
        syncParticipants(room)
      })
      .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => { el.remove(); attachedAudio.current = attachedAudio.current.filter((x) => x !== el) })
          if (pub.source === Track.Source.ScreenShareAudio) {
            setScreenAudio((prev) => { const next = { ...prev }; delete next[participant.identity]; return next })
          }
        }
        syncParticipants(room)
      })
      .on(RoomEvent.TrackMuted, () => syncParticipants(room))
      .on(RoomEvent.TrackUnmuted, () => syncParticipants(room))
      .on(RoomEvent.LocalTrackPublished, () => syncParticipants(room))
      .on(RoomEvent.LocalTrackUnpublished, () => syncParticipants(room))

    ;(async () => {
      try {
        const { token, url } = await fetchLiveKitToken(channel.id)
        if (cancelled) return
        await room.connect(url, token)
        if (allow.speak) await room.localParticipant.setMicrophoneEnabled(true)
        else setMicEnabled(false)
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
      attachedAudio.current.forEach((el) => el.remove())
      attachedAudio.current = []
    }
  }, [channel.id])

  async function toggleMic() {
    const room = roomRef.current
    if (!room) return
    const next = !micEnabled
    await room.localParticipant.setMicrophoneEnabled(next)
    setMicEnabled(next)
    syncParticipants(room)
  }

  async function toggleHeadphoneMode() {
    const next = !headphoneMode
    setHeadphoneMode(next)
    try { localStorage.setItem('play-headphone-mode', next ? '1' : '0') } catch { /* ignore */ }
    const track = roomRef.current?.localParticipant.getTrackPublication(Track.Source.Microphone)?.audioTrack
    await track?.restartTrack(next
      ? { echoCancellation: false, noiseSuppression: false, autoGainControl: false }
      : { echoCancellation: true, noiseSuppression: true, autoGainControl: true }).catch(() => {})
  }

  async function toggleCamera() {
    const room = roomRef.current
    if (!room) return
    const next = !cameraEnabled
    await room.localParticipant.setCameraEnabled(next)
    setCameraEnabled(next)
    syncParticipants(room)
  }

  // Transmissao tem tempo maximo (10/20/30 min) pra nao pesar: passou, encerra a tela
  // sozinha e avisa, sem tirar a pessoa da chamada de voz.
  useEffect(() => {
    if (!screenEnabled) return
    const t = setTimeout(async () => {
      const room = roomRef.current
      if (!room) return
      await room.localParticipant.setScreenShareEnabled(false).catch(() => {})
      setScreenEnabled(false)
      syncParticipants(room)
      setShareNotice('O compartilhamento de tela dura no máximo ' + shareLimit + ' minutos e foi encerrado. Você continua na chamada; compartilhe de novo se precisar.')
    }, shareLimit * 60 * 1000)
    return () => clearTimeout(t)
  }, [screenEnabled, shareLimit])

  useEffect(() => {
    if (!shareNotice) return
    const t = setTimeout(() => setShareNotice(null), 10000)
    return () => clearTimeout(t)
  }, [shareNotice])

  // Abre o seletor de tela/janela do sistema (serve tanto pra comecar quanto pra TROCAR
  // o que ta sendo compartilhado sem parar antes) - se cancelar, mantem a transmissao atual.
  async function chooseScreen() {
    const room = roomRef.current
    if (!room) return
    setShareMenuOpen(false)
    const res = shareQuality === '480' ? { width: 854, height: 480, frameRate: 30 } : { width: 1280, height: 720, frameRate: 30 }
    try {
      const tracks = await createLocalScreenTracks({ audio: true, resolution: res })
      if (screenEnabled) await room.localParticipant.setScreenShareEnabled(false)
      for (const t of tracks) await room.localParticipant.publishTrack(t)
      setScreenEnabled(true)
      syncParticipants(room)
    } catch {
      // usuario cancelou o seletor de tela
    }
  }

  async function stopScreenShare() {
    const room = roomRef.current
    if (!room) return
    setShareMenuOpen(false)
    await room.localParticipant.setScreenShareEnabled(false)
    setScreenEnabled(false)
    syncParticipants(room)
  }

  return (
    <div className="play-voice-channel">
      <header className="play-text-channel-header"><IconVideo size={17} /> {channel.name}</header>
      {shareNotice && <div className="play-share-notice">{shareNotice}</div>}
      {connecting && <p className="play-empty">conectando...</p>}
      {error && <p className="play-empty error">{error}</p>}
      {connected && (
        <>
          <div className={'play-voice-grid' + (maximizedId ? ' has-max' : '')}>
            {participants.flatMap((p0) => (p0.cameraTrack ? [p0, { ...p0, id: p0.id + ':cam', isScreen: false, videoTrack: p0.cameraTrack, cameraTrack: undefined }] : [p0])).map((p) => (
              <VoiceTile
                key={p.id}
                p={p}
                avatarUrl={(p.isLocal ? me.avatar_url : membersById[p.id.replace(':cam', '')]?.avatar_url) || null}
                startedAt={shareStart.current[p.id.replace(':cam', '')]}
                maximized={maximizedId === p.id}
                inPip={pipIds.includes(p.id)}
                screenAudio={screenAudio[p.id.replace(':cam', '')]}
                onFullscreen={onFullscreen}
                onTogglePip={onTogglePip}
                onToggleMaximize={onToggleMaximize}
                onMediaMenu={onMediaMenu}
              />
            ))}
          </div>
          <div className="play-voice-controls">
            <button type="button" className={'icon-btn' + (micEnabled ? ' active' : '')} onClick={toggleMic} disabled={!allow.speak} title={!allow.speak ? 'Seu cargo não pode falar na chamada' : micEnabled ? 'Mutar' : 'Ativar microfone'}>
              {micEnabled ? <IconMic size={20} /> : <IconMicOff size={20} />}
            </button>
            <button type="button" className={'icon-btn' + (headphoneMode ? ' active' : '')} onClick={toggleHeadphoneMode} title={headphoneMode ? 'Modo fone ligado (sem cancelamento de eco)' : 'Modo fone: use com fone, evita o som do PC ficar abafado'}>
              <IconHeadphones size={20} />
            </button>
            <button type="button" className={'icon-btn' + (cameraEnabled ? ' active' : '')} onClick={toggleCamera} disabled={!allow.camera} title={!allow.camera ? 'Seu cargo não pode ligar a câmera' : cameraEnabled ? 'Desligar câmera' : 'Ligar câmera'}>
              {cameraEnabled ? <IconVideo size={20} /> : <IconVideoOff size={20} />}
            </button>
            <span className="play-share-wrap">
              <button type="button" className={'icon-btn' + (screenEnabled ? ' active' : '')} onClick={() => setShareMenuOpen((v) => !v)} disabled={!allow.screen} title={allow.screen ? 'Compartilhar tela' : 'Seu cargo não pode compartilhar tela'}>
                <IconMonitorShare size={20} />
              </button>
              {shareMenuOpen && (
                <>
                  <div className="play-group-menu-backdrop" onClick={() => setShareMenuOpen(false)} />
                  <div className="play-share-menu">
                    <strong>{screenEnabled ? 'Compartilhando sua tela' : 'Compartilhar tela'}</strong>
                    <span className="play-share-menu-label">Duração máxima</span>
                    <div className="play-share-quality">
                      {([10, 20, 30] as const).map((m) => (
                        <button key={m} type="button" className={shareLimit === m ? 'active' : ''} onClick={() => setShareLimit(m)}>{m} min</button>
                      ))}
                    </div>
                    <span className="play-share-menu-label">Qualidade</span>
                    <div className="play-share-quality">
                      <button type="button" className={shareQuality === '480' ? 'active' : ''} onClick={() => setShareQuality('480')}>480p</button>
                      <button type="button" className={shareQuality === '720' ? 'active' : ''} onClick={() => setShareQuality('720')}>720p</button>
                      <button type="button" disabled title="Em breve">1080p</button>
                    </div>
                    <button type="button" className="google-btn" onClick={chooseScreen}>{screenEnabled ? 'Trocar tela ou janela' : 'Escolher tela ou janela'}</button>
                    {screenEnabled && <button type="button" className="settings-danger-btn" onClick={stopScreenShare}>Parar de compartilhar</button>}
                  </div>
                </>
              )}
            </span>
            <button type="button" className="icon-btn play-voice-leave" onClick={onLeave} title="Desconectar da chamada">
              <IconPhoneOff size={20} />
            </button>
          </div>
        </>
      )}
    </div>
  )
}
