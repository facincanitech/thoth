import { createPortal } from 'react-dom'
import { Capacitor } from '@capacitor/core'
import { openPip, closePip, updatePipTrack } from '../lib/pipBridge'
import { openMainWindow } from '../lib/desktopWindows'
import { isTauriDesktop } from '../lib/platform'
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type CSSProperties, type MouseEvent as ReactMouseEvent, type PointerEvent as ReactPointerEvent } from 'react'
import { Room, RoomEvent, Track, createLocalScreenTracks, type AudioCaptureOptions, type RemoteParticipant, type LocalParticipant, type TrackPublication } from 'livekit-client'
import { supabase } from '../lib/supabase'
import { fetchLiveKitToken } from '../lib/livekit'
import { setMediaAudioMode, setSpeakerphoneOn } from '../lib/audioRoute'
import { displayName } from '../lib/displayName'
import { AvatarBox } from './AvatarBox'
import { getPresenceColor } from '../lib/presence'
import { ReplayPlayer, type ReplayEvent } from './ReplayPlayer'
import { StyledName } from './StyledName'
import { uploadImage } from '../lib/uploadImage'
import {
  IconArrowLeft, IconChat, IconChevronDown, IconCopy, IconEdit, IconGamepad, IconGrip, IconHash, IconHeadphones,
  IconLock, IconLockOpen, IconLogout, IconMic, IconMicOff, IconHeadphonesOff, IconMonitorShare, IconPanelLeft, IconFolder, IconMore, IconPause, IconPlay, IconFullscreen, IconShrink, IconVolume, IconVolumeOff, IconPhoneOff, IconPlus,
  IconAttach, IconSearch, IconSend, IconSmile, IconSettingsGear, IconTrash, IconUser, IconMinusCircle, IconVideo, IconVideoOff,
} from './icons'
import { BANNER_COLORS } from './ChatList'
import { fetchRandomStation, searchPublicStations, isHlsStream, toPlayableUrl, type RadioStation } from '../lib/sonor'
import { DEFAULT_PLAY_THEME, PLAY_THEMES, normalizePlayTheme, type PlayThemeId } from '../lib/playThemes'
import { openDirectMessage } from '../lib/directMessage'
import { ensurePlayBotPanel } from '../lib/playBotPanels'
import { ThothStore } from './ThothStore'
import { playInviteUrl } from '../lib/inviteLink'
import type { Bot, PlaySonorSession, PlayCategory, PlayChannel, PlayGroup, PlayMessage, PlayProfile, PlayRole, Profile } from '../types'

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
    { key: 'approve_members', label: 'Aprovar pedidos de entrada em servidor privado' },
  ] },
  { group: 'Chamada de voz', items: [
    { key: 'voice_speak', label: 'Falar na chamada' },
    { key: 'voice_camera', label: 'Ligar a câmera' },
    { key: 'voice_screen', label: 'Compartilhar tela' },
  ] },
  { group: 'Administrador', items: [
    { key: 'administrator', label: 'Administrador — libera tudo deste cargo' },
  ] },
]
const DEFAULT_MEMBER_PERMS = ['voice_speak', 'voice_camera', 'voice_screen', 'use_commands']

const TAG_EMOJIS = [
  '🎮','🎬','🎵','🎧','🎤','🎸','📚','✏️','🎨','📷','💻','🤖','⚽','🏀','🏋️','🚴','🏊','🧗','🎯','🎲',
  '🍕','🍔','🍣','☕','🍺','🍰','🌮','🐶','🐱','🦊','🐉','🌱','🌎','✈️','🏖️','🏔️','🚗','🏍️','🔥','⚡',
  '😄','😎','🥳','😴','🤓','😈','👻','💜','💙','💚','❤️','⭐','🌙','☀️','🌈','🚀','👑','💎','🍀','🧠',
]

// Caracteristica = emoji fixo + nome (guardada como "🎮 gamer"). Serve pro servidor e pro perfil.
function TagEditor({ tags, onChange, max = 4 }: { tags: string[]; onChange: (next: string[]) => void; max?: number }) {
  const [emoji, setEmoji] = useState('')
  const [label, setLabel] = useState('')
  const [pickerOpen, setPickerOpen] = useState(false)
  function add() {
    const name = label.trim()
    if (!name || tags.length >= max) return
    onChange([...tags, (emoji ? emoji + ' ' : '') + name])
    setLabel('')
    setEmoji('')
  }
  return (
    <div>
      <div className="play-group-tags">
        {tags.map((t) => (
          <span key={t} className="play-group-tag">{t} <button type="button" onClick={() => onChange(tags.filter((x) => x !== t))}>×</button></span>
        ))}
      </div>
      {tags.length < max && (
        <div className="play-invite-code-row play-tag-add-row" style={{ marginTop: 6 }}>
          <button type="button" className="play-tag-emoji-btn" title="Escolher emoji" onClick={() => setPickerOpen((v) => !v)}>
            {emoji || <IconSmile size={18} />}
          </button>
          {pickerOpen && (
            <>
              <div className="play-group-menu-backdrop" onClick={() => setPickerOpen(false)} />
              <div className="emoji-picker play-tag-emoji-picker">
                {TAG_EMOJIS.map((em) => (
                  <button key={em} type="button" onClick={() => { setEmoji(em); setPickerOpen(false) }}>{em}</button>
                ))}
              </div>
            </>
          )}
          <input placeholder="ex.: gamer, filme, feliz" maxLength={20} value={label} onChange={(e) => setLabel(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') add() }} />
          <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={add}>Adicionar</button>
        </div>
      )}
    </div>
  )
}

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
    avatar_frame: override.avatar_frame || base.avatar_frame,
    nameplate: override.nameplate || base.nameplate,
    banner_color: override.banner_color || base.banner_color,
    banner_image_url: override.banner_image_url || base.banner_image_url,
    play_tags: override.tags || [],
  }
}

function PlayProfileName({ profile }: { profile: Profile }) {
  const plate = profile.nameplate
  const style = plate ? {
    '--nameplate-image': plate.asset_url ? `url("${plate.asset_url.replace(/["\\]/g, '')}")` : 'none',
    '--nameplate-accent': plate.accent || '#8aa4c7',
  } as CSSProperties : undefined
  return <span className={plate ? 'play-nameplate' : undefined} style={style}><StyledName name={displayName(profile)} font={profile.name_style_font} effect={profile.name_style_effect} color={profile.name_style_color} /></span>
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
  initialInviteCode?: string | null
}

type ChannelMessage = PlayMessage & { author?: Profile }

type PlayVoiceSettings = {
  inputDeviceId: string
  outputDeviceId: string
  inputVolume: number
  outputVolume: number
  inputProfile: 'isolation' | 'studio'
  voiceActivation: boolean
  pushToTalkKey: string
  noiseReduction: 'off' | 'low' | 'medium' | 'high'
}

const PLAY_VOICE_SETTINGS_KEY = 'thoth-play-voice-settings-v1'
const DEFAULT_VOICE_SETTINGS: PlayVoiceSettings = { inputDeviceId: '', outputDeviceId: '', inputVolume: 1, outputVolume: 1, inputProfile: 'studio', voiceActivation: true, pushToTalkKey: 'Space', noiseReduction: 'off' }
// Um compressor atua justamente nos sons ACIMA do limiar, portanto nao funciona como redutor
// de ruido de fundo. Estes presets alimentam um noise gate de verdade: abaixo do limiar o ganho
// cai ate `floor`, com histerese e tempos suaves para nao recortar o inicio/fim das palavras.
// Limiar mais alto (menos negativo) = exige um som mais claramente "voz" pra abrir o gate, sem
// confundir ruido de fundo constante (ventilador, fiação, trafego) com fala. MAS exagerar nisso
// e perigoso: alguem com voz mais baixa/microfone com ganho menor podia nunca mais passar do
// limiar - ficando mudo de vez, pior ainda em "alto" (bug real relatado: "alto" silenciando
// completamente quem fala baixo). Recuado pra um meio-termo entre o original e a tentativa
// anterior - ainda mais exigente que o original, mas sem arriscar silenciar voz de verdade. O
// filtro de sustentação (MIN_SUSTAIN_MS, mais abaixo) continua cuidando dos cliques, que era o
// motivo de ter subido o limiar numa tentativa anterior.
const NOISE_REDUCTION_PRESETS: Record<'low' | 'medium' | 'high', { thresholdDb: number; floor: number; releaseMs: number; highpassHz: number }> = {
  low: { thresholdDb: -56, floor: 0.13, releaseMs: 260, highpassHz: 75 },
  medium: { thresholdDb: -49, floor: 0.045, releaseMs: 210, highpassHz: 95 },
  high: { thresholdDb: -43, floor: 0.01, releaseMs: 160, highpassHz: 125 },
}
// Dispara sempre que alguem muda as configuracoes de voz (volume, ruido etc.) - a tela de
// configuracoes e a chamada em si sao componentes separados sem estado compartilhado, o
// localStorage sozinho nao avisa ninguem na mesma aba (o evento "storage" so dispara em OUTRAS
// abas). Sem isso, mexer no slider durante a chamada nao tinha efeito nenhum (so pegava valor
// novo na proxima vez que entrasse na chamada).
const VOICE_SETTINGS_CHANGED_EVENT = 'thoth-play-voice-settings-changed'

function readPlayVoiceSettings(): PlayVoiceSettings {
  try {
    const settings = { ...DEFAULT_VOICE_SETTINGS, ...JSON.parse(localStorage.getItem(PLAY_VOICE_SETTINGS_KEY) || '{}') }
    // Config antiga guardava true/false (so liga/desliga); normaliza pro novo formato com nivel.
    if (typeof (settings.noiseReduction as unknown) === 'boolean') {
      settings.noiseReduction = settings.noiseReduction ? 'medium' : 'off'
    }
    // No WebView2, qualquer processamento de captura pode recolocar toda a sessao na
    // categoria de comunicacao. Desktop fica sempre cru; isolamento continua no APK/web.
    return isTauriDesktop ? { ...settings, inputProfile: 'studio' } : settings
  }
  catch { return DEFAULT_VOICE_SETTINGS }
}

function writePlayVoiceSettings(settings: PlayVoiceSettings) {
  try { localStorage.setItem(PLAY_VOICE_SETTINGS_KEY, JSON.stringify(settings)) } catch { /* ignore */ }
  window.dispatchEvent(new CustomEvent(VOICE_SETTINGS_CHANGED_EVENT, { detail: settings }))
}

export function ThothPlay({ me, onBack, initialInviteCode }: Props) {
  const [myPlayProfile, setMyPlayProfile] = useState<Profile>(me)
  const [playTheme, setPlayTheme] = useState<PlayThemeId>(DEFAULT_PLAY_THEME)
  const [showProfile, setShowProfile] = useState(false)
  const [myGroups, setMyGroups] = useState<PlayGroup[]>([])
  const [browseGroups, setBrowseGroups] = useState<PlayGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedGroup, setSelectedGroup] = useState<PlayGroup | null>(null)
  const [channels, setChannels] = useState<PlayChannel[]>([])
  const [categories, setCategories] = useState<PlayCategory[]>([])
  const [selectedChannel, setSelectedChannel] = useState<PlayChannel | null>(null)
  const [messages, setMessages] = useState<ChannelMessage[]>([])
  const [draft, setDraft] = useState('')
  const [liveTyping, setLiveTyping] = useState<Record<string, string>>({})
  const messagesChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null)
  const replayBuffer = useRef<ReplayEvent[]>([])
  const [showCreate, setShowCreate] = useState(false)
  const [createError, setCreateError] = useState<string | null>(null)
  const [showJoin, setShowJoin] = useState(false)
  const [joinCode, setJoinCode] = useState('')
  const [joinError, setJoinError] = useState<string | null>(null)
  const [joinPending, setJoinPending] = useState(false)

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
    setPlayTheme(normalizePlayTheme(p?.theme_preference))
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
    const { data, error } = await supabase.from('play_channels').select('*').eq('group_id', groupId).order('position', { ascending: true })
    if (error) {
      // Erro de rede/RLS nao pode virar "lista vazia" silenciosa - ja aconteceu de um delete
      // seguido desse refetch falhar e sumir com TODOS os canais na tela (dado continuava
      // intacto no banco, so a UI que ficou errada). Mantem o que ja estava mostrado.
      console.error('fetch play channels failed', error)
      return channels
    }
    const list = (data || []) as PlayChannel[]
    setChannels(list)
    return list
  }

  async function fetchCategories(groupId: string) {
    const { data, error } = await supabase.from('play_categories').select('*').eq('group_id', groupId).order('position', { ascending: true })
    if (error) {
      console.error('fetch play categories failed', error)
      return categories
    }
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
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_channel_role_access' }, () => { fetchChannels(selectedGroup.id); fetchCategories(selectedGroup.id) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_category_role_access' }, () => { fetchChannels(selectedGroup.id); fetchCategories(selectedGroup.id) })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_role_members' }, () => { fetchChannels(selectedGroup.id); fetchCategories(selectedGroup.id) })
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
    }
  }

  async function sendRawMessage(content: string) {
    if (!selectedChannel) return
    const { error } = await supabase.from('play_messages').insert({ channel_id: selectedChannel.id, author_id: me.id, content })
    if (error) console.error('send play media failed', error)
  }

  async function handleCreateGroup(name: string, description: string, isClosed: boolean) {
    setCreateError(null)
    const { data, error } = await supabase.rpc('create_play_group', {
      p_name: name,
      p_description: description || null,
      p_is_closed: isClosed,
      p_password: null,
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
    const { data, error } = await supabase.rpc('request_play_group_join', { p_invite_code: joinCode.trim(), p_password: null })
    if (error) {
      setJoinError(error.message.includes('banido') ? 'Você foi banido deste servidor.' : 'Servidor não encontrado.')
      return
    }
    const result = data as { status: 'joined' | 'pending'; group?: PlayGroup }
    if (result.status === 'pending') {
      setJoinError(null)
      setJoinPending(true)
      return
    }
    setShowJoin(false)
    setJoinCode('')
    await loadGroups()
    if (result.group) openGroup(result.group)
  }

  const initialInviteConsumedRef = useRef(false)
  useEffect(() => {
    if (!initialInviteCode || initialInviteConsumedRef.current) return
    initialInviteConsumedRef.current = true
    setJoinCode(initialInviteCode)
    ;(async () => {
      const { data, error } = await supabase.rpc('request_play_group_join', {
        p_invite_code: initialInviteCode,
        p_password: null,
      })
      if (error) {
        setShowJoin(true)
        setJoinError(error.message.includes('banido') ? 'Você foi banido deste servidor.' : 'Servidor não encontrado.')
        return
      }
      const result = data as { status: 'joined' | 'pending'; group?: PlayGroup }
      if (result.status === 'pending') {
        setShowJoin(true)
        setJoinPending(true)
        return
      }
      await loadGroups()
      if (result.group) openGroup(result.group)
    })()
  }, [initialInviteCode, me.id])

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
          showProfile={showProfile}
          onCloseProfile={() => setShowProfile(false)}
          onProfileSaved={loadMyPlayProfile}
        />
      ) : (
        <main className="play-home">
          <header className="play-home-header">
            <button type="button" className="icon-btn" onClick={onBack} title="Voltar"><IconArrowLeft size={20} /></button>
            <h1><IconGamepad size={22} /> Thoth Play</h1>
          </header>
          <div className="play-home-actions">
            <button type="button" className="google-btn" onClick={() => setShowCreate(true)}><IconPlus size={16} /> Criar servidor</button>
            <button type="button" className="google-btn" onClick={() => { setJoinPending(false); setJoinError(null); setShowJoin(true) }}>Entrar com código</button>
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
                {joinError && <p className="auth-error">{joinError}</p>}
                {joinPending && <p className="play-invite-hint">Pedido enviado — é só esperar alguém do servidor aprovar sua entrada.</p>}
                <button type="button" className="google-btn" style={{ marginTop: 10 }} disabled={joinPending} onClick={handleJoinGroup}>{joinPending ? 'Pedido enviado' : 'Continuar'}</button>
                <button type="button" className="modal-close" onClick={() => setShowJoin(false)}>fechar</button>
              </div>
            </div>
          )}
        </main>
      )}

      {!selectedGroup && (
        <ProfilePanel
          me={me}
          open={showProfile}
          onClose={() => setShowProfile(false)}
          onSaved={loadMyPlayProfile}
        />
      )}
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
        <AvatarBox src={myPlayProfile.avatar_url} id={me.id} fallbackLetter={displayName(myPlayProfile)[0]?.toUpperCase()} className="play-group-avatar" frame={myPlayProfile.avatar_frame} />
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

function PlayProfileCard({ me, profile, roles, userRoleIds, canAssign, onToggleRole, onClose }: {
  me: Profile; profile: Profile; roles: PlayRole[]; userRoleIds: string[]; canAssign: boolean
  onToggleRole: (roleId: string, has: boolean) => void; onClose: () => void
}) {
  const [editingRoles, setEditingRoles] = useState(false)
  const isSelf = profile.id === me.id
  const [friendState, setFriendState] = useState<'idle' | 'sent' | 'friends' | 'loading'>('loading')
  const myRoles = roles.filter((r) => userRoleIds.includes(r.id))

  useEffect(() => {
    if (isSelf) return
    setFriendState('loading')
    supabase
      .from('friend_requests')
      .select('status, from_id')
      .or(`and(from_id.eq.${me.id},to_id.eq.${profile.id}),and(from_id.eq.${profile.id},to_id.eq.${me.id})`)
      .maybeSingle()
      .then(({ data: req }) => {
        if (req?.status === 'accepted') setFriendState('friends')
        else if (req?.status === 'pending' && req.from_id === me.id) setFriendState('sent')
        else setFriendState('idle')
      })
  }, [isSelf, me.id, profile.id])

  // Mesma tabela friend_requests do Messenger - um pedido feito aqui pelo perfil do Play ja
  // aparece/aceita do lado de la, sem sistema de amizade separado so pro Play.
  async function sendFriendRequest() {
    setFriendState('sent')
    const { error } = await supabase.from('friend_requests').insert({ from_id: me.id, to_id: profile.id })
    if (error) setFriendState('idle')
  }

  async function message() {
    await openDirectMessage(me.id, profile.id, displayName(profile))
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card play-profile-card" onClick={(e) => e.stopPropagation()}>
        <div className="play-profile-card-banner" style={profile.banner_image_url ? { backgroundImage: 'url(' + profile.banner_image_url + ')', backgroundSize: 'cover', backgroundPosition: '50% 50%' } : { background: profile.banner_color || 'var(--green)' }} />
        <AvatarBox src={profile.avatar_url} id={profile.id} fallbackLetter={displayName(profile)[0]?.toUpperCase()} className="play-profile-card-avatar" frame={profile.avatar_frame} />
        <h2><PlayProfileName profile={profile} /></h2>
        {profile.status && <p className="play-profile-card-status">{profile.status}</p>}
        {!!profile.play_tags?.length && (
          <div className="play-group-tags" style={{ justifyContent: 'center', padding: '0 16px 8px' }}>
            {profile.play_tags.map((t) => <span key={t} className="play-group-tag">{t}</span>)}
          </div>
        )}
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
        {!isSelf && (
          <div className="play-profile-card-friend-actions" style={{ display: 'flex', gap: 8, justifyContent: 'center', padding: '0 16px 12px' }}>
            {friendState === 'friends' ? (
              <span className="play-group-tag">Amigos</span>
            ) : friendState === 'sent' ? (
              <span className="play-group-tag">Pedido enviado</span>
            ) : (
              <button type="button" className="google-btn" style={{ width: 'auto' }} disabled={friendState === 'loading'} onClick={sendFriendRequest}>Adicionar amigo</button>
            )}
            <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={message}>Mensagem privada</button>
          </div>
        )}
        <button type="button" className="modal-close" onClick={onClose}>fechar</button>
      </div>
    </div>
  )
}

// Pedidos de entrada em servidor privado: nome + email e mensagem privada (Messenger).
function PlayJoinRequests({ groupId, me }: { groupId: string; me: Profile }) {
  type Req = { user_id: string; username: string | null; display_name: string | null; email: string | null; avatar_url: string | null }
  const [reqs, setReqs] = useState<Req[]>([])
  const [error, setError] = useState<string | null>(null)

  async function load() {
    const { data, error: err } = await supabase.rpc('list_play_join_requests', { p_group_id: groupId })
    if (err) { console.error('list join requests failed', err); return }
    setReqs((data || []) as Req[])
  }

  useEffect(() => {
    load()
    const ch = supabase
      .channel('play-join-requests:' + groupId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_join_requests', filter: 'group_id=eq.' + groupId }, () => load())
      .subscribe()
    return () => { supabase.removeChannel(ch) }
  }, [groupId])

  async function approve(userId: string) {
    setError(null)
    const { error: err } = await supabase.rpc('approve_play_join_request', { p_group_id: groupId, p_user_id: userId })
    if (err) { setError(err.message); return }
    setReqs((prev) => prev.filter((r) => r.user_id !== userId))
  }
  async function reject(userId: string) {
    setError(null)
    const { error: err } = await supabase.from('play_join_requests').delete().eq('group_id', groupId).eq('user_id', userId)
    if (err) { setError(err.message); return }
    setReqs((prev) => prev.filter((r) => r.user_id !== userId))
  }
  async function message(r: Req) {
    const ok = await openDirectMessage(me.id, r.user_id, r.display_name || r.username || 'Conversa')
    if (!ok) setError('Não consegui abrir a conversa agora.')
  }

  return (
    <div className="play-approvals">
      <label className="play-channel-modal-label">Pedidos de entrada ({reqs.length})</label>
      {reqs.length === 0 && <p className="play-empty">nenhum pedido no momento</p>}
      {reqs.map((r) => (
        <div key={r.user_id} className="play-approval-row">
          <AvatarBox src={r.avatar_url} id={r.user_id} fallbackLetter={(r.display_name || r.username || '?')[0]?.toUpperCase()} className="avatar-sm" />
          <div className="play-approval-info">
            <strong>{r.display_name || r.username}</strong>
            <span>{r.email}</span>
          </div>
          <div className="play-approval-actions">
            <button type="button" onClick={() => approve(r.user_id)}>Aprovar</button>
            <button type="button" className="danger" onClick={() => reject(r.user_id)}>Recusar</button>
            <button type="button" onClick={() => message(r)}>Mensagem privada</button>
          </div>
        </div>
      ))}
      {error && <p className="auth-error">{error}</p>}
    </div>
  )
}

function ServerInfoScreen({ group, members, me, canApprove, onClose, onConfigure, onJoin }: {
  group: PlayGroup; members?: GroupMember[]; me?: Profile; canApprove?: boolean; onClose: () => void; onConfigure?: () => void; onJoin?: () => void
}) {
  const online = members ? members.filter((m) => getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) !== 'offline').length : null
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card play-server-info" onClick={(e) => e.stopPropagation()}>
        <div className="play-server-info-banner" style={group.banner_image_url ? { backgroundImage: 'url(' + group.banner_image_url + ')', backgroundSize: 'cover', backgroundPosition: '50% 50%' } : { background: group.banner_color || 'var(--green)' }} />
        <AvatarBox src={group.image_url} id={group.id} fallbackLetter={group.name[0]?.toUpperCase()} className="play-group-avatar play-server-info-avatar" />
        <h2>{group.emoji ? group.emoji + ' ' : ''}{group.name}</h2>
        {group.description && <p className="play-server-info-desc">{group.description}</p>}
        {members && (
          <div className="play-server-info-counts"><span>{online} online</span><span>{members.length} {members.length === 1 ? 'membro' : 'membros'}</span></div>
        )}
        {group.tags?.length > 0 && (
          <div className="play-group-tags" style={{ justifyContent: 'center' }}>
            {group.tags.map((t) => <span key={t} className="play-group-tag">{t}</span>)}
          </div>
        )}
        {canApprove && me && <PlayJoinRequests groupId={group.id} me={me} />}
        {onJoin && <button type="button" className="google-btn" style={{ marginTop: 16 }} onClick={onJoin}>Entrar</button>}
        {onConfigure && <button type="button" className="google-btn" style={{ marginTop: 16 }} onClick={onConfigure}>Configurar</button>}
        <button type="button" className="modal-close" onClick={onClose}>fechar</button>
      </div>
    </div>
  )
}

function CreateGroupModal({ onClose, onCreate, error }: { onClose: () => void; onCreate: (name: string, description: string, isClosed: boolean) => void; error: string | null }) {
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [isClosed, setIsClosed] = useState(false)

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <h2>Criar servidor</h2>
        <input placeholder="Nome do servidor" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} style={{ marginTop: 8 }} />
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 10 }}>
          <input type="checkbox" checked={isClosed} onChange={(e) => setIsClosed(e.target.checked)} />
          Servidor privado (entrada mediante aprovação)
        </label>
        {error && <p className="auth-error">{error}</p>}
        <button
          type="button"
          className="google-btn"
          style={{ marginTop: 10 }}
          disabled={!name.trim()}
          onClick={() => onCreate(name.trim(), description.trim(), isClosed)}
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
  showProfile: boolean
  onCloseProfile: () => void
  onProfileSaved: () => void
}

type GroupMember = { profile: Profile; role: string }
type VoiceParticipantInfo = { id: string; name: string; micOn?: boolean; isScreen?: boolean; videoTrack?: Track; cameraTrack?: Track }

function GroupView({ me, myPlayProfile, group, channels, categories, selectedChannel, messages, liveTyping, draft, onDraftChange, onSend, onSendContent, onSelectChannel, onChannelsChange, onCategoriesChange, onGroupUpdate, onLeftGroup, onExitToMessenger, showProfile, onCloseProfile, onProfileSaved }: GroupViewProps) {
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
  const isMobile = useIsMobile()
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
  const [leaveNotice, setLeaveNotice] = useState<string | null>(null)
  const [leavingGroup, setLeavingGroup] = useState(false)
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
  const [accessModal, setAccessModal] = useState<{ kind: 'channel' | 'category'; id: string; roleIds: string[] } | null>(null)
  const [nowTick, setNowTick] = useState(() => Date.now())
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 5000)
    return () => clearInterval(t)
  }, [])
  const [renameChannelDraft, setRenameChannelDraft] = useState<{ id: string; name: string; emoji: string } | null>(null)
  const [renameCategoryId, setRenameCategoryId] = useState<string | null>(null)
  const [renameCategoryDraft, setRenameCategoryDraft] = useState('')
  const [renameCategoryEmoji, setRenameCategoryEmoji] = useState('')
  const [dragChannelId, setDragChannelId] = useState<string | null>(null)
  const [dragCategoryId, setDragCategoryId] = useState<string | null>(null)
  const [collapsedCats, setCollapsedCats] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem('play-collapsed-cats') || '[]') as string[]) } catch { return new Set() }
  })
  function toggleCategoryCollapsed(id: string) {
    setCollapsedCats((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      try { localStorage.setItem('play-collapsed-cats', JSON.stringify([...next])) } catch { /* ignore */ }
      return next
    })
  }
  const [copied, setCopied] = useState(false)
  const [members, setMembers] = useState<GroupMember[]>([])
  const membersIdsRef = useRef<string[]>([])
  membersIdsRef.current = members.map((m) => m.profile.id)
  const [memberTab, setMemberTab] = useState<'group' | 'voice'>('group')
  const [voiceParticipants, setVoiceParticipants] = useState<VoiceParticipantInfo[]>([])
  const [groupRoles, setGroupRoles] = useState<PlayRole[]>([])
  const [roleIdsByUser, setRoleIdsByUser] = useState<Record<string, string[]>>({})
  const [roleQuickMenu, setRoleQuickMenu] = useState<{ userId: string; name: string; x: number; y: number } | null>(null)
  const [roleQuickMenuIds, setRoleQuickMenuIds] = useState<Set<string>>(new Set())

  useEffect(() => {
    setVoiceParticipants([])
  }, [joinedVoiceChannel?.id])

  // Presenca de canal de voz que nao depende de estar conectado no LiveKit - sem isso so
  // quem esta na chamada via o Room sabe quem mais esta la. channel_id -> lista de user_id.
  const [voicePresence, setVoicePresence] = useState<Record<string, string[]>>({})
  const [expandedVoiceIds, setExpandedVoiceIds] = useState<Set<string>>(new Set())
  const voiceChannelIds = useMemo(() => channels.filter((c) => c.kind === 'voice').map((c) => c.id), [channels])
  const voiceChannelIdsKey = voiceChannelIds.join(',')

  useEffect(() => {
    // Aquece em segundo plano o caminho mais lento da chamada: sessao/token,
    // descoberta da melhor regiao LiveKit e conexoes DNS/TLS. Ao clicar no
    // canal, o VoiceChannel reutiliza o token em cache e conecta direto.
    let cancelled = false
    const warmRooms: Room[] = []
    for (const channelId of voiceChannelIds) {
      fetchLiveKitToken(channelId).then(async ({ token, url }) => {
        if (cancelled) return
        const room = new Room()
        warmRooms.push(room)
        await room.prepareConnection(url, token)
      }).catch(() => { /* a conexao normal mantem as tentativas e mostra o erro */ })
    }
    return () => {
      cancelled = true
      warmRooms.forEach((room) => room.disconnect())
    }
  }, [voiceChannelIds])

  // joined_at so e gravado na entrada - se o app fecha de forma suja (crash, perde conexao,
  // forca-parar) o delete de saida (efeito abaixo) nunca roda e a linha fica presa pra sempre,
  // mostrando gente que nem esta mais online. Um heartbeat periodico atualiza joined_at enquanto
  // conectado de verdade, e aqui filtra linhas mais velhas que isso - stale some sozinho.
  const VOICE_PRESENCE_STALE_MS = 90_000
  useEffect(() => {
    if (!voiceChannelIds.length) { setVoicePresence({}); return }
    let cancelled = false
    async function loadPresence() {
      const { data } = await supabase.from('play_voice_presence').select('channel_id, user_id, joined_at').in('channel_id', voiceChannelIds)
      if (cancelled) return
      const cutoff = Date.now() - VOICE_PRESENCE_STALE_MS
      const grouped: Record<string, string[]> = {}
      for (const row of data || []) {
        if (new Date(row.joined_at).getTime() < cutoff) continue
        grouped[row.channel_id] = grouped[row.channel_id] || []
        grouped[row.channel_id].push(row.user_id)
      }
      setVoicePresence(grouped)
    }
    loadPresence()
    const sub = supabase
      .channel(`play-voice-presence:${voiceChannelIdsKey}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_voice_presence' }, () => loadPresence())
      .subscribe()
    // Reavalia a cada 30s mesmo sem evento novo - e assim que uma linha stale "expira" e some.
    const staleTimer = setInterval(loadPresence, 30_000)
    return () => { cancelled = true; supabase.removeChannel(sub); clearInterval(staleTimer) }
  }, [voiceChannelIds])

  useEffect(() => {
    if (!joinedVoiceChannel) return
    const heartbeat = () => supabase.from('play_voice_presence').upsert({ channel_id: joinedVoiceChannel.id, user_id: me.id, joined_at: new Date().toISOString() }).then()
    heartbeat()
    const interval = setInterval(heartbeat, 45_000)
    return () => {
      clearInterval(interval)
      supabase.from('play_voice_presence').delete().eq('channel_id', joinedVoiceChannel.id).eq('user_id', me.id).then()
    }
  }, [joinedVoiceChannel?.id, me.id])

  function toggleVoicePreview(key: string) {
    setExpandedVoiceIds((prev) => {
      const next = new Set(prev)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }

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
    // presenca so muda em profiles.last_seen_at (sem realtime): rele a cada 30s pra ninguem ficar "offline" por dado velho
    const presenceTimer = setInterval(async () => {
      const ids = membersIdsRef.current
      if (!ids.length) return
      const { data } = await supabase.from('profiles').select('id, last_seen_at, is_idle').in('id', ids)
      if (cancelled || !data) return
      const byId = Object.fromEntries(data.map((p) => [p.id as string, p]))
      setMembers((prev) => prev.map((m) => (byId[m.profile.id] ? { ...m, profile: { ...m.profile, last_seen_at: byId[m.profile.id].last_seen_at, is_idle: byId[m.profile.id].is_idle } } : m)))
    }, 30000)
    const channel = supabase
      .channel(`play-profiles-refresh:${group.id}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_profiles' }, () => loadMembers())
      .on('postgres_changes', { event: '*', schema: 'public', table: 'play_group_members', filter: `group_id=eq.${group.id}` }, () => loadMembers())
      .subscribe()
    return () => {
      cancelled = true
      clearInterval(presenceTimer)
      supabase.removeChannel(channel)
    }
  }, [group.id])

  const memberOnline = (m: GroupMember) => m.profile.id === me.id || getPresenceColor(m.profile.last_seen_at, m.profile.is_idle) !== 'offline'
  const onlineMembers = members.filter(memberOnline)
  const offlineMembers = members.filter((m) => !memberOnline(m))
  const inVoiceIds = new Set([...voiceParticipants.map((p) => p.id), ...Object.values(voicePresence).flat()])

  type ChannelVoiceEntry = {
    id: string; name: string; avatar_url: string | null; videoTrack?: Track; cameraTrack?: Track; isScreen?: boolean; micOn?: boolean
    nameStyleFont: string | null; nameStyleEffect: Profile['name_style_effect']; nameStyleColor: string | null
    avatarFrame: Profile['avatar_frame']; nameplate: Profile['nameplate']
  }
  function channelVoiceList(channelId: string): ChannelVoiceEntry[] {
    if (joinedVoiceChannel?.id === channelId) {
      return voiceParticipants.map((p) => {
        const profile = p.id === me.id ? myPlayProfile : membersById[p.id]
        return {
          id: p.id,
          name: p.name,
          avatar_url: (p.id === me.id ? myPlayProfile.avatar_url : membersById[p.id]?.avatar_url) || null,
          videoTrack: p.videoTrack,
          cameraTrack: p.cameraTrack,
          isScreen: p.isScreen,
          micOn: p.micOn,
          nameStyleFont: profile?.name_style_font || null,
          nameStyleEffect: profile?.name_style_effect || null,
          nameStyleColor: profile?.name_style_color || null,
          avatarFrame: profile?.avatar_frame || null,
          nameplate: profile?.nameplate || null,
        }
      })
    }
    return (voicePresence[channelId] || []).map((userId) => {
      const profile = userId === me.id ? myPlayProfile : membersById[userId]
      return {
        id: userId,
        name: userId === me.id ? (myPlayProfile.display_name || myPlayProfile.username) : (membersById[userId]?.display_name || membersById[userId]?.username || '...'),
        avatar_url: (userId === me.id ? myPlayProfile.avatar_url : membersById[userId]?.avatar_url) || null,
        nameStyleFont: profile?.name_style_font || null,
        nameStyleEffect: profile?.name_style_effect || null,
        nameStyleColor: profile?.name_style_color || null,
        avatarFrame: profile?.avatar_frame || null,
        nameplate: profile?.nameplate || null,
      }
    })
  }
  // Cargos com "mostrar separado": quem tem mais de um cai no de cima (ordem = prioridade)
  const hoistedRoles = groupRoles.filter((r) => r.hoisted).sort((a, b) => a.position - b.position)
  const isOnline = memberOnline
  const renderMemberRow = (m: GroupMember, offline: boolean) => (
    <div key={m.profile.id} className={'play-member-row' + (offline ? ' offline' : '')}>
      <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className={'avatar-sm presence-' + (m.profile.id === me.id ? 'online' : getPresenceColor(m.profile.last_seen_at, m.profile.is_idle))} frame={m.profile.avatar_frame} />
      <span
        className="play-name-clickable"
        onContextMenu={(e) => { e.preventDefault(); openRoleQuickMenu(m.profile.id, displayName(m.profile), e.clientX, e.clientY) }}
        onClick={() => setProfileCardId(m.profile.id)}
      >
        {offline ? displayName(m.profile) : <PlayProfileName profile={m.profile} />}
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
  const can = (perm: string) => isStaff || (myRolePerms === null ? DEFAULT_MEMBER_PERMS.includes(perm) : (myRolePerms.includes('administrator') || myRolePerms.includes(perm)))
  const canManage = can('manage_channels')
  const canAssign = can('assign_roles')
  const canConfigure = ['manage_server', 'manage_privacy', 'manage_bots', 'manage_roles', 'assign_roles', 'kick_members', 'ban_members', 'approve_members'].some(can)
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
    await supabase.from('play_categories').update({ name: renameCategoryDraft.trim(), emoji: renameCategoryEmoji || null }).eq('id', renameCategoryId)
    setRenameCategoryId(null)
    onCategoriesChange()
  }

  // acesso por cargo: vale pra canal e pra categoria (categoria restrita esconde ela e os canais dentro)
  async function openAccess(kind: 'channel' | 'category', id: string) {
    const { data } = kind === 'channel'
      ? await supabase.from('play_channel_role_access').select('role_id').eq('channel_id', id)
      : await supabase.from('play_category_role_access').select('role_id').eq('category_id', id)
    setAccessModal({ kind, id, roleIds: (data || []).map((r) => r.role_id as string) })
  }

  async function toggleAccess(roleId: string) {
    if (!accessModal) return
    const has = accessModal.roleIds.includes(roleId)
    const table = accessModal.kind === 'channel' ? 'play_channel_role_access' : 'play_category_role_access'
    const col = accessModal.kind === 'channel' ? 'channel_id' : 'category_id'
    const { error } = has
      ? await supabase.from(table).delete().eq('role_id', roleId).eq(col, accessModal.id)
      : await supabase.from(table).insert({ role_id: roleId, [col]: accessModal.id })
    if (error) { console.error('access failed', error); return }
    setAccessModal({ ...accessModal, roleIds: has ? accessModal.roleIds.filter((x) => x !== roleId) : [...accessModal.roleIds, roleId] })
    onChannelsChange()
    onCategoriesChange()
  }

  async function renameChannelSave() {
    if (!renameChannelDraft || !renameChannelDraft.name.trim()) return
    await supabase.from('play_channels').update({ name: renameChannelDraft.name.trim(), emoji: renameChannelDraft.emoji || null }).eq('id', renameChannelDraft.id)
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
    const session = sonorSession
    let cancelled = false
    let retries = 0
    let timer: ReturnType<typeof setTimeout> | null = null

    const start = () => {
      if (cancelled) return
      sonorHlsRef.current?.destroy()
      sonorHlsRef.current = null
      if (session.is_hls) {
        import('hls.js').then(({ default: Hls }) => {
          if (cancelled) return
          if (Hls.isSupported()) {
            const hls = new Hls()
            hls.loadSource(session.stream_url)
            hls.attachMedia(audio)
            hls.on(Hls.Events.ERROR, (_evt: unknown, data: { fatal?: boolean; type?: string }) => {
              if (!data.fatal) return
              if (data.type === 'networkError') hls.startLoad()
              else if (data.type === 'mediaError') hls.recoverMediaError()
              else scheduleReconnect()
            })
            hls.on(Hls.Events.FRAG_LOADED, () => { retries = 0 })
            sonorHlsRef.current = hls
          } else {
            audio.src = session.stream_url
          }
          audio.play().catch(() => {})
        })
      } else {
        audio.src = session.stream_url
        audio.play().catch(() => {})
      }
    }

    // A conexao com a radio cai de vez em quando (rede, emissora): tenta de novo, com espera crescente
    const scheduleReconnect = () => {
      if (timer || cancelled || retries >= 10) return
      retries += 1
      timer = setTimeout(() => { timer = null; start() }, Math.min(1500 * retries, 15000))
    }
    const onPlaying = () => { retries = 0 }
    const onStalled = () => {
      setTimeout(() => { if (!cancelled && (audio.paused || audio.readyState < 3)) scheduleReconnect() }, 8000)
    }
    audio.addEventListener('error', scheduleReconnect)
    audio.addEventListener('ended', scheduleReconnect)
    audio.addEventListener('stalled', onStalled)
    audio.addEventListener('waiting', onStalled)
    audio.addEventListener('playing', onPlaying)
    start()
    return () => {
      cancelled = true
      if (timer) clearTimeout(timer)
      audio.removeEventListener('error', scheduleReconnect)
      audio.removeEventListener('ended', scheduleReconnect)
      audio.removeEventListener('stalled', onStalled)
      audio.removeEventListener('waiting', onStalled)
      audio.removeEventListener('playing', onPlaying)
    }
  }, [sonorSession?.stream_url, sonorSession?.is_hls])

  useEffect(() => {
    if (sonorAudioRef.current) sonorAudioRef.current.volume = sonorVolume ** 3
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

  async function stopRadio() {
    const { error } = await supabase.rpc('play_sonor_stop', { p_group_id: group.id })
    if (error) { console.error('sonor stop failed', error); setSonorNotice('não consegui parar: ' + error.message); return }
    setSonorSession(null)
  }

  // Puxa a biblioteca de radios salvas no app Sonor (mesmo login Google) e importa pro
  // sonor_favorites daqui. Usa o access_token do Google da sessao atual, pedido na hora do
  // clique (nunca guardado) - se a sessao nao tiver mais esse token (login antigo), a pessoa
  // so precisa sair e entrar de novo, sem quebrar nada silenciosamente depois. Retorna null
  // em erro, ou a quantidade de radios novas importadas.
  async function syncSonorLibrary(): Promise<number | null> {
    if (!me) return null
    const { data: sessionData } = await supabase.auth.getSession()
    const providerToken = sessionData.session?.provider_token
    if (!providerToken) return null
    try {
      const res = await fetch('https://xtdydmfxqxsujrqdtrkn.supabase.co/functions/v1/radio-favoritos-externas', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization:
            'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh0ZHlkbWZ4cXhzdWpycWR0cmtuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODcwMjI4MjMsImV4cCI6MjEwMjU5ODgyM30.16DYgh8unDuQXsxyj071uq2gKWeH-47QQ-Nq8UY0hdw',
        },
        body: JSON.stringify({ accessToken: providerToken }),
      })
      if (!res.ok) return null
      const payload = await res.json() as { favoritos?: { nome: string; url: string }[] }
      const favoritos = payload.favoritos || []
      if (favoritos.length === 0) return 0
      const rows = favoritos.map((f) => ({
        user_id: me.id, name: f.nome, stream_url: toPlayableUrl(f.url), is_hls: isHlsStream(f.url),
      }))
      const { error } = await supabase.from('sonor_favorites').upsert(rows, { onConflict: 'user_id,stream_url', ignoreDuplicates: true })
      if (error) { console.error('sonor library sync insert failed', error); return null }
      return rows.length
    } catch (err) {
      console.error('sonor library sync failed', err)
      return null
    }
  }

  // Resposta de comando: so quem rodou ve, e some depois de 1 minuto (p_ephemeral)
  async function postBot(slug: string, channelId: string, text: string) {
    const { error } = await supabase.rpc('post_play_bot_message', { p_channel_id: channelId, p_bot_slug: slug, p_content: text, p_ephemeral: true })
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
      const { error } = await supabase.from('sonor_favorites').upsert(
        { user_id: me.id, name: sonorSession.title, stream_url: sonorSession.stream_url, is_hls: sonorSession.is_hls },
        { onConflict: 'user_id,stream_url', ignoreDuplicates: true },
      )
      setSonorNotice(error ? 'não consegui salvar' : sonorSession.title + ' salva nos seus favoritos')
      return
    }
    if (action === 'sonor_favs') {
      const { data } = await supabase.from('sonor_favorites').select('name, stream_url').eq('user_id', me.id).order('created_at', { ascending: false })
      setSonorFavs((data || []).map((r) => ({ name: r.name as string, url: r.stream_url as string, country: '' })))
      setSonorModal('favs')
      return
    }
    if (action === 'sonor_download') {
      window.open('https://facincanitech.github.io/Sonor/', '_blank', 'noopener')
      return
    }
    if (action === 'sonor_sync') {
      setSonorBusy(true)
      const imported = await syncSonorLibrary()
      setSonorBusy(false)
      setSonorNotice(
        imported === null
          ? 'não consegui sincronizar - entra de novo com o Google e tenta outra vez'
          : imported === 0
            ? 'nenhuma rádio nova encontrada na sua biblioteca do Sonor'
            : `${imported} rádio(s) importada(s) da sua biblioteca do Sonor`,
      )
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
    navigator.clipboard?.writeText(playInviteUrl(group.invite_code))
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }

  async function leaveGroup() {
    if (leavingGroup) return
    setLeavingGroup(true)
    try {
      const { data: membership, error: readError } = await supabase.from('play_group_members')
        .select('role').eq('group_id', group.id).eq('user_id', me.id).maybeSingle()
      if (readError) throw readError
      if (!membership) { onLeftGroup(); return }
      if (membership.role === 'owner') {
        setLeaveNotice('Você é o dono deste servidor. Por segurança, não pode sair e deixá-lo sem dono. A transferência de posse ainda não está disponível.')
        return
      }
      if (!confirm(`Sair de "${group.name}"?`)) return
      const { data: removed, error: deleteError } = await supabase.from('play_group_members')
        .delete().eq('group_id', group.id).eq('user_id', me.id).select('user_id')
      if (deleteError) throw deleteError
      if (!removed?.length) throw new Error('O servidor não confirmou sua saída. Tente novamente.')
      onLeftGroup()
    } catch (cause) {
      setLeaveNotice(cause instanceof Error ? cause.message : 'Não foi possível sair do servidor. Tente novamente.')
    } finally { setLeavingGroup(false) }
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

  // Barra da radio (Sonor): toca pra todo mundo que estiver com este servidor aberto, nao depende de canal de voz
  const sonorBar = sonorSession ? (
    <div className="play-sonor-bar">
      <span className="play-sonor-bar-title">Tocando: {sonorSession.title}</span>
      <input type="range" min="0" max="1" step="0.05" value={sonorVolume} onChange={(e) => setSonorVolume(Number(e.target.value))} />
      <button type="button" onClick={stopRadio}>Parar</button>
    </div>
  ) : null

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
                <strong>{group.emoji ? group.emoji + ' ' : ''}{group.name}</strong>
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
          {sonorSession && !isMobile && sonorBar}
        </header>

        {showInvite && (
          <div className="modal-backdrop" onClick={() => setShowInvite(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2>Convidar para {group.name}</h2>
              <p className="play-invite-hint">Compartilhe o link. Depois do login, a pessoa cai direto neste servidor.</p>
              <div className="play-invite-code-row">
                <input readOnly value={playInviteUrl(group.invite_code)} onFocus={(e) => e.target.select()} />
                <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={copyInvite}>
                  <IconCopy size={14} /> {copied ? 'copiado!' : 'Copiar'}
                </button>
              </div>
              <button type="button" className="modal-close" onClick={() => setShowInvite(false)}>fechar</button>
            </div>
          </div>
        )}
        {leaveNotice && <div className="modal-backdrop" onClick={() => setLeaveNotice(null)}><div className="modal-card" onClick={(event) => event.stopPropagation()}><h2>Saída do servidor</h2><p>{leaveNotice}</p><button type="button" className="modal-close" onClick={() => setLeaveNotice(null)}>Entendi</button></div></div>}

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
                    onDragOver={(e) => { if (dragChannelId) { e.preventDefault(); e.stopPropagation() } }}
                    onDrop={(e) => { if (dragChannelId) { e.preventDefault(); e.stopPropagation(); moveChannel(dragChannelId, cat.id, null); setDragChannelId(null) } }}
                  >
                    {canManage && <span className="play-category-grip"><IconGrip size={12} /></span>}
                    <button
                      type="button"
                      className={'play-category-toggle' + (collapsedCats.has(cat.id) ? ' collapsed' : '')}
                      aria-expanded={!collapsedCats.has(cat.id)}
                      title={collapsedCats.has(cat.id) ? 'Expandir categoria' : 'Recolher categoria'}
                      onClick={() => toggleCategoryCollapsed(cat.id)}
                    >
                      <IconChevronDown size={13} />
                    </button>
                    <span className="play-category-name" onClick={() => toggleCategoryCollapsed(cat.id)}>{cat.emoji ? cat.emoji + ' ' : ''}{cat.name}</span>
                    {canManage && (
                      <button type="button" onClick={() => openNewChannelModal(cat.id)} title="Criar canal"><IconPlus size={14} /></button>
                    )}
                  </div>
                  <div
                    onDragOver={(e) => { if (dragChannelId) e.preventDefault() }}
                    onDrop={(e) => { e.preventDefault(); if (dragChannelId) moveChannel(dragChannelId, cat.id, null); setDragChannelId(null) }}
                  >
                    {channelsByCategory(cat.id).filter((c) => !collapsedCats.has(cat.id) || c.id === selectedChannel?.id || joinedVoiceChannel?.id === c.id).map((c) => (
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
                          {c.kind === 'text' ? <IconHash size={15} /> : <IconVideo size={15} />} {c.emoji ? c.emoji + ' ' : ''}{c.name}
                        </button>
                        {c.kind === 'voice' && channelVoiceList(c.id).map((p) => (
                          <div key={p.id} className="play-channel-voice-member">
                            <AvatarBox
                              src={p.avatar_url}
                              id={p.id}
                              fallbackLetter={p.name[0]?.toUpperCase()}
                              className="avatar-sm"
                              frame={p.avatarFrame}
                            />
                            <span className={p.nameplate ? 'play-nameplate' : undefined} style={p.nameplate ? { '--nameplate-image': p.nameplate.asset_url ? `url("${p.nameplate.asset_url.replace(/["\\]/g, '')}")` : 'none', '--nameplate-accent': p.nameplate.accent || '#8aa4c7' } as CSSProperties : undefined}><StyledName name={p.name} font={p.nameStyleFont} effect={p.nameStyleEffect} color={p.nameStyleColor} /></span>
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
                          {c.kind === 'text' ? <IconHash size={15} /> : <IconVideo size={15} />} {c.emoji ? c.emoji + ' ' : ''}{c.name}
                        </button>
                        {c.kind === 'voice' && channelVoiceList(c.id).map((p) => (
                          <div key={p.id} className="play-channel-voice-member">
                            <AvatarBox
                              src={p.avatar_url}
                              id={p.id}
                              fallbackLetter={p.name[0]?.toUpperCase()}
                              className="avatar-sm"
                              frame={p.avatarFrame}
                            />
                            <span className={p.nameplate ? 'play-nameplate' : undefined} style={p.nameplate ? { '--nameplate-image': p.nameplate.asset_url ? `url("${p.nameplate.asset_url.replace(/["\\]/g, '')}")` : 'none', '--nameplate-accent': p.nameplate.accent || '#8aa4c7' } as CSSProperties : undefined}><StyledName name={p.name} font={p.nameStyleFont} effect={p.nameStyleEffect} color={p.nameStyleColor} /></span>
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
                    <button type="button" onClick={() => { const ch = channels.find((c) => c.id === chanMenu.channelId); setChanMenu(null); if (ch) setRenameChannelDraft({ id: ch.id, name: ch.name, emoji: ch.emoji || '' }) }}>
                      <IconEdit size={14} /> Renomear canal
                    </button>
                    {can('manage_roles') && (
                      <button type="button" onClick={() => { const id = chanMenu.channelId; setChanMenu(null); openAccess('channel', id) }}>
                        <IconLock size={14} /> Acesso por cargo
                      </button>
                    )}
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
                        setRenameCategoryEmoji(cat?.emoji || '')
                        setCatMenu(null)
                      }}
                    >
                      <IconEdit size={14} /> Renomear
                    </button>
                    {can('manage_roles') && (
                      <button type="button" onClick={() => { const id = catMenu.categoryId; setCatMenu(null); openAccess('category', id) }}>
                        <IconLock size={14} /> Acesso por cargo
                      </button>
                    )}
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
            <ProfilePanel
              me={me}
              open={showProfile}
              onClose={onCloseProfile}
              onSaved={onProfileSaved}
            />
          </div>

          {!selectedChannel && <div className="play-channel-empty"><p>Escolha um canal</p></div>}

          {selectedChannel?.kind === 'text' && (
            <div className="play-text-channel">
              <header className="play-text-channel-header">
                <div><IconHash size={17} /> <strong>{selectedChannel.emoji ? selectedChannel.emoji + ' ' : ''}{selectedChannel.name}</strong></div>
                <span>Conversa geral do {group.emoji ? group.emoji + ' ' : ''}{group.name}</span>
              </header>
              <div className="play-messages">
                {messages.length === 0 && <p className="play-empty">nenhuma mensagem ainda</p>}
                {messages.filter((m) => !m.expires_at || Date.parse(m.expires_at) > nowTick).map((m) => m.kind === 'bot_panel' ? (
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
                    <AvatarBox src={m.author?.avatar_url} id={m.author_id} fallbackLetter={(m.author ? displayName(m.author) : '?')[0]?.toUpperCase()} className="avatar-sm" frame={m.author?.avatar_frame} />
                    <div className="play-message-body">
                      <div className="play-message-row">
                        <strong
                          className="play-name-clickable"
                          onContextMenu={(e) => { if (m.author) { e.preventDefault(); openRoleQuickMenu(m.author_id, displayName(m.author), e.clientX, e.clientY) } }}
                          onClick={() => { if (m.author) setProfileCardId(m.author_id) }}
                        >
                          {m.author ? (
                            <PlayProfileName profile={m.author} />
                          ) : '...'}
                        </strong>
                        <span className="play-message-time">{new Date(m.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</span>
                        <button type="button" className="play-replay-btn" onClick={() => openReplay(m)}>
                          replay
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
              <VoiceChannel key={joinedVoiceChannel.id} allow={{ speak: can('voice_speak'), camera: can('voice_camera'), screen: can('voice_screen') }} me={myPlayProfile} membersById={membersById} channel={joinedVoiceChannel} onParticipantsChange={setVoiceParticipants} onLeave={leaveVoice} pipIds={pipIds} maximizedId={maximizedId} onFullscreen={setFullscreenId} onTogglePip={togglePip} onToggleMaximize={(id) => setMaximizedId((cur) => (cur === id ? null : id))} />
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
                {channels.filter((c) => c.kind === 'voice').map((c) => ({ channel: c, list: channelVoiceList(c.id) })).filter((g) => g.list.length > 0).length === 0 && (
                  <p className="play-empty">ninguém na voz agora</p>
                )}
                {channels.filter((c) => c.kind === 'voice').map((c) => ({ channel: c, list: channelVoiceList(c.id) })).filter((g) => g.list.length > 0).map((g) => (
                  <div key={g.channel.id}>
                    <div className="play-member-group-title">{g.channel.name.toUpperCase()} — {g.list.length}</div>
                    {g.list.map((p) => {
                      const key = `${g.channel.id}:${p.id}`
                      const expanded = expandedVoiceIds.has(key)
                      const hasPreview = !!(p.videoTrack || p.cameraTrack)
                      return (
                        <div key={key} className="play-member-row">
                          <AvatarBox src={p.avatar_url} id={p.id} fallbackLetter={p.name[0]?.toUpperCase()} className="avatar-sm" frame={p.avatarFrame} />
                          <span
                            className="play-name-clickable"
                            onContextMenu={(e) => { e.preventDefault(); openRoleQuickMenu(p.id, p.name, e.clientX, e.clientY) }}
                            onClick={() => setProfileCardId(p.id)}
                          >
                            <span className={p.nameplate ? 'play-nameplate' : undefined} style={p.nameplate ? { '--nameplate-image': p.nameplate.asset_url ? `url("${p.nameplate.asset_url.replace(/["\\]/g, '')}")` : 'none', '--nameplate-accent': p.nameplate.accent || '#8aa4c7' } as CSSProperties : undefined}><StyledName name={p.name} font={p.nameStyleFont} effect={p.nameStyleEffect} color={p.nameStyleColor} /></span>
                          </span>
                          <IconHeadphones size={14} />
                          {hasPreview && (
                            <button
                              type="button"
                              className="play-voice-preview-toggle"
                              title={expanded ? 'Esconder prévia' : 'Mostrar prévia'}
                              onClick={() => toggleVoicePreview(key)}
                              style={{ transform: expanded ? 'rotate(180deg)' : undefined }}
                            >
                              <IconChevronDown size={14} />
                            </button>
                          )}
                          {expanded && p.videoTrack && !(p.id === me.id && p.isScreen) && (
                            <div className="play-mini-stream">
                              <StreamView track={p.videoTrack} muted className="play-mini-stream-video" />
                              <button type="button" className="play-mini-stream-menu" title="Opções" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); setMediaMenu({ id: p.id, x: Math.max(8, Math.min(r.left, window.innerWidth - 220)), y: Math.max(8, Math.min(r.bottom + 4, window.innerHeight - 140)), fromGrid: false }) }}><IconMore size={16} /></button>
                            </div>
                          )}
                          {expanded && p.cameraTrack && (
                            <div className="play-mini-stream">
                              <StreamView track={p.cameraTrack} muted className="play-mini-stream-video" />
                            </div>
                          )}
                        </div>
                      )
                    })}
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
      {sonorSession && isMobile && sonorBar}
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
          me={me}
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
          me={me}
          canApprove={can('approve_members')}
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

      {accessModal && (
        <div className="modal-backdrop" onClick={() => setAccessModal(null)}>
          <div className="modal-card play-channel-modal" onClick={(e) => e.stopPropagation()} style={{ maxHeight: '86vh', overflowY: 'auto' }}>
            <h2>Acesso por cargo</h2>
            <p className="play-invite-hint">{accessModal.kind === 'channel' ? '#' + (channels.find((c) => c.id === accessModal.id)?.name || '') + ' — só os cargos marcados enxergam este canal.' : (categories.find((c) => c.id === accessModal.id)?.name || '') + ' — só os cargos marcados enxergam esta categoria e os canais dentro dela.'} Nenhum marcado = todo mundo vê. Dono e admin sempre veem.</p>
            {groupRoles.length === 0 && <p className="play-empty">nenhum cargo criado ainda</p>}
            {groupRoles.map((r) => (
              <label key={r.id} className="play-role-check-row">
                <input type="checkbox" checked={accessModal.roleIds.includes(r.id)} onChange={() => toggleAccess(r.id)} />
                {r.emoji ? r.emoji + ' ' : ''}{r.name}
              </label>
            ))}
            <button type="button" className="modal-close" onClick={() => setAccessModal(null)}>fechar</button>
          </div>
        </div>
      )}

      {renameChannelDraft && (
        <div className="modal-backdrop" onClick={() => setRenameChannelDraft(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Renomear canal</h2>
            <input autoFocus placeholder="Nome do canal" value={renameChannelDraft.name} onChange={(e) => setRenameChannelDraft({ ...renameChannelDraft, name: e.target.value })} onKeyDown={(e) => { if (e.key === 'Enter') renameChannelSave() }} />
            <label className="play-channel-modal-label" style={{ marginTop: 10 }}>Ícone (opcional)</label>
            <div className="play-role-emoji-row">
              <button type="button" className={renameChannelDraft.emoji === '' ? 'active' : ''} onClick={() => setRenameChannelDraft({ ...renameChannelDraft, emoji: '' })}>sem</button>
              {ROLE_EMOJIS.map((em) => (
                <button key={em} type="button" className={renameChannelDraft.emoji === em ? 'active' : ''} onClick={() => setRenameChannelDraft({ ...renameChannelDraft, emoji: em })}>{em}</button>
              ))}
            </div>
            <button type="button" className="google-btn" style={{ marginTop: 10 }} onClick={renameChannelSave}>Salvar</button>
            <button type="button" className="modal-close" onClick={() => setRenameChannelDraft(null)}>cancelar</button>
          </div>
        </div>
      )}

      {showNewCategory && (
        <div className="modal-backdrop" onClick={() => setShowNewCategory(false)}>
          <div className="modal-card play-channel-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Criar categoria</h2>
            <label className="play-channel-modal-label">Nome da categoria</label>
            <input autoFocus placeholder="Nome da categoria" value={newCategoryName} onChange={(e) => setNewCategoryName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') createCategory() }} />
            <div className="play-channel-modal-actions">
              <button type="button" className="modal-close" onClick={() => setShowNewCategory(false)}>Cancelar</button>
              <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={createCategory}>Criar</button>
            </div>
          </div>
        </div>
      )}

      {renameCategoryId && (
        <div className="modal-backdrop" onClick={() => setRenameCategoryId(null)}>
          <div className="modal-card play-channel-modal" onClick={(e) => e.stopPropagation()}>
            <h2>Renomear categoria</h2>
            <label className="play-channel-modal-label">Nome da categoria</label>
            <input autoFocus placeholder="Nome da categoria" value={renameCategoryDraft} onChange={(e) => setRenameCategoryDraft(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') renameCategory() }} />
            <label className="play-channel-modal-label" style={{ marginTop: 10 }}>Ícone (opcional)</label>
            <div className="play-role-emoji-row">
              <button type="button" className={renameCategoryEmoji === '' ? 'active' : ''} onClick={() => setRenameCategoryEmoji('')}>sem</button>
              {ROLE_EMOJIS.map((em) => (
                <button key={em} type="button" className={renameCategoryEmoji === em ? 'active' : ''} onClick={() => setRenameCategoryEmoji(em)}>{em}</button>
              ))}
            </div>
            <div className="play-channel-modal-actions">
              <button type="button" className="modal-close" onClick={() => setRenameCategoryId(null)}>Cancelar</button>
              <button type="button" className="google-btn" style={{ width: 'auto' }} onClick={renameCategory}>Salvar</button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}

function GroupInfoPanel({ group, myRole, members, me, can, open, onClose, onUpdate }: {
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
  const [tags, setTags] = useState<string[]>(group.tags || [])
  const [error, setError] = useState<string | null>(null)
  const [bannerUploading, setBannerUploading] = useState(false)
  const [showCustomize, setShowCustomize] = useState(false)
  const bannerFileRef = useRef<HTMLInputElement>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [uploading, setUploading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [privacySaving, setPrivacySaving] = useState(false)
  const [memberSearch, setMemberSearch] = useState('')
  const [bans, setBans] = useState<{ user_id: string; profile?: Profile }[]>([])
  const [roles, setRoles] = useState<PlayRole[]>([])
  const [roleMemberIds, setRoleMemberIds] = useState<Record<string, string[]>>({})
  const [expandedRoleId, setExpandedRoleId] = useState<string | null>(null)
  const [newRoleName, setNewRoleName] = useState('')
  const [newRoleEmoji, setNewRoleEmoji] = useState('')
  const [showRoleEmojiPicker, setShowRoleEmojiPicker] = useState(false)
  const [rosterRoleId, setRosterRoleId] = useState<string | null>(null)
  const [rosterAdding, setRosterAdding] = useState(false)
  const [roleEdit, setRoleEdit] = useState<{ id: string; name: string; emoji: string; permissions: string[]; hoisted: boolean } | null>(null)
  const [botCatalog, setBotCatalog] = useState<Bot[]>([])
  const [installedBotIds, setInstalledBotIds] = useState<Set<string>>(new Set())
  const [botStoreOpen, setBotStoreOpen] = useState(false)

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
    if (!roleList.length) { setRoleMemberIds({}); return }
    const roleIds = roleList.map((r) => r.id)
    const { data: rm } = await supabase.from('play_role_members').select('role_id, user_id').in('role_id', roleIds)
    const memberMap: Record<string, string[]> = {}
    for (const row of rm || []) {
      const rId = row.role_id as string
      memberMap[rId] = [...(memberMap[rId] || []), row.user_id as string]
    }
    setRoleMemberIds(memberMap)
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
    try { await ensurePlayBotPanel(group.id, bot) }
    catch (cause) { setError(`Bot instalado, mas não consegui criar o painel: ${cause instanceof Error ? cause.message : 'erro desconhecido'}`) }
  }

  async function toggleBot(botId: string, installed: boolean): Promise<boolean> {
    if (installed) {
      const { error } = await supabase.from('play_group_bots').delete().eq('group_id', group.id).eq('bot_id', botId)
      if (error) { setError('Não foi possível remover o bot.'); return false }
      setInstalledBotIds((prev) => { const next = new Set(prev); next.delete(botId); return next })
    } else {
      const { error } = await supabase.from('play_group_bots').insert({ group_id: group.id, bot_id: botId, installed_by: me.id })
      if (error) { setError('Não foi possível instalar o bot.'); return false }
      setInstalledBotIds((prev) => new Set(prev).add(botId))
      const bot = botCatalog.find((b) => b.id === botId)
      if (bot) await setupBotPanel(bot)
    }
    return true
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

  // sem botao Salvar: cada campo grava sozinho ao sair dele (ou ao mudar, no caso de cor/imagem/caracteristicas)
  async function saveGroup(patch: Partial<PlayGroup>) {
    setError(null)
    const { error: err } = await supabase.from('play_groups').update(patch).eq('id', group.id)
    if (err) { setError(err.message); return }
    onUpdate(patch)
  }

  async function handleBannerPick(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setBannerUploading(true)
    try {
      const url = await uploadImage(file, me.id, 'play-group-banner')
      await saveGroup({ banner_image_url: url })
    } finally {
      setBannerUploading(false)
    }
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
    setPrivacySaving(true)
    const { error: err } = await supabase.rpc('set_play_group_privacy', { p_group_id: group.id, p_is_closed: nextClosed, p_password: null })
    setPrivacySaving(false)
    if (!err) onUpdate({ is_closed: nextClosed })
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
              <input value={name} onChange={(e) => setName(e.target.value)} onBlur={() => { if (name.trim() && name.trim() !== group.name) saveGroup({ name: name.trim() }); else setName(group.name) }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
              <label style={{ marginTop: 10 }}>Ícone (opcional)</label>
              <div className="play-role-emoji-row">
                <button type="button" className={!group.emoji ? 'active' : ''} onClick={() => saveGroup({ emoji: null })}>sem</button>
                {ROLE_EMOJIS.map((em) => (
                  <button key={em} type="button" className={group.emoji === em ? 'active' : ''} onClick={() => saveGroup({ emoji: em })}>{em}</button>
                ))}
              </div>
              <label style={{ marginTop: 10 }}>Descrição</label>
              <input value={description} onChange={(e) => setDescription(e.target.value)} onBlur={() => { const d = description.trim() || null; if (d !== (group.description || null)) saveGroup({ description: d }) }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder="Sem descrição" />
              <label style={{ marginTop: 10 }}>Características (até 4)</label>
              <TagEditor tags={tags} onChange={(next) => { setTags(next); saveGroup({ tags: next }) }} />
              {error && <p className="auth-error">{error}</p>}

              <button type="button" className={'play-customize-toggle' + (showCustomize ? ' open' : '')} aria-expanded={showCustomize} onClick={() => setShowCustomize((v) => !v)}>
                Personalizar banner do servidor <span aria-hidden="true" style={{ display: 'inline-flex', transform: showCustomize ? 'rotate(180deg)' : undefined }}><IconChevronDown size={16} /></span>
              </button>
              {showCustomize && (
                <div className="play-customize-body">
                  <div
                    className="profile-banner-preview"
                    style={{
                      display: 'block', width: '100%', minWidth: '100%', height: 188, minHeight: 188, boxSizing: 'border-box',
                      ...(group.banner_image_url
                        ? { backgroundImage: 'url(' + group.banner_image_url + ')', backgroundPosition: '50% 50%', backgroundSize: 'cover' }
                        : { background: group.banner_color || 'var(--green)' }),
                    }}
                  >
                    <div className="profile-banner-preview-avatar">
                      {group.image_url ? <img src={group.image_url} alt="" /> : <span style={{ fontWeight: 700 }}>{group.name[0]?.toUpperCase()}</span>}
                    </div>
                  </div>
                  <label style={{ marginTop: 12 }}>Imagem ou GIF</label>
                  <input ref={bannerFileRef} type="file" accept="image/*" hidden onChange={handleBannerPick} />
                  <button type="button" className="google-btn" disabled={bannerUploading} onClick={() => bannerFileRef.current?.click()}>
                    {bannerUploading ? 'enviando...' : group.banner_image_url ? 'Trocar imagem' : 'Escolher imagem'}
                  </button>
                  {group.banner_image_url && (
                    <button type="button" className="google-btn" style={{ marginTop: 6 }} onClick={() => saveGroup({ banner_image_url: null })}>Remover imagem</button>
                  )}
                  <label style={{ marginTop: 12 }}>Cor de fundo (banner)</label>
                  <div className="banner-color-picker">
                    <button type="button" className={'banner-color-swatch banner-color-reset' + (!group.banner_color && !group.banner_image_url ? ' active' : '')} onClick={() => saveGroup({ banner_color: null, banner_image_url: null })} title="Padrão">
                      <IconMinusCircle size={14} />
                    </button>
                    {BANNER_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        className={'banner-color-swatch' + (!group.banner_image_url && group.banner_color === c ? ' active' : '')}
                        style={{ background: c }}
                        onClick={() => saveGroup({ banner_color: c, banner_image_url: null })}
                      />
                    ))}
                    <input
                      type="color"
                      className="banner-color-swatch banner-color-custom"
                      value={group.banner_color && group.banner_color.startsWith('#') ? group.banner_color : '#5865f2'}
                      onChange={() => {}}
                      onBlur={(ev) => saveGroup({ banner_color: ev.target.value, banner_image_url: null })}
                    />
                  </div>
                </div>
              )}
              </>)}

              {canPrivacy && (<>
              <label style={{ marginTop: 16 }}>Privacidade</label>
              <div className="play-group-privacy-toggle">
                <button type="button" className={!group.is_closed ? 'active' : ''} disabled={privacySaving} onClick={() => togglePrivacy(false)}>
                  <IconLockOpen size={13} /> Aberto
                </button>
                <button type="button" className={group.is_closed ? 'active' : ''} disabled={privacySaving} onClick={() => togglePrivacy(true)}>
                  <IconLock size={13} /> Privado
                </button>
              </div>
              <span className="play-invite-hint">No privado, quem abrir o convite envia uma solicitação para a equipe aprovar.</span>
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
            {group.is_closed ? <><IconLock size={13} /> Servidor privado · entrada mediante aprovação</> : <><IconLockOpen size={13} /> Servidor aberto</>}
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
              <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" frame={m.profile.avatar_frame} />
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
                  <div className="emoji-picker play-role-emoji-picker">
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
                          <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" frame={m.profile.avatar_frame} />
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
                          <AvatarBox src={m.profile.avatar_url} id={m.profile.id} fallbackLetter={displayName(m.profile)[0]?.toUpperCase()} className="avatar-sm" frame={m.profile.avatar_frame} />
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
          {error && <p className="auth-error">{error}</p>}
          <button type="button" className="play-bot-store-button" onClick={() => setBotStoreOpen(true)}>＋ Escolher bot na Loja Thoth</button>
          <p className="play-bot-store-caption">Bots deste servidor</p>
          {!botCatalog.some((bot) => installedBotIds.has(bot.id)) && <p className="play-empty">Nenhum bot instalado neste servidor.</p>}
          {botCatalog.filter((bot) => installedBotIds.has(bot.id)).map((bot) => {
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
          {botStoreOpen && <div className="store-modal-backdrop" onMouseDown={() => setBotStoreOpen(false)}><div className="store-modal" onMouseDown={(event) => event.stopPropagation()}><button className="store-modal-close" type="button" onClick={() => setBotStoreOpen(false)}>×</button><span className="store-kicker">LOJA THOTH · BOTS</span><h2>Escolher bot para {group.name}</h2><p>Adicione um bot ao servidor sem sair das configurações.</p><div className="store-targets">{botCatalog.map((bot) => <button key={bot.id} type="button" disabled={installedBotIds.has(bot.id)} onClick={async () => { if (await toggleBot(bot.id, false)) setBotStoreOpen(false) }}><b>{bot.name}</b><span>{installedBotIds.has(bot.id) ? 'Já instalado' : bot.description}</span></button>)}{botCatalog.length === 0 && <div className="store-empty">Nenhum bot disponível no catálogo.</div>}</div></div></div>}
        </div>
      )}
    </div>
  )
}

function VoiceSettingsFields() {
  const [settings, setSettings] = useState<PlayVoiceSettings>(readPlayVoiceSettings)
  const [inputs, setInputs] = useState<MediaDeviceInfo[]>([])
  const [outputs, setOutputs] = useState<MediaDeviceInfo[]>([])
  const [testing, setTesting] = useState(false)
  const [level, setLevel] = useState(0)
  const [capturingKey, setCapturingKey] = useState(false)
  const testStreamRef = useRef<MediaStream | null>(null)
  const testFrameRef = useRef<number | null>(null)

  async function loadDevices(requestPermission = false) {
    let probe: MediaStream | null = null
    try {
      if (requestPermission) probe = await navigator.mediaDevices.getUserMedia({ audio: true })
      const devices = await navigator.mediaDevices.enumerateDevices()
      setInputs(devices.filter((device) => device.kind === 'audioinput'))
      setOutputs(devices.filter((device) => device.kind === 'audiooutput'))
    } catch { /* permissao pode ser concedida somente ao iniciar o teste/canal */ }
    finally { probe?.getTracks().forEach((track) => track.stop()) }
  }

  useEffect(() => {
    setSettings(readPlayVoiceSettings())
    loadDevices(false)
    return stopTest
  }, [])

  useEffect(() => {
    if (!capturingKey) return
    function onKey(e: KeyboardEvent) {
      e.preventDefault()
      update('pushToTalkKey', e.code)
      setCapturingKey(false)
    }
    window.addEventListener('keydown', onKey, { capture: true })
    return () => window.removeEventListener('keydown', onKey, { capture: true })
  }, [capturingKey])

  function update<K extends keyof PlayVoiceSettings>(key: K, value: PlayVoiceSettings[K]) {
    setSettings((current) => {
      const next = { ...current, [key]: value }
      writePlayVoiceSettings(next)
      return next
    })
  }

  function stopTest() {
    testStreamRef.current?.getTracks().forEach((track) => track.stop())
    testStreamRef.current = null
    if (testFrameRef.current != null) cancelAnimationFrame(testFrameRef.current)
    testFrameRef.current = null
    setTesting(false)
    setLevel(0)
    void setMediaAudioMode()
  }

  async function toggleTest() {
    if (testing) { stopTest(); return }
    try {
      const audio: MediaTrackConstraints = {
        ...(settings.inputDeviceId ? { deviceId: { exact: settings.inputDeviceId } } : {}),
        echoCancellation: !isTauriDesktop && settings.inputProfile === 'isolation',
        noiseSuppression: !isTauriDesktop && settings.inputProfile === 'isolation',
        autoGainControl: !isTauriDesktop && settings.inputProfile === 'isolation',
      }
      const stream = await navigator.mediaDevices.getUserMedia({ audio })
      testStreamRef.current = stream
      setTesting(true)
      await loadDevices(false)
      const context = new AudioContext()
      const analyser = context.createAnalyser()
      analyser.fftSize = 256
      context.createMediaStreamSource(stream).connect(analyser)
      const values = new Uint8Array(analyser.frequencyBinCount)
      const draw = () => {
        analyser.getByteFrequencyData(values)
        setLevel(Math.min(100, Math.round((values.reduce((sum, value) => sum + value, 0) / values.length) * 1.7)))
        testFrameRef.current = requestAnimationFrame(draw)
      }
      draw()
    } catch { setTesting(false) }
  }

  return (
    <>
      <h2>Voz</h2>
      <div className="play-voice-device-grid">
        <label>Microfone<select value={settings.inputDeviceId} onChange={(event) => update('inputDeviceId', event.target.value)}><option value="">Padrão do sistema</option>{inputs.filter((device) => device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Microfone ${index + 1}`}</option>)}</select></label>
        <label>Alto-falante<select value={settings.outputDeviceId} onChange={(event) => update('outputDeviceId', event.target.value)}><option value="">Padrão do sistema</option>{outputs.filter((device) => device.deviceId !== 'default').map((device, index) => <option key={device.deviceId} value={device.deviceId}>{device.label || `Saída ${index + 1}`}</option>)}</select></label>
        <label>Volume do microfone: {Math.round(settings.inputVolume * 100)}%<input type="range" min="0" max="1" step="0.05" value={settings.inputVolume} onChange={(event) => update('inputVolume', Number(event.target.value))} /></label>
        <label>Volume do alto-falante: {Math.round(settings.outputVolume * 100)}%<input type="range" min="0" max="1" step="0.05" value={settings.outputVolume} onChange={(event) => update('outputVolume', Number(event.target.value))} /></label>
      </div>
      <div className="play-mic-test"><button type="button" className="google-btn" onClick={toggleTest}>{testing ? 'Parar teste' : 'Teste do microfone'}</button><div><i style={{ width: `${level}%` }} /></div></div>
      <button type="button" className="play-device-refresh" onClick={() => loadDevices(true)}>Atualizar dispositivos de áudio</button>
      <div className="appearance-separator" />
      <h3>Perfil de entrada</h3>
      <label className={`play-voice-radio${isTauriDesktop ? ' disabled' : ''}`}><input type="radio" disabled={isTauriDesktop} checked={settings.inputProfile === 'isolation'} onChange={() => update('inputProfile', 'isolation')} /><span><strong>Isolamento de voz</strong><small>{isTauriDesktop ? 'Desativado no EXE para não abafar o áudio do computador.' : 'Reduz eco e ruído ao redor.'}</small></span></label>
      <label className="play-voice-radio"><input type="radio" checked={settings.inputProfile === 'studio'} onChange={() => update('inputProfile', 'studio')} /><span><strong>Estúdio</strong><small>Áudio puro, sem processamento.</small></span></label>
      <div className="appearance-separator" />
      <h3>Redução de ruído</h3>
      <span className="play-share-menu-hint" style={{ display: 'block', marginBottom: 6 }}>
        Atenua chiado/ruído de fundo no microfone, independente do perfil de entrada. Quanto mais alto o nível, mais agressivo o corte.
        {isTauriDesktop && ' Pode abafar um pouco o som externo captado pelo microfone (ex.: alto-falante da sala) em níveis mais altos.'}
      </span>
      {(['off', 'low', 'medium', 'high'] as const).map((level) => (
        <label key={level} className="play-voice-radio">
          <input type="radio" checked={settings.noiseReduction === level} onChange={() => update('noiseReduction', level)} />
          <span><strong>{level === 'off' ? 'Desligado' : level === 'low' ? 'Baixo' : level === 'medium' ? 'Médio' : 'Alto'}</strong></span>
        </label>
      ))}
      <label className="play-voice-toggle"><span><strong>Detecção de voz</strong><small>Transmite sua voz automaticamente, sem apertar para falar.</small></span><input type="checkbox" checked={settings.voiceActivation} onChange={(event) => update('voiceActivation', event.target.checked)} /></label>
      {!settings.voiceActivation && (
        <label className="play-voice-radio">
          <span>
            <strong>Tecla de apertar para falar</strong>
            <small>{capturingKey ? 'Aperte a tecla que você quer usar...' : `Tecla atual: ${settings.pushToTalkKey || 'nenhuma escolhida'}`}</small>
          </span>
          <button type="button" className="play-device-refresh" onClick={() => setCapturingKey(true)} disabled={capturingKey}>Trocar tecla</button>
        </label>
      )}
      <p className="play-voice-help">Para manter música e jogos em estéreo com fone Bluetooth, escolha outro microfone como entrada. A detecção de voz precisa manter o microfone selecionado disponível.</p>
    </>
  )
}

function ProfilePanel({ me, open, onClose, onSaved }: { me: Profile; open: boolean; onClose: () => void; onSaved: () => void }) {
  const [view, setView] = useState<'menu' | 'profile' | 'store' | 'library' | 'settings'>('menu')
  const [storeBackSignal, setStoreBackSignal] = useState(0)
  const [loaded, setLoaded] = useState(false)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(me.avatar_url ?? null)
  const [displayNameDraft, setDisplayNameDraft] = useState(me.display_name || me.username)
  const [statusDraft, setStatusDraft] = useState(me.status || '')
  const [themePref, setThemePref] = useState<PlayThemeId>(DEFAULT_PLAY_THEME)
  const [bannerColor, setBannerColor] = useState<string | null>(null)
  const [bannerImage, setBannerImage] = useState<string | null>(null)
  const [profileTags, setProfileTags] = useState<string[]>([])
  const [bannerUploading, setBannerUploading] = useState(false)
  const bannerFileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [cropFile, setCropFile] = useState<File | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!open) return
    setView('menu')
    setLoaded(false)
    supabase.from('play_profiles').select('*').eq('user_id', me.id).maybeSingle().then(({ data }) => {
      const p = data as PlayProfile | null
      setAvatarUrl(p?.avatar_url || me.avatar_url || null)
      setDisplayNameDraft(p?.display_name || me.display_name || me.username)
      setStatusDraft(p?.status || me.status || '')
      setThemePref(normalizePlayTheme(p?.theme_preference))
      setBannerColor(p?.banner_color || null)
      setBannerImage(p?.banner_image_url || null)
      setProfileTags(p?.tags || [])
      setLoaded(true)
    })
  }, [me.id, open])

  function goBack() {
    if (view === 'menu') { onClose(); return }
    if (view === 'store' || view === 'library') { setStoreBackSignal((value) => value + 1); return }
    setView('menu')
  }

  async function upsert(patch: Partial<PlayProfile>) {
    await supabase.from('play_profiles').upsert({ user_id: me.id, ...patch }, { onConflict: 'user_id' })
  }

  // Tema aplica na hora (nao espera o "Salvar" geral) - senao clicar em
  // A escolha aplica na hora (nao espera o "Salvar" geral). As opcoes vem
  // do catalogo central, entao novos temas nao exigem novos botoes aqui.
  async function applyTheme(next: PlayThemeId) {
    setThemePref(next)
    await upsert({ theme_preference: next })
    onSaved()
  }

  // sem botao Salvar: cada campo grava sozinho ao mudar (igual ao perfil do Messenger)
  async function autosave(patch: Partial<PlayProfile>) {
    await upsert(patch)
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
      await autosave({ banner_image_url: url })
    } finally {
      setBannerUploading(false)
    }
  }

  function pickBannerColor(c: string | null) {
    setBannerColor(c)
    setBannerImage(null)
    autosave({ banner_color: c, banner_image_url: null })
  }

  function removeBannerImage() {
    setBannerImage(null)
    autosave({ banner_image_url: null })
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
        <button type="button" className="icon-btn" onClick={goBack}><IconArrowLeft size={20} /></button>
        <strong>{view === 'menu' ? 'Perfil' : view === 'profile' ? 'Conta' : view === 'store' ? 'Loja do Play' : view === 'library' ? 'Minha coleção' : 'Configurações'}</strong>
      </div>
      {view === 'menu' ? (
        <div className="play-group-info-body play-account-menu">
          <span className="play-account-menu-category">Sua conta no Play</span>
          <button type="button" onClick={() => setView('profile')}><IconUser size={20} /><span><strong>Conta</strong><small>Nome, foto, status, banner e características</small></span><IconChevronDown size={16} /></button>
          <span className="play-account-menu-category">Personalização</span>
          <button type="button" onClick={() => setView('store')}><IconGamepad size={20} /><span><strong>Loja do Play</strong><small>Nome de perfil, molduras e placas de nome</small></span><IconChevronDown size={16} /></button>
          <button type="button" onClick={() => setView('library')}><IconFolder size={20} /><span><strong>Minha coleção</strong><small>Seus itens baixados e equipados</small></span><IconChevronDown size={16} /></button>
          <span className="play-account-menu-category">Aplicativo</span>
          <button type="button" onClick={() => setView('settings')}><IconSettingsGear size={20} /><span><strong>Configurações</strong><small>Voz, microfone e alto-falante</small></span><IconChevronDown size={16} /></button>
        </div>
      ) : view === 'store' || view === 'library' ? (
        <ThothStore me={me} mode={view === 'library' ? 'library' : 'store'} scope="play" onProfileChange={() => {}} backSignal={storeBackSignal} onExit={() => { onSaved(); setView('menu') }} />
      ) : view === 'settings' ? (
        <div className="play-group-info-body">
          <h2>Tema do Play</h2>
          <div className="play-theme-picker">{PLAY_THEMES.map((theme) => <button key={theme.id} type="button" className={`play-theme-option${themePref === theme.id ? ' active' : ''}`} aria-pressed={themePref === theme.id} onClick={() => applyTheme(theme.id)}><span className="play-theme-preview" aria-hidden="true">{theme.colors.map((themeColor) => <i key={themeColor} style={{ background: themeColor }} />)}</span><span className="play-theme-option-copy"><strong>{theme.label}</strong><small>{theme.description}</small></span><span className="play-theme-check" aria-hidden="true">✓</span></button>)}</div>
          <div className="appearance-separator" />
          <VoiceSettingsFields />
        </div>
      ) : view === 'profile' ? (
      <div className="play-group-info-body">
        <div
          className="profile-banner-preview"
          style={{
            display: 'block', width: '100%', minWidth: '100%', height: 188, minHeight: 188, boxSizing: 'border-box',
            ...(bannerImage
              ? { backgroundImage: 'url(' + bannerImage + ')', backgroundPosition: '50% 50%', backgroundSize: 'cover' }
              : { background: bannerColor || 'var(--green)' }),
          }}
        >
          <div className="profile-banner-preview-avatar" style={{ pointerEvents: 'auto', cursor: 'pointer' }} title="Trocar foto" onClick={() => fileRef.current?.click()}>
            {avatarUrl ? <img src={avatarUrl} alt="" /> : <IconUser size={26} />}
          </div>
        </div>
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={handleAvatarPick} />
        {uploading && <p className="play-empty">enviando foto...</p>}
        <label style={{ marginTop: 12 }}>Imagem ou GIF</label>
        <input ref={bannerFileRef} type="file" accept="image/*" hidden onChange={handleBannerPick} />
        <button type="button" className="google-btn" disabled={bannerUploading} onClick={() => bannerFileRef.current?.click()}>
          {bannerUploading ? 'enviando...' : bannerImage ? 'Trocar imagem' : 'Escolher imagem'}
        </button>
        {bannerImage && (
          <button type="button" className="google-btn" style={{ marginTop: 6 }} onClick={removeBannerImage}>Remover imagem</button>
        )}

        <label style={{ marginTop: 12 }}>Cor de fundo (foto)</label>
        <div className="banner-color-picker">
          <button type="button" className={'banner-color-swatch banner-color-reset' + (!bannerColor && !bannerImage ? ' active' : '')} onClick={() => pickBannerColor(null)} title="Padrão">
            <IconMinusCircle size={14} />
          </button>
          {BANNER_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              className={'banner-color-swatch' + (!bannerImage && bannerColor === c ? ' active' : '')}
              style={{ background: c }}
              onClick={() => pickBannerColor(c)}
            />
          ))}
          <input
            type="color"
            className="banner-color-swatch banner-color-custom"
            value={bannerColor && bannerColor.startsWith('#') ? bannerColor : '#5865f2'}
            onChange={(ev) => setBannerColor(ev.target.value)}
            onBlur={(ev) => pickBannerColor(ev.target.value)}
          />
        </div>

        <div className="appearance-separator" />

        <label style={{ marginTop: 14 }}>Nome de exibição</label>
        <input value={displayNameDraft} onChange={(e) => setDisplayNameDraft(e.target.value)} onBlur={() => autosave({ display_name: displayNameDraft.trim() || null })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} />
        <label style={{ marginTop: 10 }}>Status</label>
        <input value={statusDraft} onChange={(e) => setStatusDraft(e.target.value)} onBlur={() => autosave({ status: statusDraft.trim() || null })} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()} placeholder="De boa" />

        {loaded && (
          <>
            <label style={{ marginTop: 14 }}>Características (até 4)</label>
            <TagEditor tags={profileTags} onChange={(next) => { setProfileTags(next); autosave({ tags: next }) }} />
          </>
        )}
      </div>
      ) : null}
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
  isSpeaking: boolean
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

function VoiceTile({ p, avatarUrl, bannerColor, bannerImageUrl, startedAt, maximized, inPip, screenAudio, onFullscreen, onToggleMaximize, onVolumeMenu }: {
  p: ParticipantTile; avatarUrl: string | null; bannerColor?: string | null; bannerImageUrl?: string | null
  startedAt?: number; maximized: boolean; inPip: boolean; screenAudio?: HTMLMediaElement
  onFullscreen: (id: string) => void; onTogglePip: (id: string) => void; onToggleMaximize: (id: string) => void
  onVolumeMenu: (id: string, x: number, y: number) => void
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
    <div className={'play-voice-tile' + (maximized ? ' maximized' : '') + (p.isSpeaking && p.micOn ? ' speaking' : '')}>
      <div
        className="play-voice-tile-head"
        onContextMenu={(e) => { e.preventDefault(); onVolumeMenu(p.id, e.clientX, e.clientY) }}
      >
        {p.micOn ? <IconMic size={13} /> : <IconMicOff size={13} />}
        <span>{p.name}{p.isLocal ? ' (você)' : ''}</span>
        {p.isScreen && <em>transmitindo</em>}
        {inPip && <em>PiP</em>}
      </div>
      <div
        className="play-voice-tile-stage"
        style={!showVideo ? (bannerImageUrl ? { backgroundImage: 'url(' + bannerImageUrl + ')', backgroundSize: 'cover', backgroundPosition: '50% 50%' } : { background: bannerColor || 'var(--bg-panel)' }) : undefined}
        onClick={() => { if (showVideo && !ownScreen) onToggleMaximize(p.id) }}
        onContextMenu={(e) => { e.preventDefault(); onVolumeMenu(p.id, e.clientX, e.clientY) }}
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
            <button type="button" onClick={(e) => { const r = e.currentTarget.getBoundingClientRect(); onVolumeMenu(p.id, r.left, r.top - 130) }} title="Mais opções"><IconMore size={16} /></button>
          </div>
        )}
      </div>
    </div>
  )
}

function VoiceChannel({ allow, me, membersById, channel, onParticipantsChange, onLeave, pipIds, maximizedId, onFullscreen, onTogglePip, onToggleMaximize }: {
  allow: { speak: boolean; camera: boolean; screen: boolean }
  me: Profile; membersById: Record<string, Profile>; channel: PlayChannel; onParticipantsChange: (p: VoiceParticipantInfo[]) => void; onLeave: () => void
  pipIds: string[]; maximizedId: string | null; onFullscreen: (id: string) => void; onTogglePip: (id: string) => void; onToggleMaximize: (id: string) => void
}) {
  const voiceSettings = readPlayVoiceSettings()
  // Mantido atualizado ao vivo (evento VOICE_SETTINGS_CHANGED_EVENT) pra volume/dispositivo de
  // saida e ganho do microfone reagirem na hora, mesmo com a chamada ja conectada - "voiceSettings"
  // acima e so o valor inicial (fica parado, preso no fechamento do efeito de conexao).
  const voiceSettingsRef = useRef<PlayVoiceSettings>(voiceSettings)
  const micGainNodeRef = useRef<GainNode | null>(null)
  const micAudioCtxRef = useRef<AudioContext | null>(null)
  const rawMicTrackRef = useRef<MediaStreamTrack | null>(null)
  const micChainNodesRef = useRef<AudioNode[]>([])
  const noiseGateLoopRef = useRef<number | null>(null)
  const localSpeakingRef = useRef(false)
  const speakingAnalyserRef = useRef<AnalyserNode | null>(null)
  const speakingLoopRef = useRef<number | null>(null)
  const speakingHangoverRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    function onSettingsChanged(e: Event) {
      const next = (e as CustomEvent<PlayVoiceSettings>).detail
      const noiseLevelChanged = next.noiseReduction !== voiceSettingsRef.current.noiseReduction
      voiceSettingsRef.current = next
      if (micGainNodeRef.current) micGainNodeRef.current.gain.value = next.inputVolume
      // O nivel muda a topologia/limiar do gate. Remonta a cadeia sobre o mesmo track cru para a
      // alteracao ter efeito imediatamente, sem pedir permissao nem reabrir o microfone. Roda
      // ANTES do loop de volume dos remotos abaixo, de proposito: um valor de volume remoto
      // invalido ali nao pode mais impedir a propria voz de ser reprocessada.
      if (noiseLevelChanged && roomRef.current) void applyMicGainProcessing()
      // Boost real acima de 100% via GainNode (applyParticipantVolume) - HTMLMediaElement.volume
      // sozinho so aceita 0..1 e travava a propria voz aqui (a troca de nivel de ruido rodava
      // depois no codigo original e nunca era alcancada se isso lancasse excessao).
      for (const [identity, els] of Object.entries(participantAudioEls.current)) {
        const pv = participantVolumesRef.current[identity] ?? 1
        const vol = Math.max(0, next.outputVolume * pv)
        els.forEach((el) => {
          applyParticipantVolume(el, vol)
          if (next.outputDeviceId) applyParticipantSink(el, next.outputDeviceId)
        })
      }
    }
    window.addEventListener(VOICE_SETTINGS_CHANGED_EVENT, onSettingsChanged)
    return () => window.removeEventListener(VOICE_SETTINGS_CHANGED_EVENT, onSettingsChanged)
  }, [])
  // "Volume do microfone" so tinha efeito nenhum - o slider gravava o valor mas nada lia ele de
  // volta. Aqui monta um GainNode de verdade (Web Audio) entre o mic cru e o que e publicado pro
  // LiveKit, e troca o track publicado pelo processado - dai o slider passa a afetar de verdade,
  // inclusive ao vivo durante a chamada (via onSettingsChanged acima).
  async function applyMicGainProcessing() {
    try {
      const room = roomRef.current
      const pub = room?.localParticipant.getTrackPublication(Track.Source.Microphone)
      if (!room || !pub?.track) return
      // So recaptura o microfone cru na primeira vez (ou se o anterior parou de verdade) - nas
      // trocas seguintes (mutar/desmutar, apertar-pra-falar) o LiveKit so muta a MESMA
      // publicacao, que ja e o NOSSO track processado (saida do Web Audio). Ler
      // pub.track.mediaStreamTrack de novo pegaria esse audio ja processado e montaria outro
      // GainNode/compressor em cima - empilhando processamento a cada toggle ate degradar o
      // audio e silenciar de vez (bug real: ficou tudo mudo depois de varios aperta-solta do
      // apertar-pra-falar).
      let rawTrack = rawMicTrackRef.current
      if (!rawTrack || rawTrack.readyState === 'ended') {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: await resolvePlayMicOptions() })
        rawTrack = stream.getAudioTracks()[0]
        rawMicTrackRef.current = rawTrack
      }
      // Desconecta a cadeia de nos da chamada anterior (toggle de mic/apertar-pra-falar
      // anterior) antes de montar uma nova - sem isso cada toggle deixava um GainNode/
      // compressor/destination orfao ainda rodando, vazando processamento.
      micChainNodesRef.current.forEach((n) => { try { n.disconnect() } catch { /* ja desconectado */ } })
      micChainNodesRef.current = []
      if (noiseGateLoopRef.current != null) cancelAnimationFrame(noiseGateLoopRef.current)
      noiseGateLoopRef.current = null

      const ctx = micAudioCtxRef.current || new AudioContext()
      micAudioCtxRef.current = ctx
      if (ctx.state === 'suspended') await ctx.resume()
      const source = ctx.createMediaStreamSource(new MediaStream([rawTrack]))
      const gain = ctx.createGain()
      gain.gain.value = voiceSettingsRef.current.inputVolume
      source.connect(gain)
      let node: AudioNode = gain
      const noiseLevel = voiceSettingsRef.current.noiseReduction
      const chainNodes: AudioNode[] = [source, gain]
      // O supressor nativo do navegador (ligado via constraint noiseSuppression em
      // resolvePlayMicOptions) ja processa o audio ANTES dele chegar aqui, se o navegador/SO
      // confirmou que aceitou a constraint (getSettings().noiseSuppression true). Nesse caso o
      // gate caseiro abaixo (analyser+RMS) so atrapalharia, rodando em cima de um audio que ja
      // foi tratado - prefere o supressor nativo (testado, mantido pelo Chromium) e pula o gate.
      const nativeSuppressionActive = rawTrack.getSettings().noiseSuppression === true
      if (noiseLevel !== 'off' && !nativeSuppressionActive) {
        const preset = NOISE_REDUCTION_PRESETS[noiseLevel]
        const highpass = ctx.createBiquadFilter()
        highpass.type = 'highpass'
        highpass.frequency.value = preset.highpassHz
        highpass.Q.value = 0.7
        const analyser = ctx.createAnalyser()
        analyser.fftSize = 512
        analyser.smoothingTimeConstant = 0.25
        const gate = ctx.createGain()
        gate.gain.value = 1
        // O analisador fica antes do gate para ele continuar percebendo a voz mesmo fechado.
        gain.connect(highpass)
        highpass.connect(analyser)
        analyser.connect(gate)
        node = gate
        chainNodes.push(highpass, analyser, gate)

        const samples = new Float32Array(analyser.fftSize)
        const openThreshold = 10 ** (preset.thresholdDb / 20)
        // Gap maior entre abrir/fechar evita o gate "chacoalhando" (abre/fecha repetido) quando o
        // nivel fica perto do limiar - esse chacoalhar e o que soava como ruido/estalo extra,
        // mais perceptivel em "alto" por ter o maior salto de ganho (floor mais baixo).
        const closeThreshold = openThreshold * 0.5
        let gateOpen = true
        let lastVoiceAt = performance.now()
        // Clique de mouse/teclado e um estalo rapidissimo (poucos ms) mas costuma ser BEM mais
        // alto em RMS do que fala normal por uma fracao de segundo - abrindo o gate na hora,
        // deixando passar o clique inteiro. Fala de verdade sustenta acima do limiar por mais
        // tempo. Exige o nivel se manter acima do limiar por alguns frames seguidos antes de
        // abrir de vez - filtra o clique isolado sem atrasar a fala de um jeito perceptivel.
        const MIN_SUSTAIN_MS = 45
        let aboveSince: number | null = null
        const updateGate = () => {
          analyser.getFloatTimeDomainData(samples)
          let sumSquares = 0
          for (const sample of samples) sumSquares += sample * sample
          const rms = Math.sqrt(sumSquares / samples.length)
          const now = performance.now()
          if (rms >= openThreshold) {
            lastVoiceAt = now
            if (!gateOpen) {
              if (aboveSince == null) aboveSince = now
              if (now - aboveSince >= MIN_SUSTAIN_MS) {
                gateOpen = true
                aboveSince = null
                gate.gain.cancelScheduledValues(ctx.currentTime)
                // Abertura mais suave (20ms) - um salto rapido do floor pra 1 produzia um
                // estalo/pop audivel no inicio de cada fala, pior em "alto" (floor mais baixo).
                gate.gain.setTargetAtTime(1, ctx.currentTime, 0.02)
              }
            }
          } else {
            aboveSince = null
            if (gateOpen && rms < closeThreshold && now - lastVoiceAt >= preset.releaseMs) {
              gateOpen = false
              gate.gain.cancelScheduledValues(ctx.currentTime)
              gate.gain.setTargetAtTime(preset.floor, ctx.currentTime, 0.045)
            }
          }
          noiseGateLoopRef.current = requestAnimationFrame(updateGate)
        }
        updateGate()
      }
      const dest = ctx.createMediaStreamDestination()
      node.connect(dest)
      chainNodes.push(dest)
      micChainNodesRef.current = chainNodes
      const processedTrack = dest.stream.getAudioTracks()[0]
      micGainNodeRef.current = gain
      await pub.track.replaceTrack(processedTrack, true)
      startLocalSpeakingDetection(ctx, node)
    } catch (err) {
      console.error('mic gain setup failed', err)
    }
  }

  // O track publicado depois do GainNode acima e sintetico (saida de AudioContext, nao mais o
  // MediaStreamTrack cru do microfone) - em alguns navegadores/WebView o servidor do LiveKit nao
  // consegue calcular o nivel de audio desse tipo de track pra detectar quem esta falando, entao
  // so a SUA propria borda verde parava de acender (participantes remotos, sem esse processamento,
  // continuavam normais). Detecta localmente com um AnalyserNode e sobrepoe isSpeaking so pra
  // voce em syncParticipants, sem depender do RoomEvent.ActiveSpeakersChanged do servidor.
  function startLocalSpeakingDetection(ctx: AudioContext, node: AudioNode) {
    if (speakingLoopRef.current != null) cancelAnimationFrame(speakingLoopRef.current)
    const analyser = ctx.createAnalyser()
    analyser.fftSize = 512
    analyser.smoothingTimeConstant = 0.6
    node.connect(analyser)
    speakingAnalyserRef.current = analyser
    const data = new Uint8Array(analyser.frequencyBinCount)
    const THRESHOLD = 12
    const HANGOVER_MS = 400
    const loop = () => {
      analyser.getByteFrequencyData(data)
      const level = data.reduce((sum, v) => sum + v, 0) / data.length
      if (level > THRESHOLD) {
        if (speakingHangoverRef.current) { clearTimeout(speakingHangoverRef.current); speakingHangoverRef.current = null }
        if (!localSpeakingRef.current) {
          localSpeakingRef.current = true
          const room = roomRef.current
          if (room) syncParticipants(room)
        }
      } else if (localSpeakingRef.current && !speakingHangoverRef.current) {
        speakingHangoverRef.current = setTimeout(() => {
          localSpeakingRef.current = false
          speakingHangoverRef.current = null
          const room = roomRef.current
          if (room) syncParticipants(room)
        }, HANGOVER_MS)
      }
      speakingLoopRef.current = requestAnimationFrame(loop)
    }
    loop()
  }
  // No Windows (.exe) sem microfone escolhido a mao, o navegador pega o dispositivo
  // "default"/"comunicacoes" do Windows - e essa escolha de dispositivo (nao so as flags
  // de eco/ruido) que ativa o modo de comunicacoes e abaixa o audio do resto do PC. Pegando
  // o primeiro microfone fisico de verdade evita isso, sem precisar a pessoa configurar nada.
  async function resolvePlayMicOptions(): Promise<AudioCaptureOptions> {
    const voiceSettings = readPlayVoiceSettings()
    let deviceId = voiceSettings.inputDeviceId || undefined
    if (!deviceId && isTauriDesktop) {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices()
        const real = devices.find((d) => d.kind === 'audioinput' && d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
        if (real) deviceId = real.deviceId
      } catch { /* segue sem deviceId especifico */ }
    }
    return {
      ...(deviceId ? { deviceId } : {}),
      // echoCancellation/autoGainControl ficam desligados no desktop fora do perfil "isolamento"
      // de proposito (sao os dois que, juntos, disparavam o "modo de comunicacoes" do Windows e
      // abafavam audio de outros programas - bug historico ja documentado). noiseSuppression
      // sozinho nao tinha essa causa confirmada - ligar so ele usa o supressor nativo do
      // Chromium (testado, mantido pelo Google) em vez do gate caseiro, que foi fonte de varios
      // bugs reais nesta sessao (voz sumindo, 0% ficando alto, etc).
      echoCancellation: !isTauriDesktop && voiceSettings.inputProfile === 'isolation',
      noiseSuppression: voiceSettings.inputProfile === 'isolation' || voiceSettings.noiseReduction !== 'off',
      autoGainControl: !isTauriDesktop && voiceSettings.inputProfile === 'isolation',
    }
  }
  const roomRef = useRef<Room | null>(null)
  const [connected, setConnected] = useState(false)
  const [connecting, setConnecting] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [micEnabled, setMicEnabled] = useState(allow.speak && voiceSettings.voiceActivation)
  const [cameraEnabled, setCameraEnabled] = useState(false)
  const [screenEnabled, setScreenEnabled] = useState(false)
  const [participants, setParticipants] = useState<ParticipantTile[]>([])
  const [screenAudio, setScreenAudio] = useState<Record<string, HTMLMediaElement>>({})
  const shareStart = useRef<Record<string, number>>({})
  // Fone (ensurdecer): silencia o audio de todo mundo pra voce e tambem o seu microfone (igual Discord).
  const [deafened, setDeafened] = useState(false)
  // Viva-voz no Android: canal do Play fica em MODE_NORMAL fora da chamada (nao duckeia outros
  // apps - decisao de antes, ver setMediaAudioMode), mas isso deixa o Chrome escolher a rota de
  // audio sozinho enquanto a chamada esta ativa, que as vezes cai no fone de ouvido/alto-falante
  // baixo em vez do viva-voz de verdade. Ao contrario do setMediaAudioMode (que sempre desliga o
  // viva-voz), isso reaplica a preferencia atual - chamado nos mesmos pontos que antes só
  // resetavam pra normal (conectar, mutar/desmutar, apertar-pra-falar).
  const [speakerOn, setSpeakerOnState] = useState(true)
  const speakerOnRef = useRef(true)
  function applySpeakerRoute() { return setSpeakerphoneOn(speakerOnRef.current) }
  function toggleSpeaker() {
    const next = !speakerOnRef.current
    speakerOnRef.current = next
    setSpeakerOnState(next)
    void setSpeakerphoneOn(next)
  }
  const deafenedRef = useRef(false)
  const micBeforeDeafen = useRef(true)
  const [shareMenuOpen, setShareMenuOpen] = useState(false)
  const [shareQuality, setShareQuality] = useState<'480' | '720'>('720')
  const shareLimit = 60
  const [shareNotice, setShareNotice] = useState<string | null>(null)
  const attachedAudio = useRef<HTMLMediaElement[]>([])
  const participantAudioEls = useRef<Record<string, HTMLMediaElement[]>>({})
  // HTMLMediaElement.volume so aceita 0..1 - pra "turbinar" acima de 100% de verdade (o slider vai
  // ate 200%) precisa de um GainNode de verdade (Web Audio aceita qualquer valor). Uma vez que um
  // elemento vira fonte de um AudioContext, ele para de tocar sozinho - o audio passa a sair pelo
  // destino do contexto, entao isso fica ligado o tempo todo (nao so quando passa de 100%).
  const outputAudioCtxRef = useRef<AudioContext | null>(null)
  const participantGainRef = useRef<Map<HTMLMediaElement, GainNode>>(new Map())
  function applyParticipantVolume(el: HTMLMediaElement, volume: number) {
    try {
      let ctx = outputAudioCtxRef.current
      if (!ctx) { ctx = new AudioContext(); outputAudioCtxRef.current = ctx }
      let gain = participantGainRef.current.get(el)
      if (!gain) {
        const source = ctx.createMediaElementSource(el)
        gain = ctx.createGain()
        source.connect(gain)
        gain.connect(ctx.destination)
        participantGainRef.current.set(el, gain)
      }
      gain.gain.value = Math.max(0, volume)
      // O elemento continua tocando pelo caminho nativo dele em paralelo ao GainNode em alguns
      // navegadores/WebView (apesar da spec dizer que createMediaElementSource "rouba" a saida) -
      // sem isso, o audio real ficava preso no volume nativo (sempre o mesmo, 100%) e o slider
      // so mexia num canal que ninguem ouvia: 0% continuava alto, 200% nao turbinava de verdade.
      // So zera o nativo depois de confirmar que o contexto esta de verdade rodando - um
      // AudioContext novo pode nascer "suspended" (politica de autoplay do navegador, so libera
      // depois de alguma interacao de verdade) e, se o nativo for zerado antes disso, ninguem
      // ouve nada ate o contexto resumir (foi o que deixou a voz de alguem sumida de vez - o
      // boost rodava num contexto que nunca chegou a tocar). Enquanto suspenso, o caminho nativo
      // continua audivel (sem boost acima de 100%, mas nunca mudo) e tenta resumir sozinho.
      if (ctx.state === 'running') {
        el.volume = 0
      } else {
        el.volume = Math.min(1, Math.max(0, volume))
        void ctx.resume().then(() => {
          if (outputAudioCtxRef.current === ctx && ctx.state === 'running') applyParticipantVolume(el, volume)
        })
      }
    } catch {
      // Fallback se o navegador recusar (raro) - sem boost acima de 100%, mas nao quebra o audio.
      try { el.volume = Math.min(1, Math.max(0, volume)) } catch { /* ignora */ }
    }
  }
  function applyParticipantSink(el: HTMLMediaElement, deviceId: string) {
    const ctx = outputAudioCtxRef.current
    // Depois que o elemento vira fonte do AudioContext, o audio sai pelo destino DO CONTEXTO, nao
    // mais pelo proprio <audio> - setSinkId no elemento nao tem mais efeito nenhum. setSinkId do
    // AudioContext e recente (Chromium 110+); sem suporte so continua no dispositivo padrao.
    if (ctx && 'setSinkId' in ctx) {
      void (ctx as AudioContext & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId).catch(() => {})
    } else if ('setSinkId' in el) {
      void (el as HTMLAudioElement & { setSinkId: (id: string) => Promise<void> }).setSinkId(deviceId).catch(() => {})
    }
  }
  const [participantVolumes, setParticipantVolumes] = useState<Record<string, number>>(() => {
    try { return JSON.parse(localStorage.getItem('thoth-play-participant-volumes') || '{}') } catch { return {} }
  })
  const participantVolumesRef = useRef(participantVolumes)
  useEffect(() => { participantVolumesRef.current = participantVolumes }, [participantVolumes])
  const [volumeMenu, setVolumeMenu] = useState<{ id: string; x: number; y: number } | null>(null)

  // Volume individual por participante (tipo Discord) - multiplica em cima do volume geral de
  // saida. Guardado por localStorage (nao por pessoa especifica, so pelo identity/id do perfil)
  // pra persistir entre chamadas.
  function setParticipantVolume(id: string, v: number) {
    setParticipantVolumes((prev) => {
      const next = { ...prev, [id]: v }
      try { localStorage.setItem('thoth-play-participant-volumes', JSON.stringify(next)) } catch { /* ignore */ }
      return next
    })
    const els = participantAudioEls.current[id] || []
    const vol = Math.max(0, voiceSettingsRef.current.outputVolume * v)
    els.forEach((el) => applyParticipantVolume(el, vol))
  }

  function syncParticipants(room: Room) {
    const all: (LocalParticipant | RemoteParticipant)[] = [room.localParticipant, ...Array.from(room.remoteParticipants.values())]
    const tiles: ParticipantTile[] = all.map((p) => {
      const pubs = Array.from(p.trackPublications.values() as IterableIterator<TrackPublication>)
      // LiveKit so desublica (remove pub.track de vez) a transmissao de tela ao desligar, mas a
      // camera so MUTA a publicacao existente (pub.track continua presente, so congela preto) -
      // sem o !pub.isMuted aqui, uma camera desligada ainda contava como "video ao vivo" e
      // aparecia como quadro preto congelado em vez de voltar pra foto de perfil/avatar.
      const screenPub = pubs.find((pub) => pub.source === Track.Source.ScreenShare && !!pub.track && !pub.isMuted)
      const camPub = pubs.find((pub) => pub.source === Track.Source.Camera && !!pub.track && !pub.isMuted)
      const videoPub = screenPub || camPub
      if (screenPub) { if (!shareStart.current[p.identity]) shareStart.current[p.identity] = Date.now() }
      else delete shareStart.current[p.identity]
      const isLocal = p === room.localParticipant
      return {
        id: p.identity,
        name: p.name || p.identity,
        isLocal,
        micOn: p.isMicrophoneEnabled,
        isScreen: !!screenPub,
        isSpeaking: isLocal ? localSpeakingRef.current : p.isSpeaking,
        videoTrack: videoPub?.track,
        cameraTrack: screenPub ? camPub?.track : undefined,
      }
    })
    setParticipants(tiles)
    onParticipantsChange(tiles.map((t) => ({ id: t.id, name: t.name, micOn: t.micOn, isScreen: t.isScreen, videoTrack: t.videoTrack, cameraTrack: t.cameraTrack })))
  }

  useEffect(() => {
    let cancelled = false
    const room = new Room()
    roomRef.current = room

    room
      .on(RoomEvent.ParticipantConnected, () => syncParticipants(room))
      .on(RoomEvent.ParticipantDisconnected, () => syncParticipants(room))
      .on(RoomEvent.TrackSubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          const el = track.attach()
          el.style.display = 'none'
          el.muted = deafenedRef.current
          document.body.appendChild(el)
          const pv = participantVolumesRef.current[participant.identity] ?? 1
          applyParticipantVolume(el, Math.max(0, voiceSettings.outputVolume * pv))
          if (voiceSettings.outputDeviceId) applyParticipantSink(el, voiceSettings.outputDeviceId)
          attachedAudio.current.push(el)
          const list = participantAudioEls.current[participant.identity] || []
          list.push(el)
          participantAudioEls.current[participant.identity] = list
          if (pub.source === Track.Source.ScreenShareAudio) setScreenAudio((prev) => ({ ...prev, [participant.identity]: el }))
        }
        syncParticipants(room)
      })
      .on(RoomEvent.TrackUnsubscribed, (track, pub, participant) => {
        if (track.kind === Track.Kind.Audio) {
          track.detach().forEach((el) => {
            el.remove()
            attachedAudio.current = attachedAudio.current.filter((x) => x !== el)
            participantGainRef.current.get(el)?.disconnect()
            participantGainRef.current.delete(el)
          })
          const list = participantAudioEls.current[participant.identity]
          if (list) participantAudioEls.current[participant.identity] = list.filter((el) => el.isConnected)
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
      // Borda verde tipo Discord em quem esta falando agora (detecta pelo nivel de audio do mic).
      .on(RoomEvent.ActiveSpeakersChanged, () => syncParticipants(room))

    ;(async () => {
      try {
        const { token, url } = await fetchLiveKitToken(channel.id)
        if (cancelled) return
        await room.connect(url, token)
        // Com deteccao de voz, o WebRTC usa supressao de silencio/DTX e transmite quando ha
        // fala. A captura continua aberta por necessidade tecnica, usando o dispositivo e o
        // perfil escolhidos nas configuracoes de voz.
        if (allow.speak && voiceSettings.voiceActivation) {
          await room.localParticipant.setMicrophoneEnabled(true, await resolvePlayMicOptions())
          await applyMicGainProcessing()
          const micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
          if (micTrack) micTrack.contentHint = 'music' // setado depois do gain pra valer no track final, nao no cru substituido
          setMicEnabled(true)
        } else {
          setMicEnabled(false)
        }
        await applySpeakerRoute()
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
      if (speakingLoopRef.current != null) cancelAnimationFrame(speakingLoopRef.current)
      if (speakingHangoverRef.current) clearTimeout(speakingHangoverRef.current)
      micChainNodesRef.current.forEach((n) => { try { n.disconnect() } catch { /* ja desconectado */ } })
      micChainNodesRef.current = []
      if (noiseGateLoopRef.current != null) cancelAnimationFrame(noiseGateLoopRef.current)
      noiseGateLoopRef.current = null
      rawMicTrackRef.current?.stop()
      rawMicTrackRef.current = null
      micAudioCtxRef.current?.close().catch(() => {})
      micAudioCtxRef.current = null
      participantGainRef.current.clear()
      outputAudioCtxRef.current?.close().catch(() => {})
      outputAudioCtxRef.current = null
      void setMediaAudioMode()
    }
  }, [channel.id])

  function applyDeafen(next: boolean) {
    deafenedRef.current = next
    setDeafened(next)
    attachedAudio.current.forEach((el) => { el.muted = next })
    Object.values(screenAudio).forEach((el) => { el.muted = next })
  }

  async function toggleMic() {
    const room = roomRef.current
    if (!room) return
    const next = !micEnabled
    // ligar o microfone estando ensurdecido tambem volta a ouvir (como no Discord)
    if (next && deafenedRef.current) applyDeafen(false)
    await room.localParticipant.setMicrophoneEnabled(next, next ? await resolvePlayMicOptions() : undefined)
    if (next) {
      await applyMicGainProcessing()
      const micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
      if (micTrack) micTrack.contentHint = 'music'
    }
    await applySpeakerRoute()
    setMicEnabled(next)
    syncParticipants(room)
  }

  // Apertar-pra-falar: so ativo quando "Deteccao de voz" esta desligada nas configuracoes.
  // No desktop segura a tecla escolhida (padrao Espaco); no celular/APK nao tem teclado fisico
  // pra segurar, entao aparece um botao de "segurar pra falar" nos controles da chamada que
  // chama a mesma funcao (ver botao mais abaixo, so quando !voiceActivation).
  const pttHeldRef = useRef(false)
  async function setMicHeld(next: boolean) {
    const room = roomRef.current
    if (!room) return
    if (next && deafenedRef.current) applyDeafen(false)
    await room.localParticipant.setMicrophoneEnabled(next, next ? await resolvePlayMicOptions() : undefined)
    if (next) {
      await applyMicGainProcessing()
      const micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
      if (micTrack) micTrack.contentHint = 'music'
    }
    await applySpeakerRoute()
    setMicEnabled(next)
    syncParticipants(room)
  }
  useEffect(() => {
    if (voiceSettings.voiceActivation || !allow.speak) return
    function isTypingTarget(target: EventTarget | null) {
      const el = target as HTMLElement | null
      return !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
    }
    function onKeyDown(e: KeyboardEvent) {
      if (e.code !== voiceSettings.pushToTalkKey || pttHeldRef.current || isTypingTarget(e.target)) return
      pttHeldRef.current = true
      setMicHeld(true)
    }
    function onKeyUp(e: KeyboardEvent) {
      if (e.code !== voiceSettings.pushToTalkKey) return
      pttHeldRef.current = false
      setMicHeld(false)
    }
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
    }
  }, [voiceSettings.voiceActivation, voiceSettings.pushToTalkKey, allow.speak])

  async function toggleDeafen() {
    const room = roomRef.current
    if (!room) return
    if (!deafenedRef.current) {
      micBeforeDeafen.current = micEnabled
      applyDeafen(true)
      if (micEnabled) {
        await room.localParticipant.setMicrophoneEnabled(false)
        setMicEnabled(false)
      }
    } else {
      applyDeafen(false)
      if (micBeforeDeafen.current && allow.speak) {
        await room.localParticipant.setMicrophoneEnabled(true, await resolvePlayMicOptions())
        await applyMicGainProcessing()
        const micTrack = room.localParticipant.getTrackPublication(Track.Source.Microphone)?.track?.mediaStreamTrack
        if (micTrack) micTrack.contentHint = 'music'
        await applySpeakerRoute()
        setMicEnabled(true)
      }
    }
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
      <header className="play-text-channel-header"><IconVideo size={17} /> {channel.emoji ? channel.emoji + ' ' : ''}{channel.name}</header>
      {shareNotice && <div className="play-share-notice">{shareNotice}</div>}
      {connecting && <p className="play-empty">conectando...</p>}
      {error && <p className="play-empty error">{error}</p>}
      {connected && (
        <>
          <div className={'play-voice-grid' + (maximizedId ? ' has-max' : '')}>
            {participants.map((p) => (
              <VoiceTile
                key={p.id}
                p={p}
                avatarUrl={(p.isLocal ? me.avatar_url : membersById[p.id.replace(':cam', '')]?.avatar_url) || null}
                bannerColor={(p.isLocal ? me.banner_color : membersById[p.id.replace(':cam', '')]?.banner_color) || null}
                bannerImageUrl={(p.isLocal ? me.banner_image_url : membersById[p.id.replace(':cam', '')]?.banner_image_url) || null}
                startedAt={shareStart.current[p.id.replace(':cam', '')]}
                maximized={maximizedId === p.id}
                inPip={pipIds.includes(p.id)}
                screenAudio={screenAudio[p.id.replace(':cam', '')]}
                onFullscreen={onFullscreen}
                onTogglePip={onTogglePip}
                onToggleMaximize={onToggleMaximize}
                onVolumeMenu={(id, x, y) => setVolumeMenu({ id, x, y })}
              />
            ))}
          </div>
          {volumeMenu && (() => {
            const target = participants.find((p) => p.id === volumeMenu.id)
            const hasMedia = !!target && !!target.videoTrack && !(target.isLocal && target.isScreen)
            return (
              <>
                <div className="play-group-menu-backdrop" onClick={() => setVolumeMenu(null)} onContextMenu={(e) => { e.preventDefault(); setVolumeMenu(null) }} />
                <div
                  className="play-group-menu play-volume-menu"
                  style={{ position: 'fixed', top: Math.max(8, Math.min(volumeMenu.y, window.innerHeight - 220)), left: Math.max(8, Math.min(volumeMenu.x, window.innerWidth - 220)), minWidth: 200 }}
                >
                  {!target?.isLocal && (
                    <>
                      <span className="play-volume-menu-label">
                        Volume de {target?.name || ''}: {Math.round((participantVolumes[volumeMenu.id] ?? 1) * 100)}%
                      </span>
                      <input
                        type="range" min="0" max="2" step="0.05"
                        value={participantVolumes[volumeMenu.id] ?? 1}
                        onChange={(e) => setParticipantVolume(volumeMenu.id, Number(e.target.value))}
                      />
                    </>
                  )}
                  {hasMedia && (
                    <>
                      {!target?.isLocal && <div className="play-group-menu-sep" />}
                      <button type="button" onClick={() => { const id = volumeMenu.id; setVolumeMenu(null); onTogglePip(id) }}>
                        <IconMonitorShare size={15} /> {pipIds.includes(volumeMenu.id) ? 'Sair do picture in picture' : 'Picture in picture'}
                      </button>
                      <button type="button" onClick={() => { const id = volumeMenu.id; setVolumeMenu(null); onFullscreen(id) }}>
                        <IconFullscreen size={15} /> Tela cheia
                      </button>
                      <button type="button" onClick={() => { const id = volumeMenu.id; setVolumeMenu(null); onToggleMaximize(id) }}>
                        {maximizedId === volumeMenu.id ? <IconShrink size={15} /> : <IconFullscreen size={15} />} {maximizedId === volumeMenu.id ? 'Restaurar' : 'Maximizar'}
                      </button>
                    </>
                  )}
                </div>
              </>
            )
          })()}
          <div className="play-voice-controls">
            {voiceSettings.voiceActivation ? (
              <button type="button" className={'icon-btn' + (micEnabled ? '' : ' off')} onClick={toggleMic} disabled={!allow.speak} title={!allow.speak ? 'Seu cargo não pode falar na chamada' : micEnabled ? 'Mutar microfone' : 'Ativar microfone'}>
                {micEnabled ? <IconMic size={20} /> : <IconMicOff size={20} />}
              </button>
            ) : (
              // Apertar-pra-falar sem teclado (celular/toque): segura o botao em vez de uma tecla.
              // pointerdown/up cobre mouse e toque nos dois; cancel/leave evita ficar preso ligado
              // se o dedo sair do botao sem soltar (arrastar pra fora, notificacao cobrindo etc.).
              <button
                type="button"
                className={'icon-btn' + (micEnabled ? ' active' : '')}
                disabled={!allow.speak}
                title={!allow.speak ? 'Seu cargo não pode falar na chamada' : 'Segure pra falar'}
                onPointerDown={(e) => { e.preventDefault(); if (allow.speak) setMicHeld(true) }}
                onPointerUp={() => setMicHeld(false)}
                onPointerLeave={() => { if (micEnabled) setMicHeld(false) }}
                onPointerCancel={() => setMicHeld(false)}
              >
                {micEnabled ? <IconMic size={20} /> : <IconMicOff size={20} />}
              </button>
            )}
            <button type="button" className={'icon-btn' + (deafened ? ' off' : '')} onClick={toggleDeafen} title={deafened ? 'Voltar a ouvir a chamada' : 'Parar de ouvir a chamada (fone)'}>
              {deafened ? <IconHeadphonesOff size={20} /> : <IconHeadphones size={20} />}
            </button>
            {Capacitor.isNativePlatform() && (
              <button type="button" className={'icon-btn' + (speakerOn ? ' active' : '')} onClick={toggleSpeaker} title={speakerOn ? 'Desligar viva-voz' : 'Ligar viva-voz'}>
                {speakerOn ? <IconVolume size={20} /> : <IconVolumeOff size={20} />}
              </button>
            )}
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
                    <span className="play-share-menu-label">Qualidade</span>
                    <div className="play-share-quality">
                      <button type="button" className={shareQuality === '480' ? 'active' : ''} onClick={() => setShareQuality('480')}>480p</button>
                      <button type="button" className={shareQuality === '720' ? 'active' : ''} onClick={() => setShareQuality('720')}>720p</button>
                      <button type="button" disabled title="Em breve">1080p</button>
                    </div>
                    <button type="button" className="google-btn" onClick={chooseScreen}>{screenEnabled ? 'Trocar tela ou janela' : 'Escolher tela ou janela'}</button>
                    {screenEnabled && <button type="button" className="settings-danger-btn" onClick={stopScreenShare}>Parar de compartilhar</button>}
                    <small className="play-share-menu-hint">Compartilhamento dura no máximo {shareLimit} minutos e encerra sozinho depois disso.</small>
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
