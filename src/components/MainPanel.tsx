import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import type { RealtimeChannel } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { playNudgeSound, triggerNudgeShake } from '../lib/nudge'
import { WINKS, playWinkEffect, playCustomWinkEffect } from '../lib/winks'
import { getCustomWinks, saveCustomWink, deleteCustomWink, fileToDataUrl, type CustomWink } from '../lib/customWinks'
import { getCustomStickers, saveCustomSticker, deleteCustomSticker, uploadStickerImage, resizeStickerImage, type CustomSticker } from '../lib/stickers'
import { searchGifs, type GifResult } from '../lib/gifSearch'
import { getPresenceColor } from '../lib/presence'
import { isTauriDesktop } from '../lib/platform'
import { getErrorMessage } from '../lib/errors'
import { displayName } from '../lib/displayName'
import { SettingsRow } from './SettingsRow'
import { colorFromId } from '../lib/avatarColor'
import thothLogo from '../../logo/toth_chat.png'
import { sanitizeImageUrl } from '../lib/imageUrl'
import { uploadImage } from '../lib/uploadImage'
import { readCache, writeCache } from '../lib/cache'
import { sendPush } from '../lib/pushSend'
import {
  uploadEphemeralMedia,
  openEphemeralMedia,
  checkExpireEphemeralMedia,
  type EphemeralKind,
  type EphemeralMediaRow,
  type EphemeralMediaView,
  type EphemeralOpenResult,
} from '../lib/ephemeralMedia'
import { IconArrowLeft, IconAttach, IconBell, IconChat, IconCheck, IconCheckDouble, IconChevronDown, IconCrown, IconDownload, IconEdit, IconHeart, IconLock, IconLockOpen, IconMic, IconMinusCircle, IconNudge, IconPanelLeft, IconPhone, IconPlus, IconSend, IconSmile, IconUser, IconVideo, IconVolume, IconVolumeOff } from './icons'
import type { CallKind, CallPeer } from '../lib/call'
import { ReplayPlayer, type ReplayEvent } from './ReplayPlayer'
import { StyledName } from './StyledName'
import { ProfilePopup } from './ProfilePopup'
import type { Bot, Community, Conversation, Message, Profile, SonorSession } from '../types'
import { generateInviteCode, inviteUrl } from '../lib/inviteLink'
import { parseCommand, rollDice, pickRandom } from '../lib/bots'
import { fetchRandomStation, searchPublicStations, isHlsStream, fetchNowPlaying, shortRadioName, youtubeSearchUrl } from '../lib/sonor'

const EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😍',
  '🥰', '😘', '😋', '😜', '🤪', '🤩', '🥳', '😎', '🤓', '🧐',
  '😏', '😒', '🙄', '😬', '🤔', '😴', '🥱', '😪', '😢', '😭',
  '🥺', '😤', '😠', '😡', '🤬', '😨', '😱', '😰', '😅', '😓',
  '🤯', '😳', '🥵', '🥶', '😷', '🤒', '🤕', '🤢', '🤮', '🥴',
  '😵', '🤗', '🤭', '🤫', '🤥', '😶', '💀', '☠️', '👻', '👽',
  '🤖', '🎃', '😺', '😹', '😻', '🙈', '🙉', '🙊',
  '❤️', '🧡', '💛', '💚', '💙', '💜', '🖤', '🤍', '💕', '💞',
  '💓', '💗', '💖', '💘', '💔', '❣️', '💯', '💢', '💥', '💫',
  '👍', '👎', '👏', '🙌', '🙏', '🤝', '👋', '🤙', '💪', '✌️',
  '🤞', '🤟', '👌', '🫡', '👀', '🧠', '🦴',
  '🍕', '🍔', '🍟', '🌭', '🍿', '🍩', '🍪', '🍰', '🎂', '🍫',
  '🍬', '🍭', '🍎', '🍌', '🍉', '🍇', '🍓', '🥑', '🍺', '🍻',
  '🍷', '☕', '🧃', '🥤',
  '⚽', '🏀', '🏈', '🎮', '🎲', '🎧', '🎵', '🎉', '🎊', '🎁',
  '🏆', '🔥', '💧', '⭐', '🌟', '✨', '🌈', '☀️', '🌙', '⚡',
  '🚗', '✈️', '🚀', '📱', '💻', '📷', '💡', '💰', '💸', '🕐',
  '✅', '❌', '❓', '❗', '⚠️', '🔒', '👑', '💎',
]
const REPLAY_WINDOW_MS = 20000

function formatMessageTime(iso: string): string {
  return new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}

function isSameDay(a: string, b: string): boolean {
  const da = new Date(a)
  const db = new Date(b)
  return da.getFullYear() === db.getFullYear() && da.getMonth() === db.getMonth() && da.getDate() === db.getDate()
}

function formatDateLabel(iso: string): string {
  const d = new Date(iso)
  const today = new Date()
  const yesterday = new Date()
  yesterday.setDate(today.getDate() - 1)
  if (isSameDay(iso, today.toISOString())) return 'Hoje'
  if (isSameDay(iso, yesterday.toISOString())) return 'Ontem'
  return d.toLocaleDateString('pt-BR')
}

// fecha um popup (menu/picker) ao clicar ou tocar fora de qualquer um dos elementos passados em `refs`
function useOutsideClose(active: boolean, refs: React.RefObject<HTMLElement | null>[], onClose: () => void) {
  useEffect(() => {
    if (!active) return
    function onOutside(e: MouseEvent | TouchEvent) {
      const target = e.target as Node
      if (refs.some((r) => r.current?.contains(target))) return
      onClose()
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active])
}

type SpeechRecognitionLike = {
  lang: string
  continuous: boolean
  interimResults: boolean
  onresult: ((e: any) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start: () => void
  stop: () => void
}

type MemberMeta = {
  username: string
  display_name: string | null
  email: string
  avatar_url: string | null
  status: string | null
  last_seen_at: string | null
  is_idle: boolean
  last_read_at: string
  added_by: string | null
  is_leader: boolean
  role: string | null
  name_style_font: string | null
  name_style_effect: 'solid' | 'gradient' | 'neon' | 'prism' | null
  name_style_color: string | null
}

type Props = {
  me: Profile | null
  conversation: Conversation | null
  onBack: () => void
  onConversationUpdate: (patch: Partial<Conversation>) => void
  blockedIds: Set<string>
  onOpenCommunity: (c: Community) => void
  onStartCall: (peer: CallPeer, kind: CallKind) => void
  inviteDemoSignal?: number
  sidebarCollapsed?: boolean
  onToggleSidebar?: () => void
}

export function MainPanel({ me, conversation, onBack, onConversationUpdate, blockedIds, onOpenCommunity, onStartCall, inviteDemoSignal, sidebarCollapsed, onToggleSidebar }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [members, setMembers] = useState<Record<string, MemberMeta>>({})
  const [draft, setDraft] = useState('')
  const [replyTarget, setReplyTarget] = useState<Message | null>(null)
  const [dragMsgId, setDragMsgId] = useState<string | null>(null)
  const [dragX, setDragX] = useState(0)
  const dragStartXRef = useRef<number | null>(null)
  const dragTriggeredRef = useRef(false)
  const [liveTyping, setLiveTyping] = useState<Record<string, string>>({})
  const [showEmoji, setShowEmoji] = useState(false)
  const [showWinks, setShowWinks] = useState(false)
  const [customWinks, setCustomWinks] = useState<CustomWink[]>([])
  const [winkManagerView, setWinkManagerView] = useState<'closed' | 'list' | 'form'>('closed')
  const [editingWinkId, setEditingWinkId] = useState<string | null>(null)
  const [newWinkLabel, setNewWinkLabel] = useState('')
  const [newWinkImage, setNewWinkImage] = useState<string | null>(null)
  const [newWinkSound, setNewWinkSound] = useState<string | null>(null)
  const [newWinkError, setNewWinkError] = useState<string | null>(null)
  const winkImageInputRef = useRef<HTMLInputElement>(null)
  const winkSoundInputRef = useRef<HTMLInputElement>(null)

  function reloadCustomWinks() {
    getCustomWinks().then(setCustomWinks).catch(() => setCustomWinks([]))
  }

  useEffect(() => {
    if (!showWinks) return
    reloadCustomWinks()
  }, [showWinks])

  function openWinkManager() {
    setShowWinks(false)
    reloadCustomWinks()
    setWinkManagerView('list')
  }

  function openWinkForm(existing?: CustomWink) {
    setEditingWinkId(existing?.id || null)
    setNewWinkLabel(existing?.label || '')
    setNewWinkImage(existing?.imageData || null)
    setNewWinkSound(existing?.soundData || null)
    setNewWinkError(null)
    setWinkManagerView('form')
  }

  const [winkPickerTab, setWinkPickerTab] = useState<'winks' | 'stickers' | 'gifs'>('winks')
  const [customStickers, setCustomStickers] = useState<CustomSticker[]>([])
  const [stickerManagerView, setStickerManagerView] = useState<'closed' | 'list' | 'form'>('closed')
  const [editingStickerId, setEditingStickerId] = useState<string | null>(null)
  const [newStickerLabel, setNewStickerLabel] = useState('')
  const [newStickerImage, setNewStickerImage] = useState<string | null>(null)
  const [newStickerError, setNewStickerError] = useState<string | null>(null)
  const [stickerSending, setStickerSending] = useState(false)
  const stickerImageInputRef = useRef<HTMLInputElement>(null)

  const [gifQuery, setGifQuery] = useState('')
  const [gifResults, setGifResults] = useState<GifResult[]>([])
  const [gifLoading, setGifLoading] = useState(false)
  const [gifError, setGifError] = useState<string | null>(null)

  function reloadCustomStickers() {
    getCustomStickers().then(setCustomStickers).catch(() => setCustomStickers([]))
  }

  useEffect(() => {
    if (!showWinks) return
    reloadCustomStickers()
  }, [showWinks])

  useEffect(() => {
    if (!showWinks || winkPickerTab !== 'gifs') return
    setGifLoading(true)
    setGifError(null)
    const timer = setTimeout(() => {
      searchGifs(gifQuery)
        .then(setGifResults)
        .catch((err) => setGifError(getErrorMessage(err)))
        .finally(() => setGifLoading(false))
    }, 350)
    return () => clearTimeout(timer)
  }, [showWinks, winkPickerTab, gifQuery])

  function openStickerManager() {
    setShowWinks(false)
    reloadCustomStickers()
    setStickerManagerView('list')
  }

  function openStickerForm(existing?: CustomSticker) {
    setEditingStickerId(existing?.id || null)
    setNewStickerLabel(existing?.label || '')
    setNewStickerImage(existing?.imageData || null)
    setNewStickerError(null)
    setStickerManagerView('form')
  }

  const MAX_STICKER_IMAGE_BYTES = 500 * 1024

  async function pickStickerImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_STICKER_IMAGE_BYTES) {
      setNewStickerError('Imagem muito grande, escolhe uma menor (até 500KB)')
      return
    }
    setNewStickerError(null)
    const raw = await fileToDataUrl(file)
    setNewStickerImage(await resizeStickerImage(raw, file.type))
  }

  async function saveStickerForm() {
    if (!newStickerImage) {
      setNewStickerError('Escolhe uma imagem ou gif')
      return
    }
    const sticker: CustomSticker = {
      id: editingStickerId || crypto.randomUUID(),
      label: newStickerLabel.trim() || 'Figurinha',
      imageData: newStickerImage,
    }
    await saveCustomSticker(sticker)
    setCustomStickers((prev) => {
      const exists = prev.some((s) => s.id === sticker.id)
      return exists ? prev.map((s) => (s.id === sticker.id ? sticker : s)) : [...prev, sticker]
    })
    setStickerManagerView('list')
  }

  async function removeCustomSticker(id: string) {
    await deleteCustomSticker(id)
    setCustomStickers((prev) => prev.filter((s) => s.id !== id))
    if (editingStickerId === id) setStickerManagerView('list')
  }

  async function sendSticker(sticker: CustomSticker) {
    if (!me || !conversation || stickerSending) return
    setShowWinks(false)
    setStickerSending(true)
    try {
      const url = await uploadStickerImage(sticker.imageData, me.id)
      const { error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversation.id, author_id: me.id, content: url, kind: 'sticker' })
      if (error) throw error
      const recipientIds = Object.keys(members).filter((id) => id !== me.id)
      sendPush(recipientIds, displayName(me), 'mandou uma figurinha', conversation.id)
    } catch (err) {
      console.error('sendSticker failed', err)
    } finally {
      setStickerSending(false)
    }
  }

  async function sendGif(gif: GifResult) {
    if (!me || !conversation) return
    try {
      const { error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversation.id, author_id: me.id, content: gif.url, kind: 'gif' })
      if (error) throw error
      setShowWinks(false)
      const recipientIds = Object.keys(members).filter((id) => id !== me.id)
      sendPush(recipientIds, displayName(me), 'mandou um gif', conversation.id)
    } catch (err) {
      console.error('sendGif failed', err)
      setGifError('Não consegui mandar esse gif. Tenta outro.')
    }
  }

  const [recording, setRecording] = useState(false)
  const [replayFor, setReplayFor] = useState<Message | null>(null)
  const [replayEvents, setReplayEvents] = useState<ReplayEvent[] | null>(null)
  const [showChatConfig, setShowChatConfig] = useState(false)
  const [configView, setConfigView] = useState<'root' | 'invite' | 'members' | 'bots'>('root')
  const prevInviteDemoSignalRef = useRef(inviteDemoSignal)

  useEffect(() => {
    if (!showChatConfig) return
    try {
      localStorage.setItem('ferus-visited-chat-config', '1')
    } catch {
      // ignore
    }
  }, [showChatConfig])

  useEffect(() => {
    if (inviteDemoSignal === undefined || inviteDemoSignal === prevInviteDemoSignalRef.current) return
    prevInviteDemoSignalRef.current = inviteDemoSignal
    if (!conversation) return
    setShowChatConfig(true)
    setConfigView('invite')
    loadInviteFriends()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inviteDemoSignal, conversation])
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editImageUrl, setEditImageUrl] = useState('')
  const [editingGroupName, setEditingGroupName] = useState(false)
  const [editInvitePermission, setEditInvitePermission] = useState<'all' | 'owner'>('all')
  const [groupImageUploading, setGroupImageUploading] = useState(false)
  const [groupImageFailed, setGroupImageFailed] = useState(false)
  const [confirmDeleteGroup, setConfirmDeleteGroup] = useState(false)
  const groupImageInputRef = useRef<HTMLInputElement>(null)
  const [installedBots, setInstalledBots] = useState<(Bot & { permission: 'all' | 'admin' })[]>([])
  const [catalogBots, setCatalogBots] = useState<Bot[]>([])
  const [botsBusy, setBotsBusy] = useState(false)
  const [botsError, setBotsError] = useState<string | null>(null)
  const [sonorSession, setSonorSession] = useState<SonorSession | null>(null)
  const [sonorListening, setSonorListening] = useState(true)
  const [sonorVolume, setSonorVolume] = useState(() => {
    try {
      const saved = parseFloat(localStorage.getItem('ferus-sonor-volume') || '')
      return Number.isFinite(saved) ? Math.min(1, Math.max(0, saved)) : 1
    } catch {
      return 1
    }
  })
  const [sonorAudioError, setSonorAudioError] = useState<string | null>(null)
  const [sonorNowPlaying, setSonorNowPlaying] = useState<string | null>(null)
  const sonorAudioRef = useRef<HTMLAudioElement>(null)
  const sonorHlsRef = useRef<any>(null)
  const sonorRetryCountRef = useRef(0)
  const sonorReconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const [sonorReconnecting, setSonorReconnecting] = useState(false)
  const sonorPrevUrlRef = useRef<string | null | undefined>(undefined)
  const [sonorCardOpen, setSonorCardOpen] = useState(false)
  const [sonorSavingSong, setSonorSavingSong] = useState(false)
  const [sonorSongSaved, setSonorSongSaved] = useState(false)

  const botsById = useMemo(() => {
    const map: Record<string, { username: string; display_name: string | null }> = {}
    for (const b of installedBots) map[b.id] = { username: b.slug, display_name: b.name }
    return map
  }, [installedBots])

  function authorLabel(authorId: string): string | null {
    if (members[authorId]) return displayName(members[authorId])
    if (botsById[authorId]) return botsById[authorId].display_name || botsById[authorId].username
    return null
  }
  const [inviteFriends, setInviteFriends] = useState<{ id: string; username: string; display_name: string | null; avatar_url: string | null; email: string }[]>([])
  const [inviteLinkBusy, setInviteLinkBusy] = useState(false)
  const [inviteLinkCopied, setInviteLinkCopied] = useState(false)
  const [joinRequests, setJoinRequests] = useState<{ user_id: string; username: string; display_name: string | null; avatar_url: string | null }[]>([])
  const [addError, setAddError] = useState<string | null>(null)
  const [addBusy, setAddBusy] = useState(false)
  const [expandedImage, setExpandedImage] = useState<string | null>(null)
  const [profilePopupId, setProfilePopupId] = useState<string | null>(null)
  const [atBottom, setAtBottom] = useState(true)
  const [nudgeFrom, setNudgeFrom] = useState<string | null>(null)
  const [editedIds, setEditedIds] = useState<Set<string>>(new Set())
  const [ephemeralByMessage, setEphemeralByMessage] = useState<Record<string, EphemeralMediaRow>>({})
  const [pendingEphemeralFile, setPendingEphemeralFile] = useState<File | null>(null)
  const [pendingViewOnce, setPendingViewOnce] = useState(false)
  const [ephemeralSending, setEphemeralSending] = useState(false)
  const [ephemeralViewer, setEphemeralViewer] = useState<(EphemeralOpenResult & { id: string }) | null>(null)
  const [inlineMedia, setInlineMedia] = useState<Record<string, EphemeralOpenResult & { id: string }>>({})
  const [openTranscripts, setOpenTranscripts] = useState<Set<string>>(new Set())
  const [showAttachMenu, setShowAttachMenu] = useState(false)
  const [showContactPicker, setShowContactPicker] = useState(false)
  const [shareableContacts, setShareableContacts] = useState<{ id: string; username: string; display_name: string | null; avatar_url: string | null; email: string }[]>([])
  const [pendingFilePreviewUrl, setPendingFilePreviewUrl] = useState<string | null>(null)
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const requestedInlineRef = useRef<Set<string>>(new Set())
  const attachMenuRef = useRef<HTMLDivElement>(null)
  const composerTextareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    return () => { composerTextareaRef.current?.blur() }
  }, [])
  const attachBtnRef = useRef<HTMLButtonElement>(null)
  const emojiMenuRef = useRef<HTMLDivElement>(null)
  const emojiBtnRef = useRef<HTMLButtonElement>(null)
  const winkMenuRef = useRef<HTMLDivElement>(null)
  const winkBtnRef = useRef<HTMLButtonElement>(null)

  useOutsideClose(showAttachMenu, [attachMenuRef, attachBtnRef], () => setShowAttachMenu(false))
  useOutsideClose(showEmoji, [emojiMenuRef, emojiBtnRef], () => setShowEmoji(false))
  useOutsideClose(showWinks, [winkMenuRef, winkBtnRef], () => setShowWinks(false))

  useEffect(() => {
    if (!pendingEphemeralFile) {
      setPendingFilePreviewUrl(null)
      return
    }
    const url = URL.createObjectURL(pendingEphemeralFile)
    setPendingFilePreviewUrl(url)
    return () => URL.revokeObjectURL(url)
  }, [pendingEphemeralFile])

  const channelRef = useRef<RealtimeChannel | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const docInputRef = useRef<HTMLInputElement>(null)
  const mediaInputRef = useRef<HTMLInputElement>(null)
  const cameraInputRef = useRef<HTMLInputElement>(null)
  const audioInputRef = useRef<HTMLInputElement>(null)
  const replayBuffer = useRef<ReplayEvent[]>([])
  const messagesRef = useRef<Message[]>([])
  useEffect(() => {
    messagesRef.current = messages
  }, [messages])

  useEffect(() => {
    setGroupImageFailed(false)
  }, [conversation?.image_url])

  function hasHiddenEdit(events: ReplayEvent[], finalContent: string): boolean {
    // so conta como "edição escondida" quando o texto chegou a ficar
    // bem maior do que o final e depois encolheu — pequenas correções de
    // digitação (typo de 1-2 letras, ou o interim do reconhecimento de voz
    // se revisando) não contam, senão a bolinha vermelha aparece direto
    let maxLen = 0
    for (const e of events) {
      const len = (e.text ?? '').length
      if (len > maxLen) maxLen = len
    }
    return maxLen - finalContent.length >= 6
  }

  useEffect(() => {
    setMessages(conversation ? readCache<Message[]>(`flux-messages:${conversation.id}`) || [] : [])
    setMembers(conversation ? readCache<Record<string, MemberMeta>>(`flux-members:${conversation.id}`) || {} : {})
    setLiveTyping({})
    setDraft('')
    setReplyTarget(null)
    setAtBottom(true)
    setNudgeFrom(null)
    setEditedIds(new Set())
    setEphemeralByMessage({})
    setPendingEphemeralFile(null)
    setEphemeralViewer(null)
    setInlineMedia({})
    setOpenTranscripts(new Set())
    requestedInlineRef.current = new Set()
    setShowChatConfig(false)
    setConfigView('root')
    setEditingGroupName(false)
    setConfirmDeleteGroup(false)
    if (!conversation || !me) return

    let cancelled = false

    async function markRead() {
      if (!conversation || !me) return
      await supabase.rpc('mark_conversation_read', { p_conversation_id: conversation.id })
    }

    async function loadMembers() {
      if (!conversation) return
      const { data: rows } = await supabase
        .from('conversation_members')
        .select('user_id, last_read_at, added_by, is_leader, role, profile:profiles!conversation_members_user_id_fkey(id, username, display_name, email, avatar_url, status, last_seen_at, is_idle, name_style_font, name_style_effect, name_style_color)')
        .eq('conversation_id', conversation.id)

      if (!cancelled && rows) {
        const map: Record<string, MemberMeta> = {}
        for (const row of rows) {
          const p = row.profile as unknown as Profile
          if (p) {
            map[p.id] = {
              username: p.username,
              display_name: p.display_name ?? null,
              email: p.email,
              avatar_url: p.avatar_url ?? null,
              status: p.status ?? null,
              last_seen_at: p.last_seen_at ?? null,
              is_idle: p.is_idle ?? false,
              last_read_at: row.last_read_at as string,
              added_by: row.added_by as string | null,
              is_leader: row.is_leader as boolean,
              role: row.role as string | null,
              name_style_font: p.name_style_font ?? null,
              name_style_effect: p.name_style_effect ?? null,
              name_style_color: p.name_style_color ?? null,
            }
          }
        }
        setMembers(map)
        writeCache(`flux-members:${conversation.id}`, map)
      }
    }

    async function load() {
      if (!conversation) return

      const [, { data: recentDesc }] = await Promise.all([
        loadMembers(),
        supabase
          .from('messages')
          .select('*, message_replays(events), ephemeral_media(*, ephemeral_media_views(*))')
          .eq('conversation_id', conversation.id)
          .order('created_at', { ascending: false })
          .limit(200),
      ])
      const msgs = recentDesc ? [...recentDesc].reverse() : null

      if (!cancelled && msgs) {
        setMessages(msgs as Message[])
        writeCache(`flux-messages:${conversation.id}`, msgs.slice(-100))
        const edited = new Set<string>()
        const ephemeralMap: Record<string, EphemeralMediaRow> = {}
        for (const m of msgs as (Message & {
          message_replays: { events: ReplayEvent[] }[] | { events: ReplayEvent[] } | null
          ephemeral_media: EphemeralMediaRow[] | EphemeralMediaRow | null
        })[]) {
          const raw = m.message_replays
          const events = Array.isArray(raw) ? raw[0]?.events : raw?.events
          if (events && hasHiddenEdit(events, m.content)) edited.add(m.id)
          const eph = Array.isArray(m.ephemeral_media) ? m.ephemeral_media[0] : m.ephemeral_media
          if (eph) ephemeralMap[m.id] = eph
        }
        setEditedIds(edited)
        setEphemeralByMessage(ephemeralMap)
      }
      await markRead()
    }

    load()

    const channel = supabase
      .channel(`conversation:${conversation.id}`)
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
      .on('broadcast', { event: 'nudge' }, ({ payload }) => {
        const { userId } = payload as { userId: string }
        if (userId === me.id) return
        setNudgeFrom(userId)
        setTimeout(() => setNudgeFrom((prev) => (prev === userId ? null : prev)), 3000)
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const msg = payload.new as Message
          setMessages((prev) => {
            if (prev.some((m) => m.id === msg.id)) return prev
            const next = [...prev, msg]
            writeCache(`flux-messages:${conversation.id}`, next.slice(-100))
            return next
          })
          setLiveTyping((prev) => {
            const next = { ...prev }
            delete next[msg.author_id]
            return next
          })
          markRead()
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'ephemeral_media', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = payload.new as EphemeralMediaRow
          setEphemeralByMessage((prev) => ({ ...prev, [row.message_id]: row }))
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'message_replays' },
        (payload) => {
          const row = payload.new as { message_id: string; events: ReplayEvent[] }
          const msg = messagesRef.current.find((m) => m.id === row.message_id)
          if (msg && hasHiddenEdit(row.events, msg.content)) {
            setEditedIds((prev) => (prev.has(msg.id) ? prev : new Set(prev).add(msg.id)))
          }
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversation_members', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          const row = payload.new as { user_id: string; last_read_at: string }
          setMembers((prev) => {
            const meta = prev[row.user_id]
            if (!meta) return prev
            return { ...prev, [row.user_id]: { ...meta, last_read_at: row.last_read_at } }
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'profiles' },
        (payload) => {
          const p = payload.new as Profile
          setMembers((prev) => {
            if (!prev[p.id]) return prev
            return {
              ...prev,
              [p.id]: {
                ...prev[p.id],
                username: p.username,
                display_name: p.display_name ?? null,
                email: p.email,
                avatar_url: p.avatar_url ?? null,
                status: p.status ?? null,
                last_seen_at: p.last_seen_at ?? null,
                is_idle: p.is_idle ?? false,
              },
            }
          })
        },
      )
      .subscribe()

    channelRef.current = channel

    return () => {
      cancelled = true
      supabase.removeChannel(channel)
    }
  }, [conversation?.id, me?.id])

  useEffect(() => {
    setInstalledBots([])
    setSonorSession(null)
    setSonorListening(true)
    if (!conversation || !me) return

    let cancelled = false

    async function loadBots() {
      const { data: rows } = await supabase
        .from('group_bots')
        .select('permission, bot:bots(*)')
        .eq('conversation_id', conversation!.id)
      if (!cancelled && rows) {
        setInstalledBots(
          rows
            .filter((r: any) => r.bot)
            .map((r: any) => ({ ...(r.bot as Bot), permission: r.permission as 'all' | 'admin' })),
        )
      }
    }

    async function loadSonor() {
      const { data: session } = await supabase
        .from('sonor_sessions')
        .select('*')
        .eq('conversation_id', conversation!.id)
        .maybeSingle()
      if (!cancelled) setSonorSession((session as SonorSession) || null)

      const { data: listenerRow } = await supabase
        .from('sonor_listeners')
        .select('listening')
        .eq('conversation_id', conversation!.id)
        .eq('user_id', me!.id)
        .maybeSingle()
      if (!cancelled && listenerRow) setSonorListening(!!listenerRow.listening)
    }

    loadBots()
    loadSonor()

    const botsChannel = supabase
      .channel(`bots:${conversation.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_bots', filter: `conversation_id=eq.${conversation.id}` },
        () => loadBots(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sonor_sessions', filter: `conversation_id=eq.${conversation.id}` },
        (payload) => {
          if (payload.eventType === 'DELETE') setSonorSession(null)
          else setSonorSession(payload.new as SonorSession)
        },
      )
      .subscribe()

    return () => {
      cancelled = true
      supabase.removeChannel(botsChannel)
    }
  }, [conversation?.id, me?.id])

  useEffect(() => {
    const audio = sonorAudioRef.current
    if (!audio) return
    if (sonorHlsRef.current) {
      sonorHlsRef.current.destroy()
      sonorHlsRef.current = null
    }
    if (sonorReconnectTimeoutRef.current) {
      clearTimeout(sonorReconnectTimeoutRef.current)
      sonorReconnectTimeoutRef.current = null
    }
    setSonorReconnecting(false)
    if (!sonorSession) {
      audio.pause()
      audio.removeAttribute('src')
      sonorPrevUrlRef.current = null
      return
    }
    setSonorAudioError(null)
    // uma rádio nova de verdade (nao o carregamento inicial ao abrir o chat) reseta a
    // preferencia de escutar de todo mundo no banco (sonor_set_session) - o cliente
    // precisa acompanhar isso, senao quem tinha mutado a radio ANTERIOR fica mudo pra sempre
    if (sonorPrevUrlRef.current !== undefined && sonorPrevUrlRef.current !== sonorSession.stream_url) {
      setSonorListening(true)
    }
    sonorPrevUrlRef.current = sonorSession.stream_url
    sonorRetryCountRef.current = 0
    if (sonorSession.is_hls) {
      import('hls.js').then(({ default: Hls }) => {
        if (Hls.isSupported()) {
          const hls = new Hls()
          hls.loadSource(sonorSession.stream_url)
          hls.attachMedia(audio)
          hls.on(Hls.Events.ERROR, (_evt: unknown, data: { fatal?: boolean }) => {
            if (data.fatal) scheduleSonorReconnect('não consegui tocar essa rádio (formato HLS)')
          })
          hls.on(Hls.Events.FRAG_LOADED, () => {
            sonorRetryCountRef.current = 0
            setSonorReconnecting(false)
          })
          sonorHlsRef.current = hls
        } else if (audio.canPlayType('application/vnd.apple.mpegurl')) {
          audio.src = sonorSession.stream_url
        } else {
          setSonorAudioError('essa rádio não é suportada nesse navegador ainda')
        }
      })
    } else {
      audio.src = sonorSession.stream_url
    }
  }, [sonorSession?.stream_url, sonorSession?.is_hls])

  useEffect(() => {
    const audio = sonorAudioRef.current
    if (!audio) return
    if (sonorSession && sonorListening) audio.play().catch(() => {})
    else audio.pause()
  }, [sonorListening, sonorSession])

  useEffect(() => {
    const audio = sonorAudioRef.current
    if (audio) audio.volume = sonorVolume
  }, [sonorVolume, sonorSession?.stream_url])

  function handleSonorVolumeChange(value: number) {
    setSonorVolume(value)
    try {
      localStorage.setItem('ferus-sonor-volume', String(value))
    } catch {
      // ignore
    }
  }

  useEffect(() => {
    setSonorNowPlaying(null)
    if (!sonorSession) return
    let cancelled = false

    async function poll() {
      const title = await fetchNowPlaying(sonorSession!.stream_url)
      if (!cancelled) setSonorNowPlaying(title)
    }

    poll()
    const interval = setInterval(poll, 25000)
    return () => {
      cancelled = true
      clearInterval(interval)
    }
  }, [sonorSession?.stream_url])

  useEffect(() => {
    setSonorSongSaved(false)
  }, [sonorNowPlaying, sonorSession?.stream_url])

  useEffect(() => {
    if (atBottom) bottomRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' })
  }, [messages, liveTyping, atBottom])

  function handleMessagesScroll(e: React.UIEvent<HTMLElement>) {
    const el = e.currentTarget
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
    setAtBottom(distanceFromBottom < 80)
  }

  function recordReplayEvent(text: string) {
    const now = Date.now()
    replayBuffer.current.push({ t: now, text })
    replayBuffer.current = replayBuffer.current.filter((e) => now - e.t <= REPLAY_WINDOW_MS)
  }

  function broadcastTyping(text: string) {
    if (!me) return
    channelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { userId: me.id, text } })
  }

  async function blockUser(userId: string) {
    if (!me) return
    await supabase.from('blocks').insert({ blocker_id: me.id, blocked_id: userId })
    setProfilePopupId(null)
    if (conversation?.type === 'dm' && userId === otherMemberEntry?.[0]) onBack()
  }

  function sendNudge() {
    if (!me || !conversation) return
    channelRef.current?.send({ type: 'broadcast', event: 'nudge', payload: { userId: me.id } })
    triggerNudgeShake()
    playNudgeSound()

    Object.keys(members)
      .filter((id) => id !== me.id)
      .forEach((id) => {
        const personalChannel = supabase.channel(`nudge:${id}`)
        personalChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            personalChannel.send({
              type: 'broadcast',
              event: 'nudge',
              payload: { userId: me.id, conversationId: conversation.id },
            })
            setTimeout(() => supabase.removeChannel(personalChannel), 1000)
          }
        })
      })
    sendPush(Object.keys(members).filter((id) => id !== me.id), displayName(me), 'chamou sua atenção', conversation.id)
    postSystemMessage(`${displayName(me)} chamou atenção`)
  }

  function sendWink(winkId: string) {
    if (!me || !conversation) return
    setShowWinks(false)
    playWinkEffect(winkId)

    Object.keys(members)
      .filter((id) => id !== me.id)
      .forEach((id) => {
        const personalChannel = supabase.channel(`nudge:${id}`)
        personalChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            personalChannel.send({
              type: 'broadcast',
              event: 'wink',
              payload: { userId: me.id, conversationId: conversation.id, winkId },
            })
            setTimeout(() => supabase.removeChannel(personalChannel), 1000)
          }
        })
      })
    sendPush(Object.keys(members).filter((id) => id !== me.id), displayName(me), 'mandou um wink', conversation.id)
    const winkLabel = WINKS.find((w) => w.id === winkId)?.label || 'wink'
    postSystemMessage(`${displayName(me)} mandou um wink (${winkLabel})`)
  }

  async function openContactPicker() {
    if (!me) return
    setShowAttachMenu(false)
    const { data, error } = await supabase
      .from('friend_requests')
      .select(
        'from_id, to_id, from_profile:profiles!friend_requests_from_id_fkey(id, username, display_name, avatar_url, email), to_profile:profiles!friend_requests_to_id_fkey(id, username, display_name, avatar_url, email)',
      )
      .eq('status', 'accepted')
      .or(`from_id.eq.${me.id},to_id.eq.${me.id}`)
    if (error) {
      console.error('openContactPicker failed', error)
      setShareableContacts([])
    } else {
      setShareableContacts(
        (data || [])
          .map((row: any) => (row.from_id === me.id ? row.to_profile : row.from_profile))
          .filter(Boolean),
      )
    }
    setShowContactPicker(true)
  }

  async function sendContactCard(target: { id: string; username: string; display_name: string | null; avatar_url: string | null; email: string }) {
    if (!me || !conversation) return
    setShowContactPicker(false)
    try {
      const content = JSON.stringify({
        name: target.display_name || target.username,
        email: target.email,
        avatarUrl: target.avatar_url ?? null,
      })
      const { error } = await supabase
        .from('messages')
        .insert({ conversation_id: conversation.id, author_id: me.id, content, kind: 'contact' })
      if (error) throw error
      const recipientIds = Object.keys(members).filter((id) => id !== me.id)
      sendPush(recipientIds, displayName(me), 'mandou um contato', conversation.id)
    } catch (err) {
      console.error('sendContactCard failed', err)
    }
  }

  const MAX_WINK_IMAGE_BYTES = 500 * 1024
  const MAX_WINK_SOUND_BYTES = 150 * 1024

  async function pickWinkImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_WINK_IMAGE_BYTES) {
      setNewWinkError('Imagem muito grande, escolhe uma menor (até 500KB, tipo figurinha)')
      return
    }
    setNewWinkError(null)
    setNewWinkImage(await fileToDataUrl(file))
  }

  async function pickWinkSound(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    if (file.size > MAX_WINK_SOUND_BYTES) {
      setNewWinkError('Som muito grande, escolhe um menor (até 150KB, tipo curtinho)')
      return
    }
    setNewWinkError(null)
    setNewWinkSound(await fileToDataUrl(file))
  }

  async function saveWinkForm() {
    if (!newWinkImage) {
      setNewWinkError('Escolhe uma imagem ou gif')
      return
    }
    const wink: CustomWink = {
      id: editingWinkId || crypto.randomUUID(),
      label: newWinkLabel.trim() || 'Wink',
      imageData: newWinkImage,
      soundData: newWinkSound,
      fromUser: null,
    }
    await saveCustomWink(wink)
    setCustomWinks((prev) => {
      const exists = prev.some((w) => w.id === wink.id)
      return exists ? prev.map((w) => (w.id === wink.id ? wink : w)) : [...prev, wink]
    })
    setWinkManagerView('list')
  }

  async function removeCustomWink(id: string) {
    await deleteCustomWink(id)
    setCustomWinks((prev) => prev.filter((w) => w.id !== id))
    if (editingWinkId === id) setWinkManagerView('list')
  }

  function sendCustomWink(wink: CustomWink) {
    if (!me || !conversation) return
    setShowWinks(false)
    playCustomWinkEffect(wink.imageData, wink.soundData)

    Object.keys(members)
      .filter((id) => id !== me.id)
      .forEach((id) => {
        const personalChannel = supabase.channel(`nudge:${id}`)
        personalChannel.subscribe((status) => {
          if (status === 'SUBSCRIBED') {
            personalChannel.send({
              type: 'broadcast',
              event: 'customWink',
              payload: {
                userId: me.id,
                conversationId: conversation.id,
                label: wink.label,
                imageData: wink.imageData,
                soundData: wink.soundData,
              },
            })
            setTimeout(() => supabase.removeChannel(personalChannel), 1000)
          }
        })
      })
    sendPush(Object.keys(members).filter((id) => id !== me.id), displayName(me), `mandou um wink (${wink.label})`, conversation.id)
    postSystemMessage(`${displayName(me)} mandou um wink (${wink.label})`)
  }


  async function generateGroupInviteLink() {
    if (!conversation) return
    setInviteLinkBusy(true)
    try {
      const code = generateInviteCode()
      const { error } = await supabase.from('conversations').update({ invite_code: code }).eq('id', conversation.id)
      if (error) throw error
      onConversationUpdate({ invite_code: code })
    } catch (err) {
      console.error('generateGroupInviteLink failed', err)
    } finally {
      setInviteLinkBusy(false)
    }
  }

  async function copyInviteLink(code: string) {
    try {
      await navigator.clipboard.writeText(inviteUrl(code))
      setInviteLinkCopied(true)
      setTimeout(() => setInviteLinkCopied(false), 2000)
    } catch (err) {
      console.error('copyInviteLink failed', err)
    }
  }

  async function toggleInviteApproval() {
    if (!conversation) return
    const next = !conversation.invite_requires_approval
    const { error } = await supabase.from('conversations').update({ invite_requires_approval: next }).eq('id', conversation.id)
    if (!error) onConversationUpdate({ invite_requires_approval: next })
  }

  async function toggleGroupPublic() {
    if (!conversation) return
    const next = !conversation.is_public
    const { error } = await supabase.from('conversations').update({ is_public: next }).eq('id', conversation.id)
    if (!error) onConversationUpdate({ is_public: next })
  }

  async function loadJoinRequests() {
    if (!conversation) return
    const { data } = await supabase
      .from('conversation_join_requests')
      .select('user_id, profile:profiles!conversation_join_requests_user_id_fkey(username, display_name, avatar_url)')
      .eq('conversation_id', conversation.id)
    setJoinRequests(
      (data || []).map((r) => {
        const p = r.profile as unknown as { username: string; display_name: string | null; avatar_url: string | null }
        return { user_id: r.user_id as string, username: p?.username, display_name: p?.display_name ?? null, avatar_url: p?.avatar_url ?? null }
      }),
    )
  }

  async function acceptJoinRequest(userId: string) {
    if (!conversation) return
    const { error } = await supabase.from('conversation_members').insert({ conversation_id: conversation.id, user_id: userId })
    if (!error) {
      await supabase.from('conversation_join_requests').delete().eq('conversation_id', conversation.id).eq('user_id', userId)
      setJoinRequests((prev) => prev.filter((r) => r.user_id !== userId))
    }
  }

  async function rejectJoinRequest(userId: string) {
    if (!conversation) return
    await supabase.from('conversation_join_requests').delete().eq('conversation_id', conversation.id).eq('user_id', userId)
    setJoinRequests((prev) => prev.filter((r) => r.user_id !== userId))
  }

  async function postSystemMessage(content: string) {
    if (!me || !conversation) return
    await supabase.from('messages').insert({ conversation_id: conversation.id, author_id: me.id, content, kind: 'system' })
  }

  function findInstalledBot(slug: string) {
    return installedBots.find((b) => b.slug === slug) || null
  }

  async function postBotReply(botId: string, content: string, kind: string = 'text') {
    if (!conversation) return
    await supabase.rpc('post_bot_message', { p_conversation_id: conversation.id, p_bot_id: botId, p_content: content, p_kind: kind })
  }

  async function loadCatalogBots() {
    setBotsError(null)
    const { data, error } = await supabase.from('bots').select('*').order('name')
    if (error) setBotsError(getErrorMessage(error))
    else setCatalogBots((data || []) as Bot[])
  }

  async function toggleInstallBot(bot: Bot, isInstalled: boolean) {
    if (!conversation || !me) return
    setBotsBusy(true)
    setBotsError(null)
    try {
      if (isInstalled) {
        const { error } = await supabase.from('group_bots').delete().eq('conversation_id', conversation.id).eq('bot_id', bot.id)
        if (error) throw error
        setInstalledBots((prev) => prev.filter((b) => b.id !== bot.id))
      } else {
        const { error } = await supabase
          .from('group_bots')
          .insert({ conversation_id: conversation.id, bot_id: bot.id, installed_by: me.id, permission: 'all' })
        if (error) throw error
        setInstalledBots((prev) => [...prev, { ...bot, permission: 'all' }])
      }
    } catch (err) {
      setBotsError(getErrorMessage(err))
    } finally {
      setBotsBusy(false)
    }
  }

  async function setBotPermission(botId: string, permission: 'all' | 'admin') {
    if (!conversation) return
    setBotsBusy(true)
    setBotsError(null)
    try {
      const { error } = await supabase
        .from('group_bots')
        .update({ permission })
        .eq('conversation_id', conversation.id)
        .eq('bot_id', botId)
      if (error) throw error
      setInstalledBots((prev) => prev.map((b) => (b.id === botId ? { ...b, permission } : b)))
    } catch (err) {
      setBotsError(getErrorMessage(err))
    } finally {
      setBotsBusy(false)
    }
  }

  async function playSonorStation(botId: string, name: string, url: string, isHls: boolean) {
    if (!conversation) return
    await supabase.rpc('sonor_set_session', {
      p_conversation_id: conversation.id, p_title: name, p_stream_url: url, p_is_hls: isHls,
    })
    await postBotReply(botId, `tocando: ${name}`)
  }

  async function saveSonorSong() {
    if (!me || !sonorNowPlaying) return
    setSonorSavingSong(true)
    const { error } = await supabase.from('sonor_song_favorites').insert({
      user_id: me.id, title: sonorNowPlaying, youtube_url: youtubeSearchUrl(sonorNowPlaying),
    })
    setSonorSavingSong(false)
    if (!error) {
      setSonorSongSaved(true)
      const bot = findInstalledBot('sonor')
      if (bot) await postBotReply(bot.id, `salvei "${sonorNowPlaying}" nas suas músicas favoritas`)
    }
  }

  async function chooseSonorStation(option: { name: string; url: string; country: string; is_hls: boolean }) {
    const bot = findInstalledBot('sonor')
    if (!bot) return
    await playSonorStation(bot.id, option.name, option.url, option.is_hls)
  }

  async function handleSonorCommand(rawArgs: string) {
    if (!conversation) return
    const bot = findInstalledBot('sonor')
    if (!bot) return
    const [sub, ...restParts] = rawArgs.trim().split(/\s+/)
    const subLower = (sub || '').toLowerCase()
    const query = restParts.join(' ').replace(/^"|"$/g, '').trim().toLowerCase()

    if (subLower === 'parar') {
      await supabase.rpc('sonor_stop', { p_conversation_id: conversation.id })
      await postBotReply(bot.id, 'parei de tocar')
      return
    }

    if (subLower === 'musica') {
      await postBotReply(bot.id, 'ainda não consigo tocar música do YouTube — em breve')
      return
    }

    if (subLower === 'salvar') {
      if (!sonorSession || !me) {
        await postBotReply(bot.id, 'não tem nada tocando agora pra salvar')
        return
      }
      const { error } = await supabase.from('sonor_favorites').insert({
        user_id: me.id, name: sonorSession.title, stream_url: sonorSession.stream_url, is_hls: sonorSession.is_hls,
      })
      await postBotReply(bot.id, error ? 'não consegui salvar essa rádio' : `salvei "${sonorSession.title}" nas suas favoritas`)
      return
    }

    if (subLower === 'favoritas' || subLower === 'salvas') {
      const { data: favRows } = await supabase
        .from('sonor_favorites')
        .select('name, stream_url, is_hls')
        .eq('user_id', me?.id)
        .order('created_at', { ascending: false })
        .limit(5)
      if (!favRows || favRows.length === 0) {
        await postBotReply(bot.id, 'você ainda não salvou nenhuma rádio — usa /sonor salvar enquanto uma tá tocando')
        return
      }
      if (favRows.length === 1) {
        await playSonorStation(bot.id, favRows[0].name, favRows[0].stream_url, favRows[0].is_hls)
        return
      }
      const options = favRows.map((f) => ({ name: f.name, url: f.stream_url, country: '', is_hls: f.is_hls }))
      await postBotReply(bot.id, JSON.stringify({ query: '', title: 'suas rádios salvas, qual toca?', options }), 'sonor_picker')
      return
    }

    if (subLower === 'radio') {
      if (!query || query === 'aleatoria') {
        const random = await fetchRandomStation()
        if (!random) {
          await postBotReply(bot.id, 'não consegui achar nenhuma rádio agora')
          return
        }
        await playSonorStation(bot.id, random.name, random.url, isHlsStream(random.url))
        return
      }

      const { data: favRows } = await supabase
        .from('sonor_favorites')
        .select('name, stream_url, is_hls')
        .eq('user_id', me?.id)
        .ilike('name', `%${query}%`)
        .limit(1)
      if (favRows && favRows[0]) {
        await playSonorStation(bot.id, favRows[0].name, favRows[0].stream_url, favRows[0].is_hls)
        return
      }

      const found = await searchPublicStations(query)
      if (found.length === 0) {
        await postBotReply(bot.id, `não achei "${query}"`)
        return
      }
      if (found.length === 1) {
        await playSonorStation(bot.id, found[0].name, found[0].url, isHlsStream(found[0].url))
        return
      }

      const options = found.slice(0, 5).map((s) => ({ name: s.name, url: s.url, country: s.country, is_hls: isHlsStream(s.url) }))
      await postBotReply(bot.id, JSON.stringify({ query, options }), 'sonor_picker')
      return
    }

    await postBotReply(bot.id, 'comandos: /sonor radio "nome", /sonor radio aleatoria, /sonor salvar, /sonor favoritas, /sonor parar')
  }

  async function handleBotCommand(text: string) {
    if (!conversation || !me) return
    const parsed = parseCommand(text)
    if (!parsed) return

    try {
      if (parsed.command === '/dado') {
        const bot = findInstalledBot('zelador')
        if (!bot) return
        const sides = parseInt(parsed.args[0], 10) || 6
        await postBotReply(bot.id, `🎲 rolou ${rollDice(sides)} (d${sides})`)
      } else if (parsed.command === '/sorteio') {
        const bot = findInstalledBot('zelador')
        if (!bot) return
        const candidates = Object.entries(members).filter(([id]) => !botsById[id])
        const picked = pickRandom(candidates)
        if (!picked) return
        await postBotReply(bot.id, `🎉 sorteado: ${displayName(picked[1])}`)
      } else if (parsed.command === '/kick') {
        const bot = findInstalledBot('zelador')
        if (!bot) return
        const targetHandle = parsed.args[0]?.replace(/^@/, '')
        const targetEntry = Object.entries(members).find(([, m]) => m.username === targetHandle)
        if (!targetEntry) {
          await postBotReply(bot.id, `não achei @${targetHandle} no grupo`)
          return
        }
        const [targetId, targetMeta] = targetEntry
        if (!canKick(targetMeta)) {
          await postBotReply(bot.id, `você não pode remover ${displayName(targetMeta)}`)
          return
        }
        await removeMember(targetId)
        await postBotReply(bot.id, `${displayName(targetMeta)} foi removido por ${displayName(me)}`)
      } else if (parsed.command === '/sonor') {
        await handleSonorCommand(parsed.rest)
      }
    } catch (err) {
      console.error('bot command failed', err)
    }
  }

  async function toggleSonorListening() {
    if (!conversation || !me) return
    const next = !sonorListening
    setSonorListening(next)
    await supabase.from('sonor_listeners').upsert({ conversation_id: conversation.id, user_id: me.id, listening: next })
  }

  const SONOR_MAX_RETRIES = 6

  function scheduleSonorReconnect(finalErrorMessage: string) {
    if (sonorReconnectTimeoutRef.current) return
    const attempt = sonorRetryCountRef.current
    if (attempt >= SONOR_MAX_RETRIES) {
      setSonorReconnecting(false)
      setSonorAudioError(finalErrorMessage)
      return
    }
    sonorRetryCountRef.current = attempt + 1
    setSonorReconnecting(true)
    const delay = Math.min(2000 * (attempt + 1), 15000)
    sonorReconnectTimeoutRef.current = setTimeout(() => {
      sonorReconnectTimeoutRef.current = null
      const audio = sonorAudioRef.current
      const session = sonorSession
      if (!audio || !session) return
      if (session.is_hls && sonorHlsRef.current) {
        sonorHlsRef.current.loadSource(session.stream_url)
        sonorHlsRef.current.attachMedia(audio)
      } else {
        audio.src = session.stream_url
        if (sonorListening) audio.play().catch(() => {})
      }
    }, delay)
  }

  function handleSonorAudioError() {
    if (sonorSession?.is_hls) return
    scheduleSonorReconnect('não consegui tocar essa rádio — tenta de novo ou escolhe outra')
  }

  function handleSonorAudioPlaying() {
    sonorRetryCountRef.current = 0
    setSonorReconnecting(false)
  }

  async function loadInviteFriends() {
    if (!me) return
    const { data, error } = await supabase
      .from('friend_requests')
      .select(
        'from_id, to_id, from_profile:profiles!friend_requests_from_id_fkey(id, username, display_name, avatar_url, email), to_profile:profiles!friend_requests_to_id_fkey(id, username, display_name, avatar_url, email)',
      )
      .eq('status', 'accepted')
      .or(`from_id.eq.${me.id},to_id.eq.${me.id}`)
    if (error) {
      console.error('loadInviteFriends failed', error)
      setInviteFriends([])
      return
    }
    setInviteFriends(
      (data || [])
        .map((row: any) => (row.from_id === me.id ? row.to_profile : row.from_profile))
        .filter(Boolean),
    )
  }

  async function addMember(target: { id: string; username: string; email?: string; display_name?: string | null; avatar_url?: string | null }) {
    if (!me || !conversation) return
    setAddBusy(true)
    setAddError(null)
    try {
      const isRoleGroup = !!members[me.id]?.role
      const { error: memberErr } = await supabase
        .from('conversation_members')
        .insert({
          conversation_id: conversation.id,
          user_id: target.id,
          added_by: me.id,
          ...(isRoleGroup ? { role: 'member' } : {}),
        })
      if (memberErr && !memberErr.message.includes('duplicate')) {
        if (memberErr.message.includes('row-level security')) {
          throw new Error('Só dá pra adicionar quem é seu amigo (ou é o parceiro da DM original)')
        }
        throw memberErr
      }

      setMembers((prev) => ({
        ...prev,
        [target.id]: {
          username: target.username,
          display_name: target.display_name ?? null,
          email: target.email || '',
          avatar_url: target.avatar_url ?? null,
          status: null,
          last_seen_at: null,
          is_idle: false,
          last_read_at: new Date().toISOString(),
          added_by: me.id,
          is_leader: false,
          role: isRoleGroup ? 'member' : null,
          name_style_font: null,
          name_style_effect: null,
          name_style_color: null,
        },
      }))

      if (conversation.type === 'dm') {
        const { error: convErr } = await supabase
          .from('conversations')
          .update({ type: 'group' })
          .eq('id', conversation.id)
        if (convErr) throw convErr
        onConversationUpdate({ type: 'group' })

        await supabase
          .from('conversation_members')
          .update({ is_leader: true })
          .eq('conversation_id', conversation.id)
          .eq('user_id', me.id)
        setMembers((prev) => (prev[me.id] ? { ...prev, [me.id]: { ...prev[me.id], is_leader: true } } : prev))
      }

      await postSystemMessage(`${displayName(me)} adicionou ${target.username} ao chat`)

      const welcomeBot = findInstalledBot('zelador')
      if (welcomeBot) {
        await postBotReply(welcomeBot.id, `Bem-vindo(a), ${target.display_name || target.username}!`)
      }

      if (isRoleGroup) {
        setConfigView('root')
      } else {
        setShowChatConfig(false)
        if (otherMemberEntry) setProfilePopupId(otherMemberEntry[0])
      }
    } catch (err) {
      setAddError(getErrorMessage(err))
    } finally {
      setAddBusy(false)
    }
  }

  const myMembership = me ? members[me.id] : undefined
  const isRoleGroup = !!myMembership?.role
  const canManageMembers = !!myMembership && (myMembership.added_by === null || myMembership.is_leader)
  const canEditGroupInfo = isRoleGroup && (myMembership?.role === 'admin' || myMembership?.role === 'moderator')
  const canManageBots = isRoleGroup ? myMembership?.role === 'admin' : canManageMembers

  function canKick(target: MemberMeta): boolean {
    if (!myMembership) return false
    if (isRoleGroup) {
      if (myMembership.role === 'admin') return target.role !== 'admin'
      if (myMembership.role === 'moderator') return target.role === 'member'
      return false
    }
    return target.added_by !== null && canManageMembers
  }

  function canPromote(target: MemberMeta): boolean {
    if (isRoleGroup) return myMembership?.role === 'admin' && target.role === 'member'
    return target.added_by !== null && canManageMembers && !target.is_leader
  }

  function canDemote(target: MemberMeta): boolean {
    if (isRoleGroup) return false
    return target.added_by !== null && canManageMembers && !!target.is_leader
  }

  function openGroupEdit() {
    setEditName(conversation?.name || '')
    setEditDesc(conversation?.description || '')
    setEditImageUrl(conversation?.image_url || '')
    setEditInvitePermission(conversation?.invite_permission || 'all')
    setShowChatConfig(true)
    setConfigView('root')
  }

  async function uploadGroupImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !me || !conversation) return
    setGroupImageUploading(true)
    try {
      const url = await uploadImage(file, me.id, 'group')
      setEditImageUrl(url)
      await supabase.from('conversations').update({ image_url: url }).eq('id', conversation.id)
      onConversationUpdate({ image_url: url })
    } catch (err) {
      setAddError(getErrorMessage(err))
    } finally {
      setGroupImageUploading(false)
      if (groupImageInputRef.current) groupImageInputRef.current.value = ''
    }
  }

  async function saveGroupName() {
    setEditingGroupName(false)
    if (!conversation) return
    const trimmed = editName.trim()
    if (!trimmed || trimmed === conversation.name) return
    await supabase.from('conversations').update({ name: trimmed }).eq('id', conversation.id)
    onConversationUpdate({ name: trimmed })
  }

  async function saveGroupDescription() {
    if (!conversation) return
    const trimmed = editDesc.trim() || null
    await supabase.from('conversations').update({ description: trimmed }).eq('id', conversation.id)
    onConversationUpdate({ description: trimmed })
  }

  async function saveInvitePermission(perm: 'all' | 'owner') {
    if (!conversation) return
    setEditInvitePermission(perm)
    await supabase.from('conversations').update({ invite_permission: perm }).eq('id', conversation.id)
    onConversationUpdate({ invite_permission: perm })
  }

  async function deleteGroup() {
    if (!conversation) return
    await supabase.from('conversations').delete().eq('id', conversation.id)
    setShowChatConfig(false)
    onBack()
  }

  const canInvite = !isRoleGroup || conversation?.invite_permission !== 'owner' || myMembership?.role === 'admin'

  async function removeMember(targetId: string) {
    if (!conversation || !me) return
    const targetMeta = members[targetId]
    await supabase
      .from('conversation_members')
      .delete()
      .eq('conversation_id', conversation.id)
      .eq('user_id', targetId)
    const remaining = Object.keys(members).filter((id) => id !== targetId)
    setMembers((prev) => {
      const next = { ...prev }
      delete next[targetId]
      return next
    })
    if (!isRoleGroup && conversation.type === 'group' && remaining.length === 2) {
      await supabase.from('conversations').update({ type: 'dm' }).eq('id', conversation.id)
      onConversationUpdate({ type: 'dm' })
    }
    if (targetMeta) {
      await postSystemMessage(`${displayName(me)} removeu ${displayName(targetMeta)} do chat`)
    }
  }

  async function promoteLeader(targetId: string) {
    if (!conversation || !me) return
    const targetMeta = members[targetId]
    if (isRoleGroup) {
      await supabase
        .from('conversation_members')
        .update({ role: 'moderator' })
        .eq('conversation_id', conversation.id)
        .eq('user_id', targetId)
      setMembers((prev) => (prev[targetId] ? { ...prev, [targetId]: { ...prev[targetId], role: 'moderator' } } : prev))
      if (targetMeta) await postSystemMessage(`${displayName(me)} promoveu ${displayName(targetMeta)} a moderador`)
      return
    }
    await supabase
      .from('conversation_members')
      .update({ is_leader: true })
      .eq('conversation_id', conversation.id)
      .eq('user_id', targetId)
    setMembers((prev) => (prev[targetId] ? { ...prev, [targetId]: { ...prev[targetId], is_leader: true } } : prev))
    if (targetMeta) await postSystemMessage(`${displayName(me)} deu a coroa pra ${displayName(targetMeta)}`)
  }

  async function demoteLeader(targetId: string) {
    if (!conversation || !me) return
    const targetMeta = members[targetId]
    await supabase
      .from('conversation_members')
      .update({ is_leader: false })
      .eq('conversation_id', conversation.id)
      .eq('user_id', targetId)
    setMembers((prev) => (prev[targetId] ? { ...prev, [targetId]: { ...prev[targetId], is_leader: false } } : prev))
    if (targetMeta) await postSystemMessage(`${displayName(me)} tirou a coroa de ${displayName(targetMeta)}`)
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const text = e.target.value
    setDraft(text)
    recordReplayEvent(text)
    broadcastTyping(text)
  }

  function pickEmojiPreview(emoji: string | null) {
    broadcastTyping(emoji ? draft + emoji : draft)
  }

  function appendEmoji(emoji: string) {
    const next = draft + emoji
    setDraft(next)
    recordReplayEvent(next)
    broadcastTyping(next)
    setShowEmoji(false)
  }

  function handleAttachFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    setPendingEphemeralFile(file)
    setPendingViewOnce(false)
    setShowAttachMenu(false)
  }

  async function sendEphemeralMedia() {
    if (!pendingEphemeralFile || !conversation || !me) return
    const kind: EphemeralKind = pendingViewOnce ? 'view_once' : 'timed'
    setEphemeralSending(true)
    try {
      const label = kind === 'view_once' ? 'Mídia de visualização única' : 'Mídia temporária'
      const { data: msg, error: msgErr } = await supabase
        .from('messages')
        .insert({ conversation_id: conversation.id, author_id: me.id, content: label, kind: 'ephemeral' })
        .select()
        .single()
      if (msgErr || !msg) throw msgErr

      const { storagePath, mediaType, fileName } = await uploadEphemeralMedia(pendingEphemeralFile, conversation.id, msg.id)

      const { data: ephemeralRow, error: ephErr } = await supabase
        .from('ephemeral_media')
        .insert({
          message_id: msg.id,
          conversation_id: conversation.id,
          storage_path: storagePath,
          media_type: mediaType,
          file_name: fileName,
          kind,
        })
        .select()
        .single()
      if (ephErr) throw ephErr

      setEphemeralByMessage((prev) => ({ ...prev, [msg.id]: ephemeralRow as EphemeralMediaRow }))
      setPendingEphemeralFile(null)
      setPendingViewOnce(false)

      const recipientIds = Object.keys(members).filter((id) => id !== me.id)
      sendPush(recipientIds, displayName(me), kind === 'view_once' ? 'mandou uma mídia de visualização única' : 'mandou uma mídia temporária', conversation.id)
    } catch (err) {
      console.error('sendEphemeralMedia failed', err)
    } finally {
      setEphemeralSending(false)
    }
  }

  function myEphemeralView(eph: EphemeralMediaRow) {
    return eph.ephemeral_media_views?.find((v) => v.user_id === me?.id) || null
  }

  function upsertMyEphemeralView(messageId: string, patch: Partial<EphemeralMediaView>) {
    setEphemeralByMessage((prev) => {
      const eph = prev[messageId]
      if (!eph || !me) return prev
      const views = eph.ephemeral_media_views || []
      const existing = views.find((v) => v.user_id === me.id)
      const nextViews = existing
        ? views.map((v) => (v.user_id === me.id ? { ...v, ...patch } : v))
        : [...views, { id: 'local', ephemeral_media_id: eph.id, user_id: me.id, opened_at: null, expired: false, ...patch }]
      return { ...prev, [messageId]: { ...eph, ephemeral_media_views: nextViews } }
    })
  }

  async function handleOpenEphemeral(row: EphemeralMediaRow, opts?: { inline?: boolean }) {
    if (row.storage_deleted || myEphemeralView(row)?.expired) return
    try {
      const result = await openEphemeralMedia(row.id)
      if ('expired' in result) {
        upsertMyEphemeralView(row.message_id, { expired: true })
        return
      }
      if (opts?.inline) {
        setInlineMedia((prev) => ({ ...prev, [row.message_id]: { ...result, id: row.id } }))
      } else {
        setEphemeralViewer({ ...result, id: row.id })
      }
      if (result.kind === 'view_once') {
        upsertMyEphemeralView(row.message_id, { expired: true, opened_at: new Date().toISOString() })
        // da um tempo pro cliente carregar a imagem/video antes de mandar o servidor apagar o storage
        setTimeout(() => {
          checkExpireEphemeralMedia(row.id).catch(() => {})
        }, 8000)
      } else {
        const openedAt = myEphemeralView(row)?.opened_at || new Date().toISOString()
        upsertMyEphemeralView(row.message_id, { opened_at: openedAt })

        // baseado no opened_at real, nao num timer novo de 10min toda vez que reabre
        // o chat - senao quem revisita antes do timer antigo terminar reseta o prazo
        // pra sempre, e a midia nunca chega a expirar de fato
        const elapsed = Date.now() - new Date(openedAt).getTime()
        const remaining = 10 * 60_000 + 5_000 - elapsed

        const runExpireCheck = async () => {
          const { expired } = await checkExpireEphemeralMedia(row.id).catch(() => ({ expired: false }))
          if (expired) {
            upsertMyEphemeralView(row.message_id, { expired: true })
            setInlineMedia((prev) => {
              if (!prev[row.message_id]) return prev
              const next = { ...prev }
              delete next[row.message_id]
              return next
            })
          }
        }

        if (remaining <= 0) runExpireCheck()
        else setTimeout(runExpireCheck, remaining)
      }
    } catch (err) {
      console.error('handleOpenEphemeral failed', err)
    }
  }

  // midia "temporaria" (nao visualizacao unica) aparece direto no chat, sem
  // precisar tocar em botao - o toque-pra-ver so continua existindo pra
  // visualizacao unica, que precisa de uma acao explicita antes de sumir
  useEffect(() => {
    for (const eph of Object.values(ephemeralByMessage)) {
      if (eph.kind !== 'timed') continue
      if (eph.storage_deleted) continue
      if (myEphemeralView(eph)?.expired) continue
      if (inlineMedia[eph.message_id]) continue
      if (requestedInlineRef.current.has(eph.message_id)) continue
      requestedInlineRef.current.add(eph.message_id)
      handleOpenEphemeral(eph, { inline: true })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ephemeralByMessage])

  function toggleTranscript(messageId: string) {
    setOpenTranscripts((prev) => {
      const next = new Set(prev)
      if (next.has(messageId)) next.delete(messageId)
      else next.add(messageId)
      return next
    })
  }

  async function sendAudioMessage(file: File, transcript: string) {
    if (!conversation || !me) return
    setEphemeralSending(true)
    try {
      const { data: msg, error: msgErr } = await supabase
        .from('messages')
        .insert({ conversation_id: conversation.id, author_id: me.id, content: transcript, kind: 'ephemeral' })
        .select()
        .single()
      if (msgErr || !msg) throw msgErr

      const { storagePath, fileName } = await uploadEphemeralMedia(file, conversation.id, msg.id)

      const { data: ephemeralRow, error: ephErr } = await supabase
        .from('ephemeral_media')
        .insert({
          message_id: msg.id,
          conversation_id: conversation.id,
          storage_path: storagePath,
          media_type: 'audio',
          file_name: fileName,
          kind: 'timed',
        })
        .select()
        .single()
      if (ephErr) throw ephErr

      setEphemeralByMessage((prev) => ({ ...prev, [msg.id]: ephemeralRow as EphemeralMediaRow }))
      const recipientIds = Object.keys(members).filter((id) => id !== me.id)
      sendPush(recipientIds, displayName(me), 'mandou um áudio', conversation.id)
    } catch (err) {
      console.error('sendAudioMessage failed', err)
    } finally {
      setEphemeralSending(false)
    }
  }

  function toggleRecording() {
    if (recording) {
      mediaRecorderRef.current?.stop()
      return
    }

    navigator.mediaDevices
      ?.getUserMedia({ audio: true })
      .then((stream) => {
        const chunks: BlobPart[] = []
        const recorder = new MediaRecorder(stream)
        mediaRecorderRef.current = recorder

        const SpeechRecognitionCtor = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition
        let recognition: SpeechRecognitionLike | null = null
        let transcript = ''
        if (SpeechRecognitionCtor) {
          const r: SpeechRecognitionLike = new SpeechRecognitionCtor()
          r.lang = 'pt-BR'
          r.continuous = true
          r.interimResults = true
          r.onresult = (e: any) => {
            let t = ''
            for (let i = 0; i < e.results.length; i++) t += e.results[i][0].transcript
            transcript = t
          }
          r.onend = () => {}
          r.onerror = () => {}
          try {
            r.start()
          } catch {
            // ignore
          }
          recognition = r
        }

        recorder.ondataavailable = (e) => {
          if (e.data.size > 0) chunks.push(e.data)
        }
        recorder.onstop = () => {
          stream.getTracks().forEach((t) => t.stop())
          try {
            recognition?.stop()
          } catch {
            // ignore
          }
          setRecording(false)
          if (chunks.length === 0) return
          const blob = new Blob(chunks, { type: 'audio/webm' })
          const file = new File([blob], `audio-${Date.now()}.webm`, { type: 'audio/webm' })
          sendAudioMessage(file, transcript.trim())
        }
        recorder.start()
        setRecording(true)
      })
      .catch((err) => {
        console.error('mic access failed', err)
        alert('Não consegui acessar o microfone.')
      })
  }

  async function handleSend() {
    const content = draft.trim()
    if (!content || !conversation || !me) return

    const eventsToStore = [...replayBuffer.current]
    broadcastTyping('')
    setDraft('')
    setAtBottom(true)
    replayBuffer.current = []

    const replyToId = replyTarget?.id ?? null
    setReplyTarget(null)

    const { data: msg } = await supabase
      .from('messages')
      .insert({ conversation_id: conversation.id, author_id: me.id, content, reply_to_id: replyToId })
      .select()
      .single()

    if (msg && eventsToStore.length > 1) {
      if (hasHiddenEdit(eventsToStore, content)) {
        setEditedIds((prev) => new Set(prev).add(msg.id))
      }
      await supabase.from('message_replays').insert({ message_id: msg.id, events: eventsToStore })
    }

    if (content.startsWith('/')) {
      handleBotCommand(content)
    } else {
      const recipientIds = Object.keys(members).filter((id) => id !== me.id)
      sendPush(recipientIds, displayName(me), content, conversation.id)
    }
  }


  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  async function openReplay(msg: Message) {
    setReplayFor(msg)
    setReplayEvents(null)
    const { data } = await supabase
      .from('message_replays')
      .select('events')
      .eq('message_id', msg.id)
      .maybeSingle()
    setReplayEvents((data?.events as ReplayEvent[]) || [])
  }

  const SWIPE_REPLY_THRESHOLD = 56
  const SWIPE_REPLY_MAX = 80

  function handleMessagePointerDown(e: React.PointerEvent, msg: Message) {
    if (msg.kind === 'system') return
    dragStartXRef.current = e.clientX
    dragTriggeredRef.current = false
    setDragMsgId(msg.id)
    setDragX(0)
  }

  function handleMessagePointerMove(e: React.PointerEvent, msg: Message) {
    if (dragMsgId !== msg.id || dragStartXRef.current === null) return
    const delta = e.clientX - dragStartXRef.current
    const clamped = Math.max(0, Math.min(SWIPE_REPLY_MAX, delta))
    setDragX(clamped)
    if (clamped >= SWIPE_REPLY_THRESHOLD && !dragTriggeredRef.current) {
      dragTriggeredRef.current = true
      if (navigator.vibrate) navigator.vibrate(15)
    }
  }

  function handleMessagePointerUp(msg: Message) {
    if (dragMsgId !== msg.id) return
    if (dragTriggeredRef.current) setReplyTarget(msg)
    dragStartXRef.current = null
    dragTriggeredRef.current = false
    setDragMsgId(null)
    setDragX(0)
  }

  function replySnippet(msg: Message): string {
    if (msg.kind === 'sticker') return 'Figurinha'
    if (msg.kind === 'gif') return 'GIF'
    if (msg.kind === 'ephemeral') return 'Mídia'
    if (msg.kind === 'contact') return 'Contato'
    return msg.content
  }

  const isOrganicGroup = conversation?.type === 'group' && !isRoleGroup

  const otherMemberEntry = useMemo(() => {
    if (!conversation) return null
    if (conversation.type === 'dm') {
      const entry = Object.entries(members).find(([id]) => id !== me?.id)
      return entry || null
    }
    if (isOrganicGroup) {
      // show the other original DM member (added_by === null) as the "face" of the group
      const entry = Object.entries(members).find(([id, meta]) => id !== me?.id && meta.added_by === null)
      return entry || null
    }
    return null
  }, [conversation, members, me?.id, isOrganicGroup])
  const otherMember = otherMemberEntry?.[1] || null

  const title = useMemo(() => {
    if (!conversation) return ''
    if (conversation.type === 'group') {
      if (isOrganicGroup && otherMember) return displayName(otherMember)
      return conversation.name || 'grupo'
    }
    return otherMember ? displayName(otherMember) : 'conversa'
  }, [conversation, otherMember, isOrganicGroup])

  const displayTitle = title

  function isReadByOthers(msg: Message) {
    let others = Object.entries(members).filter(([id]) => id !== me?.id)
    if (isOrganicGroup) {
      others = others.filter(([, meta]) => meta.added_by === null)
    }
    if (others.length === 0) return false
    return others.every(([, meta]) => new Date(meta.last_read_at) >= new Date(msg.created_at))
  }

  if (!conversation || !me) {
    return (
      <main className="main main-welcome">
        <div className="empty">
          <div className="empty-card welcome-card">
            <div className="welcome-emblem"><img src={thothLogo} alt="" /></div>
            <span className="welcome-eyebrow">THOTHCHAT</span>
            <h2>Toda conversa tem vida.</h2>
            <p>{me ? 'Escolha alguém ao lado. Aqui, até o caminho das palavras faz parte da conversa.' : 'Entre na sua conta. Aqui, até o caminho das palavras faz parte da conversa.'}</p>
            <div className="welcome-features">
              <span><IconNudge size={17} /> Sininho</span>
              <span><IconChat size={17} /> Escrita ao vivo</span>
              <span><IconHeart size={17} /> Winks</span>
            </div>
          </div>
        </div>
      </main>
    )
  }

  return (
    <main className="main">
      <header className="chat-header">
        <button type="button" className="back-mobile icon-btn" aria-label="Voltar às conversas" onClick={onBack}><IconArrowLeft size={20} /></button>
        <div
          style={{ position: 'relative', cursor: otherMember || conversation.type === 'group' ? 'pointer' : 'default' }}
          onClick={() => {
            if (otherMember && me) setProfilePopupId(otherMemberEntry![0])
            else if (conversation.type === 'group') openGroupEdit()
          }}
        >
          <div
            className="header-photo"
            style={{
              overflow: 'hidden',
              borderColor: otherMember?.name_style_color || 'transparent',
              ...(!otherMember && !(conversation.image_url && !groupImageFailed) ? { background: colorFromId(conversation.id), color: '#fff' } : {}),
            }}
          >
            {otherMember?.avatar_url ? (
              <img src={otherMember.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : !otherMember && conversation.image_url && !groupImageFailed ? (
              <img
                src={conversation.image_url}
                alt=""
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                onError={() => setGroupImageFailed(true)}
              />
            ) : (
              title[0]?.toUpperCase()
            )}
          </div>
          {otherMember && (
            <span className={`presence-dot ${getPresenceColor(otherMember.last_seen_at, otherMember.is_idle)}`} />
          )}
        </div>
        <div className="header-text">
          <div
            className="header-name"
            style={{ cursor: otherMember || conversation.type === 'group' ? 'pointer' : 'default' }}
            onClick={() => {
            if (otherMember && me) setProfilePopupId(otherMemberEntry![0])
            else if (conversation.type === 'group') openGroupEdit()
          }}
          >
            {otherMember ? (
              <StyledName
                name={displayTitle}
                font={otherMember.name_style_font}
                effect={otherMember.name_style_effect}
                color={otherMember.name_style_color}
              />
            ) : (
              displayTitle
            )}
            {isOrganicGroup && <span className="grupal-badge">Grupo Orgânico</span>}
            {isTauriDesktop && otherMember?.status && (
              <span className="header-status-phrase">{otherMember.status}</span>
            )}
            {nudgeFrom && (
              <span className="nudge-indicator" title="chamou sua atenção">
                <IconBell size={14} />
                {conversation.type === 'group' && members[nudgeFrom] && ` ${displayName(members[nudgeFrom])}`}
              </span>
            )}
          </div>
          {sonorSession && (
            <div className="header-sonor">
              <span
                title={sonorSession.title}
                style={{ cursor: 'pointer' }}
                onClick={(e) => {
                  e.stopPropagation()
                  setSonorCardOpen(true)
                }}
              >
                {sonorAudioError || (sonorReconnecting ? 'reconectando…' : shortRadioName(sonorSession.title))}
                {!sonorAudioError && sonorNowPlaying ? ` · ${sonorNowPlaying}` : ''}
              </span>
              <input
                type="range"
                className="header-sonor-volume"
                min={0}
                max={1}
                step={0.05}
                value={sonorVolume}
                title="Volume do Sonor"
                onChange={(e) => handleSonorVolumeChange(parseFloat(e.target.value))}
                onClick={(e) => e.stopPropagation()}
              />
              <button type="button" className="icon-btn" title={sonorListening ? 'Silenciar Sonor' : 'Ouvir Sonor'} onClick={toggleSonorListening}>
                {sonorListening ? <IconVolume size={28} /> : <IconVolumeOff size={28} />}
              </button>
            </div>
          )}
        </div>
        <div className="header-actions">
          {conversation.type === 'group' && onToggleSidebar && (
            <button
              type="button"
              className="icon-btn"
              title={sidebarCollapsed ? 'Mostrar lista de conversas' : 'Esconder lista de conversas'}
              onClick={onToggleSidebar}
            >
              <IconPanelLeft size={20} />
            </button>
          )}
          {conversation.type === 'dm' && otherMember && otherMemberEntry && (
            <>
              <button
                type="button"
                className="icon-btn"
                title="Chamada de voz"
                onClick={() => onStartCall({ id: otherMemberEntry[0], name: displayName(otherMember), avatarUrl: otherMember.avatar_url }, 'audio')}
              >
                <IconPhone size={20} />
              </button>
              <button
                type="button"
                className="icon-btn"
                title="Chamada de vídeo"
                onClick={() => onStartCall({ id: otherMemberEntry[0], name: displayName(otherMember), avatarUrl: otherMember.avatar_url }, 'video')}
              >
                <IconVideo size={20} />
              </button>
            </>
          )}
        </div>
      </header>

      {showChatConfig && (
        <div className="modal-backdrop" onClick={() => setShowChatConfig(false)}>
          <div className="modal-card group-info-card settings-sheet" role="dialog" aria-modal="true" aria-label="Detalhes da conversa" onClick={(e) => e.stopPropagation()}>
            <div className="settings-topbar">
              {configView !== 'root' && (
                <button
                  type="button"
                  className="icon-btn"
                  aria-label="Voltar aos detalhes"
                  onClick={() => (conversation.type === 'dm' || isOrganicGroup ? setShowChatConfig(false) : setConfigView('root'))}
                >
                  <IconArrowLeft size={20} />
                </button>
              )}
              <strong>{configView === 'root' ? (isOrganicGroup ? 'Detalhes do grupo orgânico' : 'Detalhes do grupo') : configView === 'members' ? 'Participantes' : configView === 'invite' ? 'Convidar amigos' : 'Bots do grupo'}</strong>
              <button type="button" className="settings-close" aria-label="Fechar detalhes" onClick={() => setShowChatConfig(false)}><IconPlus size={18} /></button>
            </div>
            <div className="settings-identity" hidden={configView !== 'root'}>
            <div
              className="group-info-avatar"
              style={{
                cursor: canEditGroupInfo ? 'pointer' : 'default',
                ...((editImageUrl || conversation.image_url) && !groupImageFailed
                  ? {}
                  : { background: colorFromId(conversation.id), color: '#fff' }),
              }}
              onClick={() => { if (canEditGroupInfo) groupImageInputRef.current?.click() }}
            >
              <input ref={groupImageInputRef} type="file" accept="image/*" hidden onChange={uploadGroupImage} />
              {conversation.type === 'dm' && otherMember?.avatar_url ? <img src={otherMember.avatar_url} alt="" /> : groupImageUploading ? (
                '...'
              ) : (editImageUrl || conversation.image_url) && !groupImageFailed ? (
                <img
                  src={editImageUrl || conversation.image_url!}
                  alt=""
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  onError={() => setGroupImageFailed(true)}
                />
              ) : (
                (conversation.name || title)[0]?.toUpperCase()
              )}
            </div>
            {editingGroupName ? (
              <input
                className="group-info-name-input"
                value={editName}
                autoFocus
                onChange={(e) => setEditName(e.target.value)}
                onBlur={saveGroupName}
                onKeyDown={(e) => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur() }}
              />
            ) : (
              <h2 style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
                {conversation.name || title}
                {canEditGroupInfo && (
                  <button type="button" className="icon-btn" title="Editar nome" onClick={() => setEditingGroupName(true)}>
                    <IconEdit size={14} />
                  </button>
                )}
              </h2>
            )}
            <p className="status">
              {conversation.type === 'dm' ? 'Conversa' : isOrganicGroup ? 'Grupo orgânico' : 'Grupo'} ·{' '}
              <span style={{ textDecoration: 'underline', cursor: 'pointer' }} onClick={() => setConfigView('members')}>
                {Object.keys(members).length} membros
              </span>
            </p>
            {canEditGroupInfo ? (
              <div className="settings-description">
                <input
                  aria-label="Descrição do grupo" placeholder="Adicionar descrição ao grupo"
                  style={{ flex: 1 }}
                  value={editDesc}
                  onChange={(e) => setEditDesc(e.target.value)}
                />
                <button type="button" className="icon-btn" title="Salvar descrição" onClick={saveGroupDescription}>
                  <IconCheck size={16} />
                </button>
              </div>
            ) : (
              conversation.description && <p className="community-description">{conversation.description}</p>
            )}

            </div>
            {configView === 'root' && (
              <div className="settings-sections">
                <SettingsRow icon={<IconUser size={21} />} title="Membros do grupo" detail={`${Object.keys(members).length} participantes · ver e gerenciar`} onClick={() => setConfigView('members')} />
                {canInvite && <SettingsRow icon={<IconPlus size={21} />} title="Convidar amigo" detail="Adicionar alguém à conversa" onClick={() => {
                  loadInviteFriends()
                  if (isRoleGroup && myMembership?.role === 'admin') loadJoinRequests()
                  setConfigView('invite')
                }} />}
                {canManageBots && <SettingsRow icon={<IconChat size={21} />} title="Bots do grupo" detail={installedBots.length ? installedBots.map((bot) => bot.name).join(' · ') : 'Escolher bots disponíveis'} onClick={() => { loadCatalogBots(); setConfigView('bots') }} />}
                {canManageBots && isRoleGroup && <div className="settings-permissions">
                  <label className="group-info-section-label">Quem pode convidar</label>
                  <div className="theme-picker">
                    <button type="button" className={`theme-option${editInvitePermission === 'all' ? ' active' : ''}`} onClick={() => saveInvitePermission('all')}>Todos</button>
                    <button type="button" className={`theme-option${editInvitePermission === 'owner' ? ' active' : ''}`} onClick={() => saveInvitePermission('owner')}>Só o dono</button>
                  </div>
                </div>}
                {canManageBots && isRoleGroup && (
                  <div className="settings-permissions">
                    <label className="group-info-section-label">Visibilidade</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.85rem' }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={!!conversation.is_public}
                        onChange={toggleGroupPublic}
                      />
                      Grupo público (aparece na busca e em "grupos em alta")
                    </label>
                  </div>
                )}
                {conversation.created_by === me?.id && !confirmDeleteGroup && (
                  <button type="button" className="settings-danger-btn" onClick={() => setConfirmDeleteGroup(true)}>
                    <IconMinusCircle size={18} /> Excluir grupo
                  </button>
                )}
                {conversation.created_by === me?.id && confirmDeleteGroup && (
                  <div style={{ display: 'flex', gap: 8, padding: '10px 5px' }}>
                    <button type="button" className="danger" onClick={deleteGroup}>Confirmar exclusão</button>
                    <button type="button" onClick={() => setConfirmDeleteGroup(false)}>cancelar</button>
                  </div>
                )}
              </div>
            )}
            {configView === 'members' && (
              <>
                <label className="group-info-section-label">
                  {Object.keys(members).length} membros
                </label>
                <div className="chat-config-members">
                  {Object.entries(members)
                    .sort(([, a], [, b]) => displayName(a).localeCompare(displayName(b), 'pt-BR'))
                    .map(([id, meta]) => (
                    <div key={id} className="chat-config-row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div className="photo" style={{ width: 32, height: 32, flexShrink: 0 }}>
                          {meta.avatar_url ? <img src={meta.avatar_url} alt="" /> : (meta.username[0] || '?').toUpperCase()}
                        </div>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {displayName(meta)}
                          {isRoleGroup
                            ? meta.role === 'admin'
                              ? ' (adm)'
                              : meta.role === 'moderator'
                                ? ' (mod)'
                                : ''
                            : (meta.added_by === null || meta.is_leader) && <IconCrown size={12} />}
                        </span>
                      </div>
                      {id !== me?.id && (
                        <span className="chat-config-actions">
                          {canPromote(meta) && (
                            <button type="button" onClick={() => promoteLeader(id)}>
                              {isRoleGroup ? 'mod' : 'dar coroa'}
                            </button>
                          )}
                          {canDemote(meta) && (
                            <button type="button" onClick={() => demoteLeader(id)}>tirar coroa</button>
                          )}
                          {canKick(meta) && (
                            <button type="button" className="remove-btn" onClick={() => removeMember(id)}>remover</button>
                          )}
                        </span>
                      )}
                    </div>
                  ))}
                </div>

              </>
            )}
            {configView === 'bots' && (
              <>
                <label className="group-info-section-label">Catálogo de bots</label>
                {botsBusy && <div className="empty">carregando...</div>}
                {botsError && <span className="auth-error">{botsError}</span>}
                <div className="chat-config-members">
                  {catalogBots.map((bot) => {
                    const installed = installedBots.find((b) => b.id === bot.id)
                    return (
                      <div key={bot.id} className="chat-config-row" style={{ flexDirection: 'column', alignItems: 'stretch', gap: 6 }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            <strong>{bot.name}</strong>{!bot.external_api_ready && ' (em breve)'}
                          </span>
                          <button type="button" disabled={botsBusy} onClick={() => toggleInstallBot(bot, !!installed)}>
                            {installed ? 'remover' : 'instalar'}
                          </button>
                        </div>
                        <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>{bot.description}</span>
                        {installed && (
                          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem' }}>
                            <input
                              type="checkbox"
                              style={{ width: 'auto' }}
                              checked={installed.permission === 'admin'}
                              onChange={(e) => setBotPermission(bot.id, e.target.checked ? 'admin' : 'all')}
                            />
                            só admin pode usar esse bot aqui
                          </label>
                        )}
                      </div>
                    )
                  })}
                </div>

              </>
            )}
            {configView === 'invite' && (
              <>
                {isRoleGroup && myMembership?.role === 'admin' && (
                  <div className="invite-link-box">
                    {conversation.invite_code ? (
                      <>
                        <input type="text" readOnly value={inviteUrl(conversation.invite_code)} onClick={(e) => (e.target as HTMLInputElement).select()} />
                        <div className="invite-link-actions">
                          <button type="button" onClick={() => conversation.invite_code && copyInviteLink(conversation.invite_code)}>
                            {inviteLinkCopied ? 'copiado!' : 'copiar link'}
                          </button>
                          <button type="button" disabled={inviteLinkBusy} onClick={generateGroupInviteLink}>gerar novo</button>
                        </div>
                        <span className="invite-code">
                          {conversation.invite_requires_approval
                            ? 'quem tem esse link pede pra entrar, precisa você aceitar'
                            : 'quem tem esse link entra direto, mesmo sem ser seu amigo'}
                        </span>
                      </>
                    ) : (
                      <button type="button" disabled={inviteLinkBusy} onClick={generateGroupInviteLink}>
                        {inviteLinkBusy ? 'gerando...' : 'gerar link de convite'}
                      </button>
                    )}
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: '.8rem', marginTop: 6 }}>
                      <input
                        type="checkbox"
                        style={{ width: 'auto' }}
                        checked={!!conversation.invite_requires_approval}
                        onChange={toggleInviteApproval}
                      />
                      Aprovar antes de entrar pelo link
                    </label>
                    {joinRequests.length > 0 && (
                      <div className="chat-config-members" style={{ marginTop: 8 }}>
                        <span style={{ fontSize: '.75rem', color: 'var(--muted)' }}>pedidos pra entrar</span>
                        {joinRequests.map((r) => (
                          <div key={r.user_id} className="chat-config-row">
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                              <div className="photo" style={{ width: 32, height: 32, flexShrink: 0 }}>
                                {r.avatar_url ? <img src={r.avatar_url} alt="" /> : (r.username?.[0] || '?').toUpperCase()}
                              </div>
                              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {r.display_name || r.username}
                              </span>
                            </div>
                            <div className="chat-config-actions">
                              <button type="button" onClick={() => acceptJoinRequest(r.user_id)}>aceitar</button>
                              <button type="button" onClick={() => rejectJoinRequest(r.user_id)}>recusar</button>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                <div className="chat-config-members">
                  {inviteFriends.filter((f) => !members[f.id]).length === 0 && (
                    <span style={{ fontSize: '.8rem', color: '#8696a0' }}>
                      {inviteFriends.length === 0 ? 'você ainda não tem amigos' : 'todos os seus amigos já estão aqui'}
                    </span>
                  )}
                  {inviteFriends.filter((f) => !members[f.id]).map((f) => (
                    <div key={f.id} className="chat-config-row" style={{ cursor: addBusy ? 'default' : 'pointer' }} onClick={() => !addBusy && addMember(f)}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                        <div className="photo" style={{ width: 32, height: 32, flexShrink: 0 }}>
                          {f.avatar_url ? <img src={f.avatar_url} alt="" /> : (f.username[0] || '?').toUpperCase()}
                        </div>
                        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName(f)}</span>
                      </div>
                      <span className="chat-config-actions" aria-hidden="true">
                        <span className="chat-config-fake-btn">convidar</span>
                      </span>
                    </div>
                  ))}
                </div>

              </>
            )}
            {addError && <span className="auth-error">{addError}</span>}

          </div>
        </div>
      )}

      <section className="messages" onScroll={handleMessagesScroll}>
        {messages.filter((m) => !blockedIds.has(m.author_id)).map((m, idx, arr) => {
          const prev = arr[idx - 1]
          const showDate = !prev || !isSameDay(prev.created_at, m.created_at)
          return (
          <Fragment key={m.id}>
            {showDate && <div className="date">{formatDateLabel(m.created_at)}</div>}
            {m.kind === 'system' ? (
              <div className="system-message">{m.content}</div>
            ) : m.kind === 'contact' ? (
              <div className={`message ${m.author_id === me.id ? 'out' : 'in'}`}>
                <div className="bubble">
                  {(() => {
                    let card: { name: string; email: string; avatarUrl: string | null } | null = null
                    try {
                      card = JSON.parse(m.content)
                    } catch {
                      card = null
                    }
                    if (!card) return <span>{m.content}</span>
                    return (
                      <div className="contact-card">
                        <div className="contact-card-avatar">
                          {card.avatarUrl ? <img src={sanitizeImageUrl(card.avatarUrl) ?? undefined} alt="" /> : <IconUser size={22} />}
                        </div>
                        <div className="contact-card-info">
                          <strong>{card.name}</strong>
                          <span>{card.email}</span>
                        </div>
                      </div>
                    )
                  })()}
                  <div className="message-footer">
                    <span className="meta">{formatMessageTime(m.created_at)}</span>
                  </div>
                </div>
              </div>
            ) : m.kind === 'sonor_picker' ? (
              <div className={`message ${m.author_id === me.id ? 'out' : 'in'}`}>
                <div className="bubble">
                  {m.author_id !== me.id && (conversation.type === 'group' || botsById[m.author_id]) && (
                    <span className="author-label">{authorLabel(m.author_id) || '...'}</span>
                  )}
                  {(() => {
                    let payload: { query: string; title?: string; options: { name: string; url: string; country: string; is_hls: boolean }[] } | null = null
                    try {
                      payload = JSON.parse(m.content)
                    } catch {
                      payload = null
                    }
                    if (!payload) return <span>{m.content}</span>
                    return (
                      <div className="sonor-picker">
                        <span className="sonor-picker-title">{payload.title || `achei mais de uma "${payload.query}", qual?`}</span>
                        {payload.options.map((opt, i) => (
                          <button key={i} type="button" className="sonor-picker-option" onClick={() => chooseSonorStation(opt)}>
                            {opt.name} {opt.country && <span className="sonor-picker-country">{opt.country}</span>}
                          </button>
                        ))}
                      </div>
                    )
                  })()}
                  <div className="message-footer">
                    <span className="meta">{formatMessageTime(m.created_at)}</span>
                  </div>
                </div>
              </div>
            ) : m.kind === 'sticker' || m.kind === 'gif' ? (
              <div className={`message ${m.author_id === me.id ? 'out' : 'in'}`}>
                <div className="sticker-message">
                  {m.author_id !== me.id && (conversation.type === 'group' || botsById[m.author_id]) && (
                    <span
                      className="author-label"
                      style={{ cursor: members[m.author_id] ? 'pointer' : 'default' }}
                      onClick={() => members[m.author_id] && setProfilePopupId(m.author_id)}
                    >
                      {authorLabel(m.author_id) || '...'}
                    </span>
                  )}
                  <img src={m.content} alt="" className="sticker-img" onClick={() => setExpandedImage(m.content)} />
                  <span className="meta sticker-meta">{formatMessageTime(m.created_at)}</span>
                </div>
              </div>
            ) : m.kind === 'ephemeral' ? (
              <div className={`message ${m.author_id === me.id ? 'out' : 'in'}`}>
                <div className="bubble">
                  {m.author_id !== me.id && (conversation.type === 'group' || botsById[m.author_id]) && (
                    <span
                      className="author-label"
                      style={{ cursor: members[m.author_id] ? 'pointer' : 'default' }}
                      onClick={() => members[m.author_id] && setProfilePopupId(m.author_id)}
                    >
                      {/* estilo do nome fica só no card de perfil por pedido do usuário - members[id].name_style_* continua disponível se quiser trazer de volta aqui */}
                      {authorLabel(m.author_id) || '...'}
                    </span>
                  )}
                  {(() => {
                    const eph = ephemeralByMessage[m.id]
                    if (!eph) return <span className="ephemeral-btn">carregando…</span>
                    const myView = myEphemeralView(eph)
                    if (eph.storage_deleted || myView?.expired) {
                      return (
                        <span className="ephemeral-btn expired">
                          <IconLock size={16} />
                          {eph.kind === 'view_once' ? 'Visualização única — já visto' : 'Mídia expirada'}
                        </span>
                      )
                    }
                    if (eph.kind === 'view_once') {
                      return (
                        <button type="button" className="ephemeral-btn" onClick={() => handleOpenEphemeral(eph)}>
                          <IconLock size={16} />
                          Visualização única — toque pra ver
                        </button>
                      )
                    }
                    const media = inlineMedia[m.id]
                    if (!media || !('url' in media)) return <span className="ephemeral-btn">carregando mídia…</span>
                    return (
                      <div className="ephemeral-inline">
                        {media.mediaType === 'image' && (
                          <div className="ephemeral-media-wrap">
                            <img src={media.url} alt="" onClick={() => setExpandedImage(media.url)} />
                            <a className="ephemeral-download" href={media.url} download={media.fileName || undefined} title="Baixar">
                              <IconDownload size={16} />
                            </a>
                          </div>
                        )}
                        {media.mediaType === 'video' && (
                          <div className="ephemeral-media-wrap">
                            {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                            <video src={media.url} controls />
                            <a className="ephemeral-download" href={media.url} download={media.fileName || undefined} title="Baixar">
                              <IconDownload size={16} />
                            </a>
                          </div>
                        )}
                        {media.mediaType === 'audio' && (
                          <div className="audio-bubble">
                            <div className="audio-bubble-row">
                              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                              <audio src={media.url} controls />
                              <a className="ephemeral-download-inline" href={media.url} download={media.fileName || undefined} title="Baixar">
                                <IconDownload size={14} />
                              </a>
                            </div>
                            {m.content && (
                              <div className="audio-transcribe">
                                <button type="button" className="chevron-btn" onClick={() => toggleTranscript(m.id)}>
                                  <IconChevronDown size={13} /> {openTranscripts.has(m.id) ? 'Ocultar transcrição' : 'Transcrever'}
                                </button>
                                {openTranscripts.has(m.id) && <p className="audio-transcript-text">{m.content}</p>}
                              </div>
                            )}
                          </div>
                        )}
                        {media.mediaType === 'file' && (
                          <a className="ephemeral-file" href={media.url} download={media.fileName || undefined}>
                            <IconDownload size={16} /> {media.fileName || 'arquivo'}
                          </a>
                        )}
                      </div>
                    )
                  })()}
                  <div className="message-footer">
                    <span className="meta">
                      {formatMessageTime(m.created_at)}
                      {m.author_id === me.id && (
                        <span className={`read-receipt${isReadByOthers(m) ? ' read' : ''}`}>
                          {isReadByOthers(m) ? <IconCheckDouble size={15} /> : <IconCheck size={13} />}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            ) : (
              <div
                className={`message ${m.author_id === me.id ? 'out' : 'in'}`}
                onPointerDown={(e) => handleMessagePointerDown(e, m)}
                onPointerMove={(e) => handleMessagePointerMove(e, m)}
                onPointerUp={() => handleMessagePointerUp(m)}
                onPointerCancel={() => handleMessagePointerUp(m)}
                style={dragMsgId === m.id ? { transform: `translateX(${dragX}px)` } : undefined}
              >
                <div className="bubble">
                  {m.author_id !== me.id && (conversation.type === 'group' || botsById[m.author_id]) && (
                    <span
                      className="author-label"
                      style={{ cursor: members[m.author_id] ? 'pointer' : 'default' }}
                      onClick={() => members[m.author_id] && setProfilePopupId(m.author_id)}
                    >
                      {/* estilo do nome fica só no card de perfil por pedido do usuário - members[id].name_style_* continua disponível se quiser trazer de volta aqui */}
                      {authorLabel(m.author_id) || '...'}
                    </span>
                  )}
                  {m.reply_to_id && (() => {
                    const original = messages.find((mm) => mm.id === m.reply_to_id)
                    if (!original) return null
                    return (
                      <div className="reply-quote">
                        <strong>{original.author_id === me.id ? 'Você' : (members[original.author_id] ? displayName(members[original.author_id]) : '...')}</strong>
                        <span>{replySnippet(original)}</span>
                      </div>
                    )
                  })()}
                  {m.content}
                  <button type="button" className="msg-reply-btn" title="Responder" onClick={() => setReplyTarget(m)}>
                    <IconChevronDown size={14} /> responder
                  </button>
                  <div className="message-footer">
                    <button type="button" className="replay-btn" onClick={() => openReplay(m)}>
                      replay{editedIds.has(m.id) && <span className="replay-edited" title="tem coisa diferente do texto final">!</span>}
                    </button>
                    <span className="meta">
                      {formatMessageTime(m.created_at)}
                      {m.author_id === me.id && (
                        <span className={`read-receipt${isReadByOthers(m) ? ' read' : ''}`}>
                          {isReadByOthers(m) ? <IconCheckDouble size={15} /> : <IconCheck size={13} />}
                        </span>
                      )}
                    </span>
                  </div>
                </div>
              </div>
            )}
          </Fragment>
          )
        })}

        {Object.entries(liveTyping).filter(([userId]) => !blockedIds.has(userId)).map(([userId, text]) => (
          <div key={userId} className="message in live">
            <div className="bubble">
              <span className="author-label">{members[userId] ? displayName(members[userId]) : '...'}</span>
              <span className="live-typing-label">digitando...</span>
              {text}
            </div>
          </div>
        ))}

        <div ref={bottomRef} />
      </section>

      <footer className="composer">
        {replyTarget && (
          <div className="reply-preview-bar">
            <div className="reply-preview-content">
              <strong>{replyTarget.author_id === me.id ? 'Você' : (members[replyTarget.author_id] ? displayName(members[replyTarget.author_id]) : '...')}</strong>
              <span>{replySnippet(replyTarget)}</span>
            </div>
            <button type="button" onClick={() => setReplyTarget(null)}><IconMinusCircle size={18} /></button>
          </div>
        )}
        <div className="composer-icons">
          <button ref={emojiBtnRef} type="button" className={`compose-btn${showEmoji ? ' active' : ''}`} onClick={() => setShowEmoji((v) => !v)} title="Emoji"><IconSmile size={20} /></button>
          <button ref={attachBtnRef} type="button" className={`compose-btn${showAttachMenu ? ' active' : ''}`} onClick={() => setShowAttachMenu((v) => !v)} title="Anexar"><IconAttach size={20} /></button>
          <button
            type="button"
            className={`compose-btn${recording ? ' recording' : ''}`}
            onClick={toggleRecording}
            title={recording ? 'Parar e enviar áudio' : 'Gravar áudio'}
          >
            <IconMic size={20} />
          </button>
          <button type="button" className="compose-btn" title="Chamar atenção" onClick={sendNudge}><IconNudge size={20} /></button>
          <button ref={winkBtnRef} type="button" className={`compose-btn${showWinks ? ' active' : ''}`} title="Mandar um wink" onClick={() => setShowWinks((v) => !v)}><IconHeart size={20} /></button>
          <input ref={docInputRef} type="file" hidden onChange={handleAttachFilePicked} />
          <input ref={mediaInputRef} type="file" accept="image/*,video/*" hidden onChange={handleAttachFilePicked} />
          <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" hidden onChange={handleAttachFilePicked} />
          <input ref={audioInputRef} type="file" accept="audio/*" hidden onChange={handleAttachFilePicked} />
          <audio ref={sonorAudioRef} hidden onError={handleSonorAudioError} onPlaying={handleSonorAudioPlaying} />
        </div>
        <div className="composer-input-row">
          <div className="input">
            <textarea
              ref={composerTextareaRef}
              value={draft}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder="Digite sua mensagem"
              rows={1}
            />
          </div>
          <button type="button" className="send" onClick={handleSend} disabled={!draft.trim()}><IconSend size={18} /></button>
        </div>

        {showAttachMenu && (
          <div className="attach-menu" ref={attachMenuRef}>
            <button type="button" onClick={() => cameraInputRef.current?.click()}>Câmera</button>
            <button type="button" onClick={() => mediaInputRef.current?.click()}>Fotos e vídeos</button>
            <button type="button" onClick={() => audioInputRef.current?.click()}>Áudio</button>
            <button type="button" onClick={() => docInputRef.current?.click()}>Documento</button>
            <button type="button" onClick={openContactPicker}>Contato</button>
          </div>
        )}

        {showContactPicker && (
          <div className="modal-backdrop" onClick={() => setShowContactPicker(false)}>
            <div className="modal-card group-info-card" onClick={(e) => e.stopPropagation()}>
              <h2>Compartilhar contato</h2>
              <div className="chat-config-members">
                {shareableContacts.length === 0 && (
                  <span style={{ fontSize: '.8rem', color: '#8696a0' }}>você ainda não tem amigos</span>
                )}
                {shareableContacts.map((f) => (
                  <div key={f.id} className="chat-config-row" style={{ cursor: 'pointer' }} onClick={() => sendContactCard(f)}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                      <div className="photo" style={{ width: 32, height: 32, flexShrink: 0 }}>
                        {f.avatar_url ? <img src={f.avatar_url} alt="" /> : (f.username[0] || '?').toUpperCase()}
                      </div>
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.display_name || f.username}</span>
                    </div>
                  </div>
                ))}
              </div>
              <button type="button" onClick={() => setShowContactPicker(false)} style={{ marginTop: 10 }}>cancelar</button>
            </div>
          </div>
        )}

        {showEmoji && (
          <div className="emoji-picker" ref={emojiMenuRef}>
            {EMOJIS.map((e) => (
              <button
                key={e}
                type="button"
                onMouseEnter={() => pickEmojiPreview(e)}
                onMouseLeave={() => pickEmojiPreview(null)}
                onClick={() => appendEmoji(e)}
              >
                {e}
              </button>
            ))}
          </div>
        )}

        {showWinks && (
          <div className="emoji-picker wink-picker" ref={winkMenuRef}>
            <div className="wink-picker-tabs">
              <button type="button" className={winkPickerTab === 'winks' ? 'active' : ''} onClick={() => setWinkPickerTab('winks')}>Winks</button>
              <button type="button" className={winkPickerTab === 'stickers' ? 'active' : ''} onClick={() => setWinkPickerTab('stickers')}>Figurinhas</button>
              <button type="button" className={winkPickerTab === 'gifs' ? 'active' : ''} onClick={() => setWinkPickerTab('gifs')}>GIFs</button>
            </div>

            {winkPickerTab === 'winks' && (
              <div className="wink-picker-grid">
                {WINKS.map((w) => (
                  <button key={w.id} type="button" title={w.label} onClick={() => sendWink(w.id)}>
                    {w.emoji}
                  </button>
                ))}
                {customWinks.map((w) => (
                  <button
                    key={w.id}
                    type="button"
                    title={w.label}
                    className="wink-picker-custom"
                    onClick={() => sendCustomWink(w)}
                    onContextMenu={(e) => { e.preventDefault(); removeCustomWink(w.id) }}
                  >
                    <img src={w.imageData} alt="" />
                  </button>
                ))}
                <button type="button" title="Meus winks" className="wink-picker-add" onClick={openWinkManager}>
                  <IconPlus size={16} />
                </button>
              </div>
            )}

            {winkPickerTab === 'stickers' && (
              <div className="wink-picker-grid">
                {customStickers.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    title={s.label}
                    className="wink-picker-custom"
                    disabled={stickerSending}
                    onClick={() => sendSticker(s)}
                    onContextMenu={(e) => { e.preventDefault(); removeCustomSticker(s.id) }}
                  >
                    <img src={s.imageData} alt="" />
                  </button>
                ))}
                <button type="button" title="Minhas figurinhas" className="wink-picker-add" onClick={openStickerManager}>
                  <IconPlus size={16} />
                </button>
              </div>
            )}

            {winkPickerTab === 'gifs' && (
              <div className="gif-picker">
                <input
                  type="text"
                  placeholder="Buscar GIF..."
                  value={gifQuery}
                  onChange={(e) => setGifQuery(e.target.value)}
                />
                {gifLoading && <p className="gif-picker-status">carregando...</p>}
                {gifError && <p className="gif-picker-status error">{gifError}</p>}
                {!gifLoading && !gifError && gifResults.length === 0 && (
                  <p className="gif-picker-status">nenhum gif encontrado</p>
                )}
                <div className="gif-picker-grid">
                  {gifResults.map((g) => (
                    <button key={g.id} type="button" onClick={() => sendGif(g)}>
                      <img src={g.previewUrl} alt="" loading="lazy" />
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {winkManagerView === 'list' && (
          <div className="modal-backdrop" onClick={() => setWinkManagerView('closed')}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2>Meus winks</h2>
              <button type="button" className="primary" onClick={() => openWinkForm()}>+ Criar wink</button>
              <div className="wink-manager-list">
                {customWinks.length === 0 && <p style={{ color: '#8696a0', fontSize: '.85rem' }}>nenhum wink criado ainda</p>}
                {customWinks.map((w) => (
                  <button key={w.id} type="button" className="wink-manager-item" onClick={() => openWinkForm(w)}>
                    <img src={w.imageData} alt="" />
                    <span>{w.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setWinkManagerView('closed')}>fechar</button>
            </div>
          </div>
        )}

        {winkManagerView === 'form' && (
          <div className="modal-backdrop" onClick={() => setWinkManagerView('list')}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2>{editingWinkId ? 'Editar wink' : 'Criar wink'}</h2>
              <div className="new-conv-form">
                <input
                  type="text"
                  placeholder="Nome do wink"
                  value={newWinkLabel}
                  onChange={(e) => setNewWinkLabel(e.target.value)}
                />
                <input ref={winkImageInputRef} type="file" accept="image/*" hidden onChange={pickWinkImage} />
                <button type="button" onClick={() => winkImageInputRef.current?.click()}>
                  {newWinkImage ? 'Trocar imagem/gif' : 'Escolher imagem/gif'}
                </button>
                {newWinkImage && <img src={newWinkImage} alt="" style={{ maxWidth: 120, maxHeight: 120, alignSelf: 'center' }} />}
                <input ref={winkSoundInputRef} type="file" accept="audio/*" hidden onChange={pickWinkSound} />
                <button type="button" onClick={() => winkSoundInputRef.current?.click()}>
                  {newWinkSound ? 'Trocar som' : 'Escolher som (opcional)'}
                </button>
                {newWinkError && <p className="error">{newWinkError}</p>}
                <button type="button" className="primary" onClick={saveWinkForm}>Salvar wink</button>
                {editingWinkId && (
                  <button type="button" className="danger" onClick={() => removeCustomWink(editingWinkId)}>Excluir wink</button>
                )}
                <button type="button" onClick={() => setWinkManagerView('list')}>voltar</button>
              </div>
            </div>
          </div>
        )}

        {stickerManagerView === 'list' && (
          <div className="modal-backdrop" onClick={() => setStickerManagerView('closed')}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2>Minhas figurinhas</h2>
              <button type="button" className="primary" onClick={() => openStickerForm()}>+ Criar figurinha</button>
              <div className="wink-manager-list">
                {customStickers.length === 0 && <p style={{ color: '#8696a0', fontSize: '.85rem' }}>nenhuma figurinha criada ainda</p>}
                {customStickers.map((s) => (
                  <button key={s.id} type="button" className="wink-manager-item" onClick={() => openStickerForm(s)}>
                    <img src={s.imageData} alt="" />
                    <span>{s.label}</span>
                  </button>
                ))}
              </div>
              <button type="button" onClick={() => setStickerManagerView('closed')}>fechar</button>
            </div>
          </div>
        )}

        {stickerManagerView === 'form' && (
          <div className="modal-backdrop" onClick={() => setStickerManagerView('list')}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h2>{editingStickerId ? 'Editar figurinha' : 'Criar figurinha'}</h2>
              <div className="new-conv-form">
                <input
                  type="text"
                  placeholder="Nome da figurinha"
                  value={newStickerLabel}
                  onChange={(e) => setNewStickerLabel(e.target.value)}
                />
                <input ref={stickerImageInputRef} type="file" accept="image/*" hidden onChange={pickStickerImage} />
                <button type="button" onClick={() => stickerImageInputRef.current?.click()}>
                  {newStickerImage ? 'Trocar imagem/gif' : 'Escolher imagem/gif'}
                </button>
                {newStickerImage && <img src={newStickerImage} alt="" style={{ maxWidth: 120, maxHeight: 120, alignSelf: 'center' }} />}
                {newStickerError && <p className="error">{newStickerError}</p>}
                <button type="button" className="primary" onClick={saveStickerForm}>Salvar figurinha</button>
                {editingStickerId && (
                  <button type="button" className="danger" onClick={() => removeCustomSticker(editingStickerId)}>Excluir figurinha</button>
                )}
                <button type="button" onClick={() => setStickerManagerView('list')}>voltar</button>
              </div>
            </div>
          </div>
        )}
      </footer>

      {replayFor && (
        <div className="modal-backdrop" onClick={() => setReplayFor(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>replay: "{replayFor.content}"</h2>
            {replayEvents === null && <p>carregando...</p>}
            {replayEvents?.length === 0 && <p>sem hesitação registrada pra essa mensagem</p>}
            {replayEvents && replayEvents.length > 0 && <ReplayPlayer events={replayEvents} />}
            <button type="button" className="modal-close" onClick={() => setReplayFor(null)}>fechar</button>
          </div>
        </div>
      )}

      {expandedImage && (
        <div className="image-lightbox" onClick={() => setExpandedImage(null)}>
          <img src={expandedImage} alt="preview ao vivo expandido" />
        </div>
      )}

      {pendingEphemeralFile && (
        <div className="modal-backdrop" onClick={() => !ephemeralSending && setPendingEphemeralFile(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Enviar mídia temporária</h2>
            {pendingEphemeralFile.type.startsWith('image/') && (
              <img src={pendingFilePreviewUrl || ''} alt="" style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8 }} />
            )}
            {pendingEphemeralFile.type.startsWith('video/') && (
              <video src={pendingFilePreviewUrl || ''} controls style={{ maxWidth: '100%', maxHeight: 260, borderRadius: 8 }} />
            )}
            {!pendingEphemeralFile.type.startsWith('image/') && !pendingEphemeralFile.type.startsWith('video/') && (
              <p className="status">{pendingEphemeralFile.name}</p>
            )}
            <div className="ephemeral-mode-toggle" style={{ marginTop: 10 }}>
              <button
                type="button"
                className={`theme-option${!pendingViewOnce ? ' active' : ''}`}
                title="Some 10 minutos depois de aberta — dá pra baixar antes disso"
                onClick={() => setPendingViewOnce(false)}
              >
                <IconLockOpen size={18} />
              </button>
              <button
                type="button"
                className={`theme-option${pendingViewOnce ? ' active' : ''}`}
                title="Visualização única — some assim que for vista, sem opção de baixar"
                onClick={() => setPendingViewOnce(true)}
              >
                <IconLock size={18} />
              </button>
            </div>
            <p style={{ fontSize: '.75rem', color: 'var(--muted)', marginTop: 6 }}>
              {pendingViewOnce
                ? 'Some assim que for vista, sem opção de baixar.'
                : 'Some 10 minutos depois de aberta — dá pra baixar antes disso.'}
            </p>
            <div className="new-conv-form" style={{ marginTop: 10 }}>
              <button type="button" className="primary" disabled={ephemeralSending} onClick={sendEphemeralMedia}>
                {ephemeralSending ? 'Enviando...' : 'Enviar'}
              </button>
              <button type="button" disabled={ephemeralSending} onClick={() => setPendingEphemeralFile(null)}>cancelar</button>
            </div>
          </div>
        </div>
      )}

      {ephemeralViewer && (
        <div className="image-lightbox" onClick={() => setEphemeralViewer(null)}>
          <div onClick={(e) => e.stopPropagation()} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            {'url' in ephemeralViewer && ephemeralViewer.mediaType === 'image' && <img src={ephemeralViewer.url} alt="mídia temporária" />}
            {'url' in ephemeralViewer && ephemeralViewer.mediaType === 'video' && (
              <video src={ephemeralViewer.url} controls autoPlay style={{ maxWidth: '90vw', maxHeight: '80vh' }} />
            )}
            {'url' in ephemeralViewer && ephemeralViewer.mediaType === 'file' && (
              <p style={{ color: '#fff' }}>{ephemeralViewer.fileName || 'arquivo'}</p>
            )}
            {'url' in ephemeralViewer && ephemeralViewer.kind === 'timed' && (
              <a
                href={ephemeralViewer.url}
                download={ephemeralViewer.fileName || undefined}
                className="google-btn"
                style={{ textDecoration: 'none', textAlign: 'center' }}
              >
                Baixar
              </a>
            )}
          </div>
        </div>
      )}

      {profilePopupId && me && (
        <ProfilePopup
          me={me}
          userId={profilePopupId}
          onClose={() => setProfilePopupId(null)}
          onOpenCommunity={onOpenCommunity}
          blockedIds={blockedIds}
          onBlock={blockUser}
          conversationActions={
            (conversation.type === 'dm' || isOrganicGroup) && otherMemberEntry && profilePopupId === otherMemberEntry[0]
              ? {
                  groupLabel: isOrganicGroup ? `Grupo orgânico · ${Object.keys(members).length} membros` : undefined,
                  memberCount: Object.keys(members).length,
                  canInvite,
                  canManageBots,
                  installedBotNames: installedBots.map((bot) => bot.name),
                  onOpenMembers: () => {
                    setProfilePopupId(null)
                    setShowChatConfig(true)
                    setConfigView('members')
                  },
                  onOpenInvite: () => {
                    setProfilePopupId(null)
                    loadInviteFriends()
                    setShowChatConfig(true)
                    setConfigView('invite')
                  },
                  onOpenBots: () => {
                    setProfilePopupId(null)
                    loadCatalogBots()
                    setShowChatConfig(true)
                    setConfigView('bots')
                  },
                }
              : undefined
          }
        />
      )}

      {sonorCardOpen && sonorSession && (
        <div className="modal-backdrop" onClick={() => setSonorCardOpen(false)}>
          <div className="modal-card sonor-card" onClick={(e) => e.stopPropagation()}>
            <button type="button" className="icon-btn sonor-card-back" onClick={() => setSonorCardOpen(false)}>
              <IconArrowLeft size={20} />
            </button>
            <h3>{sonorSession.title}</h3>
            {sonorNowPlaying ? (
              <p className="sonor-card-song">{sonorNowPlaying}</p>
            ) : (
              <p className="sonor-card-song sonor-card-song-empty">nome da música não disponível nessa rádio</p>
            )}
            <a
              className="google-btn"
              href={youtubeSearchUrl(sonorNowPlaying || sonorSession.title)}
              target="_blank"
              rel="noreferrer"
            >
              {sonorNowPlaying ? 'Buscar música no YouTube' : 'Buscar rádio no YouTube'}
            </a>
            <div className="sonor-card-actions">
              <button type="button" className="google-btn" onClick={() => handleSonorCommand('salvar')}>
                Salvar rádio
              </button>
              {sonorNowPlaying && (
                <button type="button" className="google-btn" disabled={sonorSavingSong || sonorSongSaved} onClick={saveSonorSong}>
                  {sonorSongSaved ? 'Música salva' : sonorSavingSong ? 'Salvando…' : 'Salvar música'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </main>
  )
}
