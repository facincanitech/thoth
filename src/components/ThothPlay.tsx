import { useEffect, useRef, useState, type ChangeEvent, type MouseEvent as ReactMouseEvent } from 'react'
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
  IconArrowLeft, IconChevronDown, IconCopy, IconEdit, IconGamepad, IconGrip, IconHash, IconHeadphones,
  IconLock, IconLockOpen, IconLogout, IconMic, IconMicOff, IconMonitorShare, IconPhoneOff, IconPlus,
  IconSearch, IconSend, IconSettingsGear, IconTrash, IconUser, IconVideo, IconVideoOff,
} from './icons'
import type { Bot, PlayCategory, PlayChannel, PlayGroup, PlayMessage, PlayProfile, PlayRole, Profile } from '../types'

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
  const [myPlayProfile, setMyPlayProfile] = useState<Profile>(me)
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
    setMyPlayProfile(mergePlayProfile(me, data as PlayProfile | null))
  }

  useEffect(() => {
    loadMyPlayProfile()
  }, [me.id])

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

  return (
    <div className="play-app-shell">
      <PlayIconRail
        myGroups={myGroups}
        selectedGroupId={selectedGroup?.id ?? null}
        onSelectGroup={openGroup}
        onGoHome={goHome}
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

function PlayIconRail({ myGroups, selectedGroupId, onSelectGroup, onGoHome, me, myPlayProfile, onOpenProfile }: {
  myGroups: PlayGroup[]
  selectedGroupId: string | null
  onSelectGroup: (g: PlayGroup) => void
  onGoHome: () => void
  me: Profile
  myPlayProfile: Profile
  onOpenProfile: () => void
}) {
  return (
    <aside className="play-icon-rail">
      <button type="button" className="play-icon-rail-home" title="Meus servidores" onClick={onGoHome}>
        <IconGamepad size={20} />
      </button>
      <div className="play-icon-rail-groups">
        {myGroups.map((g) => (
          <button
            key={g.id}
            type="button"
            className={`play-icon-rail-group${selectedGroupId === g.id ? ' active' : ''}`}
            title={g.name}
            onClick={() => onSelectGroup(g)}
          >
            <AvatarBox src={g.image_url} id={g.id} fallbackLetter={g.name[0]?.toUpperCase()} className="play-group-avatar" />
          </button>
        ))}
        <button type="button" className="play-icon-rail-group play-icon-rail-add" title="Entrar ou criar servidor" onClick={onGoHome}>
          <IconPlus size={18} />
        </button>
      </div>
      <div className="play-icon-rail-spacer" />
      <button type="button" className="play-icon-rail-group play-icon-rail-profile" title="Perfil" onClick={onOpenProfile}>
        <AvatarBox src={myPlayProfile.avatar_url} id={me.id} fallbackLetter={displayName(myPlayProfile)[0]?.toUpperCase()} className="play-group-avatar" />
      </button>
    </aside>
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
  onSelectChannel: (c: PlayChannel) => void
  onChannelsChange: () => void
  onCategoriesChange: () => void
  onGroupUpdate: (patch: Partial<PlayGroup>) => void
  onLeftGroup: () => void
  onExitToMessenger: () => void
}

type GroupMember = { profile: Profile; role: string }
type VoiceParticipantInfo = { id: string; name: string }

function GroupView({ me, myPlayProfile, group, channels, categories, selectedChannel, messages, hasReplaySet, liveTyping, draft, onDraftChange, onSend, onSelectChannel, onChannelsChange, onCategoriesChange, onGroupUpdate, onLeftGroup, onExitToMessenger }: GroupViewProps) {
  const [showNewChannel, setShowNewChannel] = useState(false)
  const [joinedVoiceChannel, setJoinedVoiceChannel] = useState<PlayChannel | null>(null)
  const [openReplayId, setOpenReplayId] = useState<string | null>(null)
  const [replayEvents, setReplayEvents] = useState<ReplayEvent[] | null>(null)
  const [showGroupInfo, setShowGroupInfo] = useState(false)
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
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [newCategoryName, setNewCategoryName] = useState('')
  const [catMenu, setCatMenu] = useState<{ categoryId: string; x: number; y: number } | null>(null)
  const [renameCategoryId, setRenameCategoryId] = useState<string | null>(null)
  const [renameCategoryDraft, setRenameCategoryDraft] = useState('')
  const [dragChannelId, setDragChannelId] = useState<string | null>(null)
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [members, setMembers] = useState<GroupMember[]>([])
  const [memberTab, setMemberTab] = useState<'group' | 'voice'>('group')
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipantInfo[]>([])

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
  const myRole = members.find((m) => m.profile.id === me.id)?.role || null
  const membersById = Object.fromEntries(members.map((m) => [m.profile.id, m.profile]))
  const canManage = myRole === 'owner' || myRole === 'admin'
  const channelsByCategory = (categoryId: string) => channels.filter((c) => c.category_id === categoryId).sort((a, b) => a.position - b.position)
  const uncategorized = channels.filter((c) => !c.category_id || !categories.some((cat) => cat.id === c.category_id)).sort((a, b) => a.position - b.position)

  function openNewChannelModal(categoryId: string | null, kind: 'text' | 'voice' = 'text') {
    setNewChannelCategoryId(categoryId)
    setNewChannelKind(kind)
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
          <button type="button" className="play-group-topbar-avatar-btn" onClick={() => setShowGroupInfo(true)} title="Sobre o servidor">
            <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
          </button>
          <div className="play-group-topbar-copy">
            <div className="play-group-topbar-title">
              <button type="button" className="play-group-topbar-name-btn" onClick={() => setShowGroupInfo(true)} title="Sobre o servidor">
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

        <div className="play-group-body">
          <div className="play-channel-sidebar-wrap" ref={sidebarWrapRef} style={sidebarWidth ? { width: sidebarWidth } : undefined}>
            <aside
              className="play-channel-sidebar"
              style={sidebarWidth ? { width: sidebarWidth } : undefined}
              onContextMenu={(e) => {
                if (!canManage || (e.target as HTMLElement).closest('.play-channel-group-title')) return
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

              {catMenu && (
                <>
                  <div className="play-group-menu-backdrop" onClick={() => setCatMenu(null)} />
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
                {messages.map((m) => (
                  <div key={m.id} className="play-message">
                    <AvatarBox src={m.author?.avatar_url} id={m.author_id} fallbackLetter={(m.author ? displayName(m.author) : '?')[0]?.toUpperCase()} className="avatar-sm" />
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
              <VoiceChannel key={joinedVoiceChannel.id} me={myPlayProfile} membersById={membersById} channel={joinedVoiceChannel} onParticipantsChange={setVoiceParticipants} onLeave={leaveVoice} />
            </div>
          )}

          <aside className="play-member-sidebar">
            <div className="play-member-tabs">
              <button type="button" className={memberTab === 'group' ? 'active' : ''} onClick={() => setMemberTab('group')}>No servidor</button>
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
            <h2>Criar canal</h2>
            <input placeholder="Nome do canal" value={newChannelName} onChange={(e) => setNewChannelName(e.target.value)} />
            <div className="play-channel-kind-toggle">
              <button type="button" className={newChannelKind === 'text' ? 'active' : ''} onClick={() => setNewChannelKind('text')}><IconHash size={14} /> Texto</button>
              <button type="button" className={newChannelKind === 'voice' ? 'active' : ''} onClick={() => setNewChannelKind('voice')}><IconVideo size={14} /> Voz</button>
            </div>
            <button type="button" className="google-btn" style={{ marginTop: 10 }} onClick={createChannel}>Criar</button>
            <button type="button" className="modal-close" onClick={() => setShowNewChannel(false)}>fechar</button>
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

function GroupInfoPanel({ group, myRole, members, me, channels, categories, open, onClose, onUpdate }: {
  group: PlayGroup; myRole: string | null; members: GroupMember[]; me: Profile; channels: PlayChannel[]; categories: PlayCategory[]
  open: boolean; onClose: () => void; onUpdate: (patch: Partial<PlayGroup>) => void
}) {
  const canManage = myRole === 'owner' || myRole === 'admin'
  const isOwner = myRole === 'owner'
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
  const [botCatalog, setBotCatalog] = useState<Bot[]>([])
  const [installedBotIds, setInstalledBotIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setName(group.name)
    setDescription(group.description || '')
    setTags(group.tags || [])
  }, [group.id, open])

  useEffect(() => {
    if (!open || tab !== 'membros' || !canManage) return
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
  }, [open, tab, canManage, group.id])

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
    if (!open || tab !== 'cargos' || !canManage) return
    loadRoles()
  }, [open, tab, canManage, group.id])

  useEffect(() => {
    if (!open || tab !== 'bots' || !canManage) return
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
  }, [open, tab, canManage, group.id])

  async function toggleBot(botId: string, installed: boolean) {
    if (installed) {
      await supabase.from('play_group_bots').delete().eq('group_id', group.id).eq('bot_id', botId)
      setInstalledBotIds((prev) => { const next = new Set(prev); next.delete(botId); return next })
    } else {
      await supabase.from('play_group_bots').insert({ group_id: group.id, bot_id: botId, installed_by: me.id })
      setInstalledBotIds((prev) => new Set(prev).add(botId))
    }
  }

  async function createRole() {
    if (!newRoleName.trim() || roles.length >= 10) return
    await supabase.from('play_roles').insert({ group_id: group.id, name: newRoleName.trim(), emoji: newRoleEmoji.trim() || null, position: roles.length })
    setNewRoleName('')
    setNewRoleEmoji('')
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
      const url = await uploadImage(file, group.id, 'play-group')
      await supabase.from('play_groups').update({ image_url: url }).eq('id', group.id)
      onUpdate({ image_url: url })
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

      {canManage && (
        <div className="play-group-info-tabs">
          <button type="button" className={tab === 'geral' ? 'active' : ''} onClick={() => setTab('geral')}>Geral</button>
          <button type="button" className={tab === 'membros' ? 'active' : ''} onClick={() => setTab('membros')}>Membros</button>
          <button type="button" className={tab === 'cargos' ? 'active' : ''} onClick={() => setTab('cargos')}>Cargos</button>
          <button type="button" className={tab === 'bots' ? 'active' : ''} onClick={() => setTab('bots')}>Bots</button>
        </div>
      )}

      {(tab === 'geral' || !canManage) && (
        <div className="play-group-info-body">
          <div className="play-group-info-avatar">
            {isOwner ? (
              <button type="button" onClick={() => fileRef.current?.click()} style={{ border: 0, padding: 0, cursor: 'pointer', background: 'none' }} disabled={uploading}>
                <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
              </button>
            ) : (
              <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar" />
            )}
            {isOwner && <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleImagePick} />}
            {uploading && <span className="play-empty">enviando...</span>}
          </div>
          {isOwner ? (
            <>
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

      {tab === 'membros' && canManage && (
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
                  <button type="button" onClick={() => kickMember(m.profile.id)} title="Remover"><IconLogout size={14} /></button>
                  <button type="button" className="danger" onClick={() => banMember(m.profile.id)} title="Banir"><IconTrash size={14} /></button>
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

      {tab === 'cargos' && canManage && (
        <div className="play-group-info-body">
          {roles.length < 10 && (
            <div className="play-invite-code-row" style={{ marginBottom: 12 }}>
              <input placeholder="emoji" value={newRoleEmoji} onChange={(e) => setNewRoleEmoji(e.target.value)} style={{ width: 52, flex: 'none', textAlign: 'center' }} />
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
                    <button type="button" className="settings-danger-btn" style={{ marginBottom: 12 }} onClick={() => deleteRole(role.id)}>Excluir cargo</button>

                    <label>Membros com este cargo</label>
                    {members.map((m) => (
                      <label key={m.profile.id} className="play-role-check-row">
                        <input type="checkbox" checked={memberIds.has(m.profile.id)} onChange={() => toggleRoleMember(role.id, m.profile.id, memberIds.has(m.profile.id))} />
                        <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" />
                        {displayName(m.profile)}
                      </label>
                    ))}

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
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {tab === 'bots' && canManage && (
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
    onSaved()
  }

  async function handleAvatarPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const url = await uploadImage(file, me.id, 'play-avatar')
      setAvatarUrl(url)
      await upsert({ avatar_url: url })
      onSaved()
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

function VoiceChannel({ me, membersById, channel, onParticipantsChange, onLeave }: { me: Profile; membersById: Record<string, Profile>; channel: PlayChannel; onParticipantsChange: (p: VoiceParticipantInfo[]) => void; onLeave: () => void }) {
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
                  <AvatarBox src={p.isLocal ? me.avatar_url : membersById[p.id]?.avatar_url || null} id={p.id} fallbackLetter={p.name[0]?.toUpperCase()} className="play-voice-avatar" />
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
