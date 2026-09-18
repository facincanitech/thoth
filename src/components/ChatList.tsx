import { useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { supabase } from '../lib/supabase'
import thothLogo from '../../logo/toth_chat.png'
import { getErrorMessage } from '../lib/errors'
import { sanitizeImageUrl } from '../lib/imageUrl'
import { uploadImage } from '../lib/uploadImage'
import { displayName } from '../lib/displayName'
import { AvatarBox } from './AvatarBox'
import { NotificationCenter } from './NotificationCenter'
import { StatusView } from './StatusView'
import { StyledName, NAME_FONTS, NAME_EFFECTS } from './StyledName'
import { readCache, writeCache } from '../lib/cache'
import { APP_VERSION, APK_DOWNLOAD_URL } from '../version'
import { checkForUpdate } from '../lib/updateCheck'
import { downloadAndInstallUpdate } from '../lib/appUpdate'
import { isTauriDesktop } from '../lib/platform'
import {
  IconArchive,
  IconArrowLeft,
  IconBell,
  IconBellOff,
  IconChevronDown,
  IconEdit,
  IconGrip,
  IconPaint,
  IconGroup,
  IconHeart,
  IconKey,
  IconLock,
  IconMailUnread,
  IconMinusCircle,
  IconMore,
  IconPlus,
  IconSearch,
  IconTrash,
  IconUser,
} from './icons'
import type { Community, Conversation, PanelView, Profile } from '../types'

type AccountView = 'root' | 'profile' | 'appearance' | 'account' | 'privacy' | 'blocked' | 'terms' | 'privacy-policy'

export type GroupsView =
  | 'group-root' | 'group-create' | 'group-search' | 'group-trending' | 'group-mine'
  | 'community-root' | 'community-create' | 'community-search' | 'community-trending' | 'community-mine'

const BANNER_COLORS = [
  'linear-gradient(135deg,#36d1dc,#5b86e5)',
  'linear-gradient(135deg,#396afc,#c62d8f)',
  'linear-gradient(135deg,#43e97b,#38f9d7)',
  'linear-gradient(135deg,#f857a6,#ff5858)',
  'linear-gradient(135deg,#7f00ff,#e100ff)',
  'linear-gradient(135deg,#f7971e,#ffd200)',
  'linear-gradient(135deg,#0f2027,#2c5364)',
  'linear-gradient(135deg,#ff512f,#dd2476)',
]

const SOLID_COLORS = [
  '#5865f2', '#2f9e6e', '#9333ea', '#dc2626',
  '#0891b2', '#78716c', '#f59e0b', '#111827',
]

function ColorField({
  label,
  value,
  onPick,
  disableGradient,
  disableCustom,
}: {
  label: string
  value: string | null | undefined
  onPick: (v: string | null) => void
  disableGradient?: boolean
  disableCustom?: boolean
}) {
  const [open, setOpen] = useState<'gradient' | 'custom' | null>(null)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    function onOutside(e: MouseEvent | TouchEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(null)
    }
    document.addEventListener('mousedown', onOutside)
    document.addEventListener('touchstart', onOutside)
    return () => {
      document.removeEventListener('mousedown', onOutside)
      document.removeEventListener('touchstart', onOutside)
    }
  }, [open])

  useEffect(() => {
    if (disableGradient && open === 'gradient') setOpen(null)
    if (disableCustom && open === 'custom') setOpen(null)
  }, [disableGradient, disableCustom, open])

  const isGradient = !!value && value.startsWith('linear-gradient')
  const isCustom = !!value && value.startsWith('#')

  return (
    <div className="color-field" ref={ref}>
      <label>{label}</label>
      <div className="color-field-row">
        <button
          type="button"
          className={`color-field-btn${isGradient ? ' active' : ''}`}
          style={isGradient ? { backgroundImage: value } : undefined}
          disabled={disableGradient}
          onClick={() => setOpen((o) => (o === 'gradient' ? null : 'gradient'))}
        >
          Gradient
        </button>
        <button
          type="button"
          className={`color-field-btn${isCustom ? ' active' : ''}`}
          style={isCustom ? { background: value } : undefined}
          disabled={disableCustom}
          onClick={() => setOpen((o) => (o === 'custom' ? null : 'custom'))}
        >
          Cores
        </button>
      </div>
      {open === 'gradient' && (
        <div className="color-field-popup">
          <button
            type="button"
            className={`banner-color-swatch banner-color-reset${!value ? ' active' : ''}`}
            onClick={() => { onPick(null); setOpen(null) }}
            title="Padrão"
          >
            <IconMinusCircle size={14} />
          </button>
          {BANNER_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`banner-color-swatch${value === color ? ' active' : ''}`}
              style={{ background: color }}
              onClick={() => { onPick(color); setOpen(null) }}
            />
          ))}
        </div>
      )}
      {open === 'custom' && (
        <div className="color-field-popup">
          {SOLID_COLORS.map((color) => (
            <button
              key={color}
              type="button"
              className={`banner-color-swatch${value === color ? ' active' : ''}`}
              style={{ background: color }}
              onClick={() => { onPick(color); setOpen(null) }}
            />
          ))}
          <input
            type="color"
            value={isCustom ? value : '#5865f2'}
            onChange={(e) => onPick(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

type FilterKey = 'all' | 'favorites' | 'archived' | 'group' | 'communities'
const DEFAULT_FILTER_ORDER: FilterKey[] = ['all', 'favorites', 'archived', 'group', 'communities']
const FILTER_LABELS: Record<FilterKey, string> = {
  all: 'Todos',
  favorites: 'Favoritos',
  archived: 'Arquivo',
  group: 'Grupos',
  communities: 'Comunidades',
}

const COMMUNITY_CATEGORIES = [
  'Geral', 'Jogos', 'Música', 'Estudos', 'Tecnologia',
  'Esportes', 'Arte', 'Humor', 'Notícias', 'Filmes e séries',
]

type Props = {
  me: Profile | null
  selected: Conversation | null
  onSelect: (c: Conversation | null) => void
  panelOpen: boolean
  panelView: PanelView
  onPanelOpenChange: (open: boolean) => void
  onPanelViewChange: (view: PanelView) => void
  accountOpen: boolean
  onAccountOpenChange: (open: boolean) => void
  accountResetKey: number
  groupsOpen: boolean
  onGroupsOpenChange: (open: boolean) => void
  groupsRestoreView: GroupsView | null
  onConsumeGroupsRestore: () => void
  onLeaveGroupsPanel: (fromView: GroupsView) => void
  onProfileChange: (patch: Partial<Profile>) => void
  blockedIds: Set<string>
  onSelectCommunity: (c: Community) => void
  selectedCommunity: Community | null
  communityTab: 'home' | 'info' | 'members' | 'settings'
  onCommunityTabChange: (tab: 'home' | 'info' | 'members' | 'settings') => void
  onCommunityBack: () => void
  theme: 'dark' | 'light' | 'contrast' | 'frutiger'
  onThemeChange: (theme: 'dark' | 'light' | 'contrast' | 'frutiger') => void
  statusOpen: boolean
  onStatusOpenChange: (open: boolean) => void
  onOpenStatus: () => void
  onOpenGroupsTip: () => void
  onRequestInviteDemo: (c: Conversation) => void
}

type ConvWithLabel = Conversation & {
  label: string
  avatarUrl: string | null
  otherId: string | null
  nameStyleFont: string | null
  nameStyleEffect: 'solid' | 'gradient' | 'neon' | 'prism' | null
  nameStyleColor: string | null
  isFavorite: boolean
  favoritedAt: string | null
  isOrganicGroup: boolean
  isArchived: boolean
  isMuted: boolean
  isManuallyUnread: boolean
  unreadCount: number
  lastMessageAt: string | null
}
type FriendRequest = {
  id: string
  from_id: string
  from_profile: { id: string; username: string; email: string }
}
type OutgoingRequest = {
  id: string
  to_id: string
  status: string
  to_profile: { id: string; username: string; email: string }
}

type BlockedUser = { id: string; username: string; email: string }
type Friend = { id: string; username: string; display_name: string | null; avatar_url: string | null; name_style_color: string | null }

export function ChatList({
  me,
  selected,
  onSelect,
  panelOpen,
  panelView,
  onPanelOpenChange,
  onPanelViewChange,
  accountOpen,
  onAccountOpenChange,
  accountResetKey,
  groupsOpen,
  onGroupsOpenChange,
  groupsRestoreView,
  onConsumeGroupsRestore,
  onLeaveGroupsPanel,
  onProfileChange,
  blockedIds,
  onSelectCommunity,
  selectedCommunity,
  communityTab,
  onCommunityTabChange,
  onCommunityBack,
  theme,
  onThemeChange,
  statusOpen,
  onStatusOpenChange,
  onOpenStatus,
  onOpenGroupsTip,
  onRequestInviteDemo,
}: Props) {
  const [conversations, setConversations] = useState<ConvWithLabel[]>(() => {
    const lastUserId = (() => {
      try {
        return localStorage.getItem('flux-last-user-id')
      } catch {
        return null
      }
    })()
    if (!lastUserId) return []
    return readCache<ConvWithLabel[]>(`flux-conversations:${lastUserId}`) || []
  })
  const [groupsView, setGroupsView] = useState<GroupsView>('group-root')
  const [myGroups, setMyGroups] = useState<{ id: string; name: string; role: string | null; image_url: string | null }[]>([])
  const [newGroupName, setNewGroupName] = useState('')
  const [newGroupDesc, setNewGroupDesc] = useState('')
  const [newGroupImageUrl, setNewGroupImageUrl] = useState('')
  const [newGroupImageUploading, setNewGroupImageUploading] = useState(false)
  const [newGroupIsPublic, setNewGroupIsPublic] = useState(false)
  const newGroupImageInputRef = useRef<HTMLInputElement>(null)
  const [groupsBusy, setGroupsBusy] = useState(false)
  const [groupsError, setGroupsError] = useState<string | null>(null)
  const [trendingGroups, setTrendingGroups] = useState<{ id: string; name: string; image_url: string | null; member_count: number }[]>([])
  const [publicGroups, setPublicGroups] = useState<Conversation[]>([])
  const [groupQuery, setGroupQuery] = useState('')
  const [communities, setCommunities] = useState<Community[]>([])
  const [myCommunities, setMyCommunities] = useState<Community[]>([])
  const [communityMemberCount, setCommunityMemberCount] = useState(0)
  const [trendingCommunities, setTrendingCommunities] = useState<(Community & { comment_count: number })[]>([])
  const [newCommunityName, setNewCommunityName] = useState('')
  const [newCommunityDesc, setNewCommunityDesc] = useState('')
  const [newCommunityCategory, setNewCommunityCategory] = useState('')
  const [newCommunityImageUrl, setNewCommunityImageUrl] = useState('')
  const [newCommunityLanguage, setNewCommunityLanguage] = useState('Português (Brasil)')
  const [newCommunityIsPrivate, setNewCommunityIsPrivate] = useState(false)
  const [communityQuery, setCommunityQuery] = useState('')
  const [query, setQuery] = useState('')
  const [activeFilter, setActiveFilter] = useState<FilterKey>('all')
  const [filterOrder, setFilterOrder] = useState<FilterKey[]>(() => {
    try {
      const saved = localStorage.getItem('ferus-filter-order')
      if (saved) {
        const parsed = JSON.parse(saved) as FilterKey[]
        if (Array.isArray(parsed) && DEFAULT_FILTER_ORDER.every((k) => parsed.includes(k))) return parsed
      }
    } catch {
      // ignore
    }
    return DEFAULT_FILTER_ORDER
  })
  const [dragKey, setDragKey] = useState<FilterKey | null>(null)
  const draggedKeyRef = useRef<FilterKey | null>(null)
  const filtersRef = useRef<HTMLDivElement>(null)
  const [filterPopupOpen, setFilterPopupOpen] = useState(false)

  useEffect(() => {
    if (!filterPopupOpen) return
    function handleOutside(e: PointerEvent) {
      if (filtersRef.current && !filtersRef.current.contains(e.target as Node)) {
        setFilterPopupOpen(false)
      }
    }
    document.addEventListener('pointerdown', handleOutside, true)
    return () => document.removeEventListener('pointerdown', handleOutside, true)
  }, [filterPopupOpen])
  const VISIBLE_FILTER_COUNT = 3

  useEffect(() => {
    try {
      localStorage.setItem('ferus-filter-order', JSON.stringify(filterOrder))
    } catch {
      // ignore
    }
  }, [filterOrder])

  function startFilterDrag(key: FilterKey, container: HTMLDivElement) {
    draggedKeyRef.current = key
    setDragKey(key)

    function onMove(e: PointerEvent) {
      const dragged = draggedKeyRef.current
      if (!dragged) return
      const x = e.clientX
      const y = e.clientY
      const buttons = Array.from(container.querySelectorAll<HTMLElement>('[data-filter-key]'))
      let target: FilterKey | null = null
      for (const el of buttons) {
        const rect = el.getBoundingClientRect()
        if (x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom) {
          target = el.dataset.filterKey as FilterKey
          break
        }
      }
      if (target && target !== dragged) {
        setFilterOrder((prev) => {
          const next = [...prev]
          const from = next.indexOf(dragged)
          const to = next.indexOf(target!)
          next.splice(from, 1)
          next.splice(to, 0, dragged)
          return next
        })
      }
    }
    function onUp() {
      draggedKeyRef.current = null
      setDragKey(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const [chatOrder, setChatOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ferus-chat-order')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {
      // ignore
    }
    return []
  })
  const [dragChatId, setDragChatId] = useState<string | null>(null)
  const draggedChatIdRef = useRef<string | null>(null)
  const chatListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem('ferus-chat-order', JSON.stringify(chatOrder))
    } catch {
      // ignore
    }
  }, [chatOrder])

  const DESKTOP_SECTION_KEYS = ['favoritos', 'conversas', 'grupos', 'comunidades']
  const [desktopSectionOrder, setDesktopSectionOrder] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('ferus-desktop-section-order')
      if (saved) {
        const parsed = JSON.parse(saved)
        if (Array.isArray(parsed)) return parsed
      }
    } catch {
      // ignore
    }
    return []
  })
  const [desktopOpenSections, setDesktopOpenSections] = useState<Record<string, boolean>>(() => {
    try {
      const saved = localStorage.getItem('ferus-desktop-open-sections')
      if (saved) return JSON.parse(saved)
    } catch {
      // ignore
    }
    return {}
  })
  const [dragSectionId, setDragSectionId] = useState<string | null>(null)
  const draggedSectionIdRef = useRef<string | null>(null)
  const desktopContactListRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    try {
      localStorage.setItem('ferus-desktop-section-order', JSON.stringify(desktopSectionOrder))
    } catch {
      // ignore
    }
  }, [desktopSectionOrder])

  useEffect(() => {
    try {
      localStorage.setItem('ferus-desktop-open-sections', JSON.stringify(desktopOpenSections))
    } catch {
      // ignore
    }
  }, [desktopOpenSections])

  function startSectionDrag(key: string, container: HTMLDivElement) {
    draggedSectionIdRef.current = key
    setDragSectionId(key)

    function onMove(e: PointerEvent) {
      const dragged = draggedSectionIdRef.current
      if (!dragged) return
      const y = e.clientY
      const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-section-id]'))
      let target: string | null = null
      for (const el of rows) {
        const rect = el.getBoundingClientRect()
        if (y >= rect.top && y <= rect.bottom) {
          target = el.dataset.sectionId || null
          break
        }
      }
      if (target && target !== dragged) {
        setDesktopSectionOrder((prev) => {
          const base = prev.length ? prev : DESKTOP_SECTION_KEYS
          const next = [...base]
          if (!next.includes(dragged)) next.push(dragged)
          if (!next.includes(target!)) next.push(target!)
          const from = next.indexOf(dragged)
          const to = next.indexOf(target!)
          next.splice(from, 1)
          next.splice(to, 0, dragged)
          return next
        })
      }
    }
    function onUp() {
      draggedSectionIdRef.current = null
      setDragSectionId(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  function startChatDrag(id: string, container: HTMLDivElement, currentOrder: string[]) {
    draggedChatIdRef.current = id
    setDragChatId(id)

    function onMove(e: PointerEvent) {
      const dragged = draggedChatIdRef.current
      if (!dragged) return
      const y = e.clientY
      const rows = Array.from(container.querySelectorAll<HTMLElement>('[data-chat-id]'))
      let target: string | null = null
      for (const el of rows) {
        const rect = el.getBoundingClientRect()
        if (y >= rect.top && y <= rect.bottom) {
          target = el.dataset.chatId || null
          break
        }
      }
      if (target && target !== dragged) {
        setChatOrder((prev) => {
          const base = prev.length ? prev : currentOrder
          const next = [...base]
          if (!next.includes(dragged)) next.push(dragged)
          if (!next.includes(target!)) next.push(target!)
          const from = next.indexOf(dragged)
          const to = next.indexOf(target!)
          next.splice(from, 1)
          next.splice(to, 0, dragged)
          return next
        })
      }
    }
    function onUp() {
      draggedChatIdRef.current = null
      setDragChatId(null)
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
  }

  const [dmEmail, setDmEmail] = useState('')
  const [inviteSent, setInviteSent] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [friendEmail, setFriendEmail] = useState('')
  const [friendInfo, setFriendInfo] = useState<string | null>(null)
  const [incoming, setIncoming] = useState<FriendRequest[]>([])
  const [outgoing, setOutgoing] = useState<OutgoingRequest[]>([])
  const [friendsView, setFriendsView] = useState<'list' | 'add'>('list')
  const [friends, setFriends] = useState<Friend[]>([])
  const [openMenuId, setOpenMenuId] = useState<string | null>(null)
  const [contextMenu, setContextMenu] = useState<{ conv: ConvWithLabel; x: number; y: number } | null>(null)
  const [confirmDeleteConv, setConfirmDeleteConv] = useState<ConvWithLabel | null>(null)
  const [quickMenuOpen, setQuickMenuOpen] = useState(false)
  const [groupsQuickEntry, setGroupsQuickEntry] = useState(false)

  const [accountView, setAccountView] = useState<AccountView>('root')
  const pendingAccountViewRef = useRef<AccountView | null>(null)

  useEffect(() => {
    if (accountView !== 'appearance') return
    try {
      localStorage.setItem('ferus-visited-appearance', '1')
    } catch {
      // ignore
    }
  }, [accountView])
  const [latestVersion, setLatestVersion] = useState<string>(APP_VERSION)
  const [appUpdating, setAppUpdating] = useState(false)

  useEffect(() => {
    if (accountView !== 'account') return
    checkForUpdate(APP_VERSION).then((info) => {
      setLatestVersion(info.available && info.version ? info.version : APP_VERSION)
    })
  }, [accountView])

  async function handleAppUpdateClick() {
    setAppUpdating(true)
    try {
      await downloadAndInstallUpdate(APK_DOWNLOAD_URL)
    } catch (err) {
      console.error('update failed', err)
    } finally {
      setAppUpdating(false)
    }
  }
  const [usernameDraft, setUsernameDraft] = useState('')
  const [displayNameDraft, setDisplayNameDraft] = useState('')
  const [statusDraft, setStatusDraft] = useState('')
  const [ageDraft, setAgeDraft] = useState('')
  const [cityDraft, setCityDraft] = useState('')
  const [accountSaving, setAccountSaving] = useState(false)
  const [accountError, setAccountError] = useState<string | null>(null)
  const [confirmSignOut, setConfirmSignOut] = useState(false)
  const [confirmDeleteAccount, setConfirmDeleteAccount] = useState(false)
  const [deletingAccount, setDeletingAccount] = useState(false)
  const [deleteAccountError, setDeleteAccountError] = useState<string | null>(null)
  const [blocked, setBlocked] = useState<BlockedUser[]>([])
  const [avatarUploading, setAvatarUploading] = useState(false)
  const avatarInputRef = useRef<HTMLInputElement>(null)
  const [bannerColorDraft, setBannerColorDraft] = useState<string | null>(null)
  const [bannerImageDraft, setBannerImageDraft] = useState<string | null>(null)
  const [bannerImagePosDraft, setBannerImagePosDraft] = useState('50% 50%')
  const [bannerUploading, setBannerUploading] = useState(false)
  const [bannerSaving, setBannerSaving] = useState(false)
  const bannerInputRef = useRef<HTMLInputElement>(null)
  const bannerPreviewRef = useRef<HTMLDivElement>(null)
  const bannerDragRef = useRef<{ startX: number; startY: number; startPosX: number; startPosY: number } | null>(null)
  async function loadConversations() {
    if (!me) return
    const { data: memberRows } = await supabase
      .from('conversation_members')
      .select('role, conversation:conversations(*), is_favorite, favorited_at, archived_at, muted, manually_unread, deleted_at')
      .eq('user_id', me.id)
      .is('deleted_at', null)

    // grupos dedicados (com role) so aparecem em "ThothChat - Grupos", nao na lista de conversas
    const myRows = (memberRows || []).filter((r) => !r.role)
    const convs = myRows
      .map((row) => row.conversation as unknown as Conversation)
      .filter(Boolean)

    if (convs.length === 0) {
      setConversations([])
      writeCache(`flux-conversations:${me.id}`, [])
      return
    }

    const ids = convs.map((c) => c.id)

    const [{ data: unreadRows }, { data: lastMsgRows }] = await Promise.all([
      supabase.rpc('get_unread_counts', { p_user_id: me.id }),
      supabase.rpc('get_last_message_at', { p_conversation_ids: ids }),
    ])
    const unreadMap = new Map<string, number>(
      (unreadRows || []).map((r: { conversation_id: string; unread_count: number }) => [r.conversation_id, Number(r.unread_count)]),
    )
    const lastMsgMap = new Map<string, string>(
      (lastMsgRows || []).map((r: { conversation_id: string; last_message_at: string }) => [r.conversation_id, r.last_message_at]),
    )

    let allMembers: { conversation_id: string; added_by: string | null; role: string | null; profile: unknown }[] | null = null
    for (let attempt = 0; attempt < 3 && allMembers === null; attempt++) {
      if (attempt > 0) await new Promise((r) => setTimeout(r, 400 * attempt))
      const { data, error } = await supabase
        .from('conversation_members')
        .select('conversation_id, added_by, role, profile:profiles!conversation_members_user_id_fkey(id, username, display_name, avatar_url, name_style_font, name_style_effect, name_style_color)')
        .in('conversation_id', ids)
      if (error) {
        console.error('loadConversations: allMembers query failed', error)
        continue
      }
      allMembers = data
    }

    const labeled: ConvWithLabel[] = convs
      .map((c) => {
        const mine = myRows.find((r) => (r.conversation as unknown as Conversation)?.id === c.id)
        const isFavorite = !!mine?.is_favorite
        const favoritedAt = (mine?.favorited_at as string | null) || null
        const isArchived = !!mine?.archived_at
        const isMuted = !!mine?.muted
        const isManuallyUnread = !!mine?.manually_unread
        const unreadCount = unreadMap.get(c.id) || 0
        const lastMessageAt = lastMsgMap.get(c.id) || null
        const extra = { isFavorite, favoritedAt, isArchived, isMuted, isManuallyUnread, unreadCount, lastMessageAt }
        const membersOfConv = (allMembers || []).filter((m) => m.conversation_id === c.id)
        const anyOther = membersOfConv.find((m) => (m.profile as unknown as Profile)?.id !== me.id)

        if (c.type === 'group') {
          const myRole = membersOfConv.find((m) => (m.profile as unknown as Profile)?.id === me.id)?.role
          const isOrganicGroup = !myRole
          if (isOrganicGroup) {
            const original = membersOfConv.find(
              (m) => m.added_by === null && (m.profile as unknown as Profile)?.id !== me.id,
            )
            let p = original?.profile as unknown as Profile | undefined
            if (!p || p.id === me.id) p = anyOther?.profile as unknown as Profile | undefined
            return {
              ...c,
              label: p ? displayName(p) : 'conversa',
              avatarUrl: p?.avatar_url || null,
              otherId: p?.id || null,
              nameStyleFont: p?.name_style_font || null,
              nameStyleEffect: p?.name_style_effect || null,
              nameStyleColor: p?.name_style_color || null,
              ...extra,
              isOrganicGroup: true,
            }
          }
          return {
            ...c,
            label: c.name || 'grupo',
            avatarUrl: null,
            otherId: null,
            nameStyleFont: null,
            nameStyleEffect: null,
            nameStyleColor: null,
            ...extra,
            isOrganicGroup: false,
          }
        }
        const p = anyOther?.profile as unknown as Profile | undefined
        return {
          ...c,
          label: p ? displayName(p) : 'conversa',
          avatarUrl: p?.avatar_url || null,
          otherId: p?.id || null,
          nameStyleFont: p?.name_style_font || null,
          nameStyleEffect: p?.name_style_effect || null,
          nameStyleColor: p?.name_style_color || null,
          ...extra,
          isOrganicGroup: false,
        }
      })
      .sort((a, b) => ((a.lastMessageAt || a.created_at) < (b.lastMessageAt || b.created_at) ? 1 : -1))

    setConversations(labeled)
    writeCache(`flux-conversations:${me.id}`, labeled)
  }

  async function loadIncomingRequests() {
    if (!me) {
      setIncoming([])
      return
    }
    const { data } = await supabase
      .from('friend_requests')
      .select('id, from_id, from_profile:profiles!friend_requests_from_id_fkey(id, username, email)')
      .eq('to_id', me.id)
      .eq('status', 'pending')
    setIncoming((data as unknown as FriendRequest[]) || [])
  }

  async function loadOutgoingRequests() {
    if (!me) {
      setOutgoing([])
      return
    }
    const { data } = await supabase
      .from('friend_requests')
      .select('id, to_id, status, to_profile:profiles!friend_requests_to_id_fkey(id, username, email)')
      .eq('from_id', me.id)
      .neq('status', 'accepted')
    setOutgoing((data as unknown as OutgoingRequest[]) || [])
  }

  async function loadFriends() {
    if (!me) {
      setFriends([])
      return
    }
    const { data } = await supabase
      .from('friend_requests')
      .select(
        'from_id, to_id, from_profile:profiles!friend_requests_from_id_fkey(id, username, display_name, avatar_url, name_style_color), to_profile:profiles!friend_requests_to_id_fkey(id, username, display_name, avatar_url, name_style_color)',
      )
      .eq('status', 'accepted')
      .or(`from_id.eq.${me.id},to_id.eq.${me.id}`)

    setFriends(
      (data || []).map((row: any) =>
        row.from_id === me.id ? row.to_profile : row.from_profile,
      ),
    )
  }

  async function unfriend(id: string) {
    if (!me) return
    await supabase
      .from('friend_requests')
      .delete()
      .eq('status', 'accepted')
      .or(`and(from_id.eq.${me.id},to_id.eq.${id}),and(from_id.eq.${id},to_id.eq.${me.id})`)
    setFriends((prev) => prev.filter((f) => f.id !== id))
  }

  useEffect(() => {
    if (!me) return
    const cached = readCache<ConvWithLabel[]>(`flux-conversations:${me.id}`)
    if (cached) setConversations(cached)
  }, [me?.id])

  useEffect(() => {
    loadConversations()
    loadIncomingRequests()
    loadOutgoingRequests()
    loadFriends()
    loadCommunities()
    loadMyCommunities()
    loadMyGroups()
    if (!me) return
    const channel = supabase
      .channel(`member-updates:${me.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'conversation_members', filter: `user_id=eq.${me.id}` },
        () => loadConversations(),
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'conversations' },
        () => loadConversations(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages' },
        () => loadConversations(),
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'communities' },
        () => loadCommunities(),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `to_id=eq.${me.id}` },
        () => { loadIncomingRequests(); loadFriends() },
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'friend_requests', filter: `from_id=eq.${me.id}` },
        () => { loadOutgoingRequests(); loadFriends() },
      )
      .subscribe()
    return () => {
      supabase.removeChannel(channel)
    }
  }, [me?.id])

  function closePanel() {
    onPanelOpenChange(false)
    onPanelViewChange('root')
    setError(null)
    setInviteSent(false)
  }

  async function startDm() {
    if (!me) return
    setError(null)
    setBusy(true)
    setInviteSent(false)
    try {
      const email = dmEmail.trim().toLowerCase()
      if (!email) return
      if (email === me.email) throw new Error('Esse é você')

      const { data: found, error: findErr } = await supabase.rpc('find_profile_by_email', { p_email: email })
      if (findErr) throw findErr
      const target = found?.[0]

      if (target) {
        // reuse an existing DM (or organic group, which keeps the 1x1 essence) with this person instead of creating a duplicate
        const { data: myConvs } = await supabase
          .from('conversation_members')
          .select('conversation_id, role, conversation:conversations(type)')
          .eq('user_id', me.id)
        const myDmIds = (myConvs || [])
          .filter((r) => {
            const type = (r.conversation as unknown as Conversation)?.type
            return type === 'dm' || (type === 'group' && !r.role)
          })
          .map((r) => r.conversation_id)

        let existing: Conversation | null = null
        if (myDmIds.length > 0) {
          const { data: shared } = await supabase
            .from('conversation_members')
            .select('conversation_id, conversation:conversations(*)')
            .eq('user_id', target.id)
            .in('conversation_id', myDmIds)
            .limit(1)
          if (shared && shared.length > 0) existing = shared[0].conversation as unknown as Conversation
        }

        if (existing) {
          setDmEmail('')
          onSelect(existing)
          closePanel()
          return
        }

        const { data: friends } = await supabase.rpc('are_friends', { a: me.id, b: target.id })
        if (!friends) {
          const { data: sharesGroup } = await supabase.rpc('share_a_group', { a: me.id, b: target.id })
          if (sharesGroup) {
            throw new Error('Vocês estão no mesmo grupo mas ainda não são amigos — adicione como amigo antes de mandar mensagem direta.')
          }
        }
      }

      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ type: 'dm', created_by: me.id })
        .select()
        .single()
      if (convErr) throw convErr

      try {
        const { error: selfErr } = await supabase
          .from('conversation_members')
          .insert({ conversation_id: conv.id, user_id: me.id })
        if (selfErr) throw selfErr

        if (target) {
          const { error: memberErr } = await supabase
            .from('conversation_members')
            .insert({ conversation_id: conv.id, user_id: target.id })
          if (memberErr) throw memberErr
        } else {
          await supabase.auth.refreshSession()
          const { data: sessionData } = await supabase.auth.getSession()
          const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/invite-by-email`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${sessionData.session?.access_token}`,
              apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ email, conversationId: conv.id }),
          })
          const body = await res.json()
          if (!res.ok) throw new Error(body.error || 'Falha ao convidar')
          setInviteSent(true)
        }
      } catch (innerErr) {
        await supabase.from('conversations').delete().eq('id', conv.id)
        throw innerErr
      }

      setDmEmail('')
      await loadConversations()
      onSelect(conv as Conversation)
      closePanel()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function sendFriendRequest() {
    if (!me) return
    setError(null)
    setFriendInfo(null)
    setBusy(true)
    try {
      const email = friendEmail.trim().toLowerCase()
      if (!email) return
      if (email === me.email) throw new Error('Esse é você')

      const { data: found, error: findErr } = await supabase.rpc('find_profile_by_email', { p_email: email })
      if (findErr) throw findErr
      const target = found?.[0]
      if (!target) {
        setFriendInfo('Essa pessoa ainda não tem conta — use "Novo contato" pra convidar por email')
        return
      }

      const { error: reqErr } = await supabase
        .from('friend_requests')
        .insert({ from_id: me.id, to_id: target.id })

      if (reqErr) {
        if (!reqErr.message.includes('duplicate')) throw reqErr
        const { error: retryErr } = await supabase
          .from('friend_requests')
          .update({ status: 'pending' })
          .eq('from_id', me.id)
          .eq('to_id', target.id)
        if (retryErr) throw retryErr
      }

      setFriendEmail('')
      setFriendInfo('Solicitação enviada')
      await loadOutgoingRequests()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function retryRequest(req: OutgoingRequest) {
    setBusy(true)
    try {
      await supabase.from('friend_requests').update({ status: 'pending' }).eq('id', req.id)
      await loadOutgoingRequests()
    } finally {
      setBusy(false)
    }
  }

  async function blockUser(req: FriendRequest) {
    if (!me) return
    setBusy(true)
    try {
      await supabase.from('blocks').insert({ blocker_id: me.id, blocked_id: req.from_id })
      await supabase.from('friend_requests').update({ status: 'declined' }).eq('id', req.id)
      setOpenMenuId(null)
      await loadIncomingRequests()
    } finally {
      setBusy(false)
    }
  }

  async function acceptRequest(req: FriendRequest) {
    if (!me) return
    setError(null)
    setBusy(true)
    try {
      const { error: updateErr } = await supabase
        .from('friend_requests')
        .update({ status: 'accepted' })
        .eq('id', req.id)
      if (updateErr) throw updateErr

      // reuse an existing DM (or organic group, which keeps the 1x1 essence) with this person instead of creating a duplicate
      const { data: myConvs } = await supabase
        .from('conversation_members')
        .select('conversation_id, role, conversation:conversations(type)')
        .eq('user_id', me.id)
      const myDmIds = (myConvs || [])
        .filter((r) => {
          const type = (r.conversation as unknown as Conversation)?.type
          return type === 'dm' || (type === 'group' && !r.role)
        })
        .map((r) => r.conversation_id)

      let conv: Conversation | null = null
      if (myDmIds.length > 0) {
        const { data: shared } = await supabase
          .from('conversation_members')
          .select('conversation_id, conversation:conversations(*)')
          .eq('user_id', req.from_id)
          .in('conversation_id', myDmIds)
          .limit(1)
        if (shared && shared.length > 0) conv = shared[0].conversation as unknown as Conversation
      }

      if (!conv) {
        const { data: newConv, error: convErr } = await supabase
          .from('conversations')
          .insert({ type: 'dm', created_by: me.id })
          .select()
          .single()
        if (convErr) throw convErr

        const { error: membersErr } = await supabase
          .from('conversation_members')
          .insert([
            { conversation_id: newConv.id, user_id: me.id },
            { conversation_id: newConv.id, user_id: req.from_id },
          ])
        if (membersErr) throw membersErr
        conv = newConv as Conversation
      }

      await loadIncomingRequests()
      await loadConversations()
      onSelect(conv)
      closePanel()
    } catch (err) {
      setError(getErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  async function declineRequest(req: FriendRequest) {
    setBusy(true)
    try {
      await supabase.from('friend_requests').update({ status: 'declined' }).eq('id', req.id)
      await loadIncomingRequests()
    } finally {
      setBusy(false)
    }
  }

  async function deleteConversation(conv: ConvWithLabel) {
    if (!me) return
    await supabase
      .from('conversation_members')
      .update({ deleted_at: new Date().toISOString() })
      .eq('conversation_id', conv.id)
      .eq('user_id', me.id)
    setConversations((prev) => prev.filter((c) => c.id !== conv.id))
    if (selected?.id === conv.id) onSelect(null)
    setContextMenu(null)
  }

  async function archiveConversation(conv: ConvWithLabel) {
    if (!me) return
    const next = !conv.isArchived
    await supabase
      .from('conversation_members')
      .update({ archived_at: next ? new Date().toISOString() : null })
      .eq('conversation_id', conv.id)
      .eq('user_id', me.id)
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, isArchived: next } : c)))
    setContextMenu(null)
  }

  async function muteConversation(conv: ConvWithLabel) {
    if (!me) return
    const next = !conv.isMuted
    await supabase
      .from('conversation_members')
      .update({ muted: next })
      .eq('conversation_id', conv.id)
      .eq('user_id', me.id)
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, isMuted: next } : c)))
    setContextMenu(null)
  }

  async function markUnread(conv: ConvWithLabel) {
    if (!me) return
    await supabase
      .from('conversation_members')
      .update({ manually_unread: true })
      .eq('conversation_id', conv.id)
      .eq('user_id', me.id)
    setConversations((prev) => prev.map((c) => (c.id === conv.id ? { ...c, isManuallyUnread: true } : c)))
    setContextMenu(null)
  }

  function selectConversation(c: ConvWithLabel) {
    onSelect(c)
    setConversations((prev) =>
      prev.map((conv) => (conv.id === c.id ? { ...conv, unreadCount: 0, isManuallyUnread: false } : conv)),
    )
  }

  function handleContextMenu(e: React.MouseEvent, conv: ConvWithLabel) {
    e.preventDefault()
    const rect = e.currentTarget.getBoundingClientRect()
    const estimatedMenuHeight = 230
    const y = e.clientY + estimatedMenuHeight > window.innerHeight
      ? Math.max(8, e.clientY - estimatedMenuHeight)
      : e.clientY
    setContextMenu({ conv, x: rect.left + 12, y })
  }

  function goBack() {
    if (panelView === 'friends' && friendsView === 'add') {
      setFriendsView('list')
      setError(null)
      return
    }
    if (panelView === 'root') closePanel()
    else {
      onPanelViewChange('root')
      setError(null)
    }
  }

  useEffect(() => {
    if (accountOpen && me) {
      setUsernameDraft(me.username)
      setDisplayNameDraft(me.display_name || '')
      setStatusDraft(me.status || '')
      setAgeDraft(me.age != null ? String(me.age) : '')
      setCityDraft(me.city || '')
      setBannerColorDraft(me.banner_color || null)
      setBannerImageDraft(me.banner_image_url || null)
      setBannerImagePosDraft(me.banner_image_position || '50% 50%')
      setAccountView(pendingAccountViewRef.current || 'root')
      pendingAccountViewRef.current = null
      setAccountError(null)
      setConfirmSignOut(false)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [accountOpen, me?.id, accountResetKey])

  async function loadMyGroups() {
    if (!me) return
    const { data } = await supabase
      .from('conversation_members')
      .select('role, conversation:conversations(id, name, image_url)')
      .eq('user_id', me.id)
      .not('role', 'is', null)
    setMyGroups(
      (data || []).map((row) => {
        const c = row.conversation as unknown as Conversation
        return { id: c.id, name: c.name || 'grupo', role: row.role as string | null, image_url: c.image_url || null }
      }),
    )
  }

  useEffect(() => {
    if (!selectedCommunity) {
      setCommunityMemberCount(0)
      return
    }
    supabase
      .from('community_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('community_id', selectedCommunity.id)
      .then(({ count }) => setCommunityMemberCount(count || 0))
  }, [selectedCommunity?.id])

  async function loadCommunities() {
    const { data } = await supabase.from('communities').select('*').order('created_at', { ascending: false })
    setCommunities((data as Community[]) || [])
  }

  async function loadMyCommunities() {
    if (!me) return
    const { data } = await supabase
      .from('community_members')
      .select('community:communities(*)')
      .eq('user_id', me.id)
    setMyCommunities(
      (data || [])
        .map((row) => row.community as unknown as Community)
        .filter(Boolean),
    )
  }

  async function loadTrendingCommunities() {
    const { data } = await supabase.rpc('get_trending_communities', { p_limit: 5 })
    setTrendingCommunities((data as (Community & { comment_count: number })[]) || [])
  }

  async function loadPublicGroups() {
    const { data } = await supabase
      .from('conversations')
      .select('*')
      .eq('type', 'group')
      .eq('is_public', true)
      .order('created_at', { ascending: false })
    setPublicGroups((data as Conversation[]) || [])
  }

  async function loadTrendingGroups() {
    const { data } = await supabase.rpc('get_trending_public_groups', { p_limit: 5 })
    setTrendingGroups((data as { id: string; name: string; image_url: string | null; member_count: number }[]) || [])
  }

  async function joinPublicGroup(g: Conversation) {
    if (!me) return
    setGroupsBusy(true)
    setGroupsError(null)
    try {
      if (g.invite_requires_approval) {
        await supabase.from('conversation_join_requests').insert({ conversation_id: g.id, user_id: me.id })
        alert(`Pedido pra entrar em "${g.name}" enviado — aguarde um admin aceitar.`)
        return
      }
      await supabase.from('conversation_members').insert({ conversation_id: g.id, user_id: me.id, role: 'member' })
      onLeaveGroupsPanel('group-search')
      onSelect(g)
      loadMyGroups()
    } catch (err) {
      setGroupsError(getErrorMessage(err))
    } finally {
      setGroupsBusy(false)
    }
  }

  useEffect(() => {
    if (!groupsOpen) setGroupsQuickEntry(false)
  }, [groupsOpen])

  useEffect(() => {
    if (groupsOpen && me) {
      if (!groupsQuickEntry) setGroupsView('group-root')
      setGroupsError(null)
      setNewGroupName('')
      setNewGroupDesc('')
      setNewGroupImageUrl('')
      setNewGroupIsPublic(false)
      setNewCommunityName('')
      setNewCommunityDesc('')
      setNewCommunityCategory('')
      setNewCommunityImageUrl('')
      setNewCommunityLanguage('Português (Brasil)')
      setNewCommunityIsPrivate(false)
      loadMyGroups()
      loadCommunities()
      loadMyCommunities()
      loadTrendingCommunities()
      loadPublicGroups()
      loadTrendingGroups()
    }
  }, [groupsOpen, me?.id])

  useEffect(() => {
    if (groupsOpen && groupsRestoreView) {
      setGroupsView(groupsRestoreView)
      onConsumeGroupsRestore()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupsOpen, groupsRestoreView])

  async function createCommunity() {
    if (!me) return
    const name = newCommunityName.trim()
    if (!name) return
    setGroupsBusy(true)
    setGroupsError(null)
    try {
      const { data: community, error: err } = await supabase
        .from('communities')
        .insert({
          name,
          description: newCommunityDesc.trim() || null,
          category: newCommunityCategory.trim() || null,
          image_url: sanitizeImageUrl(newCommunityImageUrl),
          language: newCommunityLanguage.trim() || null,
          is_private: newCommunityIsPrivate,
          created_by: me.id,
        })
        .select()
        .single()
      if (err) throw err

      await supabase.from('community_members').insert({ community_id: community.id, user_id: me.id })

      onGroupsOpenChange(false)
      onSelectCommunity(community as Community)
    } catch (err) {
      setGroupsError(getErrorMessage(err))
    } finally {
      setGroupsBusy(false)
    }
  }

  async function uploadNewGroupImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !me) return
    setNewGroupImageUploading(true)
    try {
      const url = await uploadImage(file, me.id, 'group')
      setNewGroupImageUrl(url)
    } catch (err) {
      setGroupsError(getErrorMessage(err))
    } finally {
      setNewGroupImageUploading(false)
      if (newGroupImageInputRef.current) newGroupImageInputRef.current.value = ''
    }
  }

  async function createGroup2() {
    if (!me) return
    const name = newGroupName.trim()
    if (!name) return
    setGroupsBusy(true)
    setGroupsError(null)
    try {
      const { data: conv, error: convErr } = await supabase
        .from('conversations')
        .insert({ type: 'group', name, description: newGroupDesc.trim() || null, image_url: sanitizeImageUrl(newGroupImageUrl), is_public: newGroupIsPublic, created_by: me.id })
        .select()
        .single()
      if (convErr) throw convErr

      const { error: memberErr } = await supabase
        .from('conversation_members')
        .insert({ conversation_id: conv.id, user_id: me.id, role: 'admin' })
      if (memberErr) throw memberErr

      onGroupsOpenChange(false)
      await loadConversations()
      onSelect(conv as Conversation)
    } catch (err) {
      setGroupsError(getErrorMessage(err))
    } finally {
      setGroupsBusy(false)
    }
  }

  async function saveProfile() {
    if (!me) return
    setAccountSaving(true)
    setAccountError(null)
    const display_name = displayNameDraft.trim()
    const username = usernameDraft.trim()
    const status = statusDraft.trim()
    const trimmedAge = ageDraft.trim()
    const age = trimmedAge ? parseInt(trimmedAge, 10) : null
    const city = cityDraft.trim() || null
    const { error: err } = await supabase
      .from('profiles')
      .update({ display_name, username, status, age, city })
      .eq('id', me.id)
    if (err) {
      setAccountError(err.message.includes('duplicate') ? 'Esse nome de usuário já está em uso' : getErrorMessage(err))
    } else {
      onProfileChange({ display_name, username, status, age, city })
    }
    setAccountSaving(false)
  }

  async function uploadAvatar(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !me) return
    setAvatarUploading(true)
    setAccountError(null)
    try {
      const url = await uploadImage(file, me.id, 'avatar')
      const avatar_url = `${url}?t=${Date.now()}`

      const { error: updateErr } = await supabase.from('profiles').update({ avatar_url }).eq('id', me.id)
      if (updateErr) throw updateErr

      onProfileChange({ avatar_url })
    } catch (err) {
      setAccountError(getErrorMessage(err))
    } finally {
      setAvatarUploading(false)
      if (avatarInputRef.current) avatarInputRef.current.value = ''
    }
  }

  async function resetBannerToDefault() {
    if (!me) return
    setBannerSaving(true)
    setAccountError(null)
    try {
      const { error: err } = await supabase.from('profiles').update({ banner_color: null, banner_image_url: null }).eq('id', me.id)
      if (err) throw err
      setBannerColorDraft(null)
      setBannerImageDraft(null)
      onProfileChange({ banner_color: null, banner_image_url: null })
    } catch (err) {
      console.error('resetBannerToDefault failed', err)
      setAccountError(getErrorMessage(err))
    } finally {
      setBannerSaving(false)
    }
  }

  async function setAppColor(
    field:
      | 'app_bg_color'
      | 'app_sidebar_color'
      | 'app_button_color'
      | 'app_card_color'
      | 'app_incoming_color'
      | 'app_outgoing_color'
      | 'app_text_size',
    value: string | null,
  ) {
    if (!me) return
    try {
      const { error: err } = await supabase.from('profiles').update({ [field]: value }).eq('id', me.id)
      if (err) throw err
      onProfileChange({ [field]: value })
    } catch (err) {
      console.error('setAppColor failed', err)
      setAccountError(getErrorMessage(err))
    }
  }

  async function setNameStyle(field: 'name_style_font' | 'name_style_effect' | 'name_style_color', value: string | null) {
    if (!me) return
    try {
      const { error: err } = await supabase.from('profiles').update({ [field]: value }).eq('id', me.id)
      if (err) throw err
      onProfileChange({ [field]: value })
    } catch (err) {
      console.error('setNameStyle failed', err)
      setAccountError(getErrorMessage(err))
    }
  }

  async function setBannerColor(color: string) {
    if (!me) return
    setBannerSaving(true)
    setAccountError(null)
    try {
      const { error: err } = await supabase.from('profiles').update({ banner_color: color, banner_image_url: null }).eq('id', me.id)
      if (err) throw err
      setBannerColorDraft(color)
      setBannerImageDraft(null)
      onProfileChange({ banner_color: color, banner_image_url: null })
    } catch (err) {
      console.error('setBannerColor failed', err)
      setAccountError(getErrorMessage(err))
    } finally {
      setBannerSaving(false)
    }
  }

  async function uploadBannerImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !me) return
    setBannerUploading(true)
    setAccountError(null)
    try {
      const path = `${me.id}/banner`
      const { error: uploadErr } = await supabase.storage
        .from('avatars')
        .upload(path, file, { upsert: true, cacheControl: '3600' })
      if (uploadErr) throw uploadErr

      const { data } = supabase.storage.from('avatars').getPublicUrl(path)
      const banner_image_url = `${data.publicUrl}?t=${Date.now()}`

      const { error: updateErr } = await supabase
        .from('profiles')
        .update({ banner_image_url, banner_image_position: '50% 50%' })
        .eq('id', me.id)
      if (updateErr) throw updateErr

      setBannerImageDraft(banner_image_url)
      setBannerImagePosDraft('50% 50%')
      onProfileChange({ banner_image_url, banner_image_position: '50% 50%' })
    } catch (err) {
      setAccountError(getErrorMessage(err))
    } finally {
      setBannerUploading(false)
      if (bannerInputRef.current) bannerInputRef.current.value = ''
    }
  }

  async function removeBannerImage() {
    if (!me) return
    await supabase.from('profiles').update({ banner_image_url: null }).eq('id', me.id)
    setBannerImageDraft(null)
    onProfileChange({ banner_image_url: null })
  }

  function parseBannerPos(pos: string): [number, number] {
    const [x, y] = pos.split(' ').map((p) => parseFloat(p))
    return [Number.isFinite(x) ? x : 50, Number.isFinite(y) ? y : 50]
  }

  function handleBannerPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!bannerImageDraft) return
    const [x, y] = parseBannerPos(bannerImagePosDraft)
    bannerDragRef.current = { startX: e.clientX, startY: e.clientY, startPosX: x, startPosY: y }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function handleBannerPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    const drag = bannerDragRef.current
    if (!drag || !bannerPreviewRef.current) return
    const rect = bannerPreviewRef.current.getBoundingClientRect()
    const dxPct = ((e.clientX - drag.startX) / rect.width) * 100
    const dyPct = ((e.clientY - drag.startY) / rect.height) * 100
    const nextX = Math.min(100, Math.max(0, drag.startPosX + dxPct))
    const nextY = Math.min(100, Math.max(0, drag.startPosY + dyPct))
    setBannerImagePosDraft(`${nextX.toFixed(0)}% ${nextY.toFixed(0)}%`)
  }

  async function handleBannerPointerUp() {
    if (!bannerDragRef.current) return
    bannerDragRef.current = null
    if (!me) return
    await supabase.from('profiles').update({ banner_image_position: bannerImagePosDraft }).eq('id', me.id)
    onProfileChange({ banner_image_position: bannerImagePosDraft })
  }

  async function openBlocked() {
    if (!me) return
    setAccountView('blocked')
    const { data } = await supabase
      .from('blocks')
      .select('blocked:profiles!blocks_blocked_id_fkey(id, username, email)')
      .eq('blocker_id', me.id)
    setBlocked(((data as unknown as { blocked: BlockedUser }[]) || []).map((r) => r.blocked))
  }

  async function unblock(id: string) {
    if (!me) return
    await supabase.from('blocks').delete().eq('blocker_id', me.id).eq('blocked_id', id)
    setBlocked((prev) => prev.filter((b) => b.id !== id))
    onAccountOpenChange(false)
  }

  async function deleteAccount() {
    setDeletingAccount(true)
    setDeleteAccountError(null)
    try {
      await supabase.auth.refreshSession()
      const { data: sessionData } = await supabase.auth.getSession()
      const res = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/delete-account`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${sessionData.session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
      })
      const body = await res.json()
      if (!res.ok) throw new Error(body.error || 'Falha ao excluir conta')
      await supabase.auth.signOut()
    } catch (err) {
      setDeleteAccountError(err instanceof Error ? err.message : 'Falha ao excluir conta')
      setDeletingAccount(false)
    }
  }

  async function switchAccount() {
    await supabase.auth.signOut()
    const redirectTo = Capacitor.isNativePlatform()
      ? 'ferus://callback'
      : `${window.location.origin}${import.meta.env.BASE_URL}`
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo, queryParams: { prompt: 'select_account' } },
    })
  }

  function accountGoBack() {
    if (accountView === 'terms' || accountView === 'privacy-policy') setAccountView('privacy')
    else if (accountView === 'blocked') setAccountView('account')
    else if (accountView === 'root') onAccountOpenChange(false)
    else setAccountView('root')
  }

  const accountTitle =
    accountView === 'root'
      ? 'Perfil'
      : accountView === 'profile'
        ? 'Conta'
        : accountView === 'appearance'
          ? 'Aparência'
        : accountView === 'account'
          ? 'Configurações'
          : accountView === 'privacy'
            ? 'Privacidade'
            : accountView === 'terms'
              ? 'Termos de Uso'
              : accountView === 'privacy-policy'
                ? 'Política de Privacidade'
                : 'Bloqueados'

  async function toggleFavorite(c: ConvWithLabel) {
    if (!me) return
    const next = !c.isFavorite
    const favoritedAt = next ? new Date().toISOString() : null
    await supabase
      .from('conversation_members')
      .update({ is_favorite: next, favorited_at: favoritedAt })
      .eq('conversation_id', c.id)
      .eq('user_id', me.id)
    setConversations((prev) =>
      prev.map((conv) => (conv.id === c.id ? { ...conv, isFavorite: next, favoritedAt } : conv)),
    )
    setContextMenu(null)
  }

  const filtered = conversations
    .filter((c) => !(c.otherId && blockedIds.has(c.otherId)))
    .filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
    .filter((c) => {
      if (activeFilter === 'archived') return c.isArchived
      if (activeFilter === 'favorites') return c.isFavorite
      if (activeFilter === 'group') return c.type === 'group' && !c.isOrganicGroup
      return !c.isArchived
    })
    .sort((a, b) => {
      if (activeFilter === 'favorites') return (a.favoritedAt || '').localeCompare(b.favoritedAt || '')
      if (chatOrder.length) {
        const ia = chatOrder.indexOf(a.id)
        const ib = chatOrder.indexOf(b.id)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
      }
      if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1
      if (a.isFavorite) return a.label.localeCompare(b.label, 'pt-BR')
      return 0
    })

  const panelTitle =
    panelView === 'root'
      ? 'Nova conversa'
      : panelView === 'contact'
        ? 'Novo contato'
        : panelView === 'group'
          ? 'Novo grupo'
          : (friendsView === 'add' ? 'Adicionar amigo' : 'Amigos')

  if (isTauriDesktop && !me) {
    async function handleDesktopGoogleLogin() {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: 'https://facincanitech.github.io/thothchat/?desktop=1', queryParams: { prompt: 'select_account' }, skipBrowserRedirect: true },
      })
      if (error || !data?.url) return
      const { open } = await import('@tauri-apps/plugin-shell')
      await open(data.url)
    }
    return (
      <section className="msn-login-screen">
        <img src={thothLogo} alt="" className="msn-login-logo" />
        <h1>ThothChat Messenger</h1>
        <button type="button" className="msn-login-google" onClick={handleDesktopGoogleLogin}>
          Entrar com Google
        </button>
      </section>
    )
  }

  if (isTauriDesktop) {
    const sortByChatOrder = <T extends { id: string }>(items: T[]): T[] => {
      if (!chatOrder.length) return items
      return [...items].sort((a, b) => {
        const ia = chatOrder.indexOf(a.id)
        const ib = chatOrder.indexOf(b.id)
        if (ia !== -1 && ib !== -1) return ia - ib
        if (ia !== -1) return -1
        if (ib !== -1) return 1
        return 0
      })
    }
    const favoriteConvs = sortByChatOrder(conversations.filter((c) => c.isFavorite && !c.isArchived))
    const regularConvs = sortByChatOrder(conversations.filter((c) => !c.isFavorite && !c.isArchived && c.type === 'dm'))
    const groupConvs = sortByChatOrder(conversations.filter((c) => c.type === 'group' && !c.isArchived))
    const sortedCommunities = sortByChatOrder(myCommunities)
    const q = query.toLowerCase()
    const matches = (label: string) => label.toLowerCase().includes(q)
    const allDraggableIds = [...favoriteConvs, ...regularConvs, ...groupConvs, ...sortedCommunities].map((c) => c.id)

    const contactRow = (id: string, label: string, avatarUrl: string | null | undefined, unreadCount: number, onClick: () => void) => (
      <button key={id} type="button" data-chat-id={id} className={`msn-contact${dragChatId === id ? ' dragging' : ''}`} onClick={onClick}>
        <span
          className="msn-contact-grip"
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => {
            e.preventDefault()
            e.stopPropagation()
            if (desktopContactListRef.current) startChatDrag(id, desktopContactListRef.current, allDraggableIds)
          }}
        >
          <IconGrip size={12} />
        </span>
        <AvatarBox src={avatarUrl} id={id} fallbackLetter={label[0]?.toUpperCase()} className="msn-contact-avatar" />
        <div className="msn-contact-info">
          <strong>{label}</strong>
        </div>
        {unreadCount > 0 && <b className="msn-unread">{unreadCount}</b>}
      </button>
    )

    const sectionTitle: Record<string, string> = { favoritos: 'Favoritos', conversas: 'Conversas', grupos: 'Grupos', comunidades: 'Comunidades' }
    const sectionCount: Record<string, number> = {
      favoritos: favoriteConvs.length,
      conversas: regularConvs.length,
      grupos: groupConvs.length,
      comunidades: sortedCommunities.length,
    }
    const orderedSectionKeys = (() => {
      const saved = desktopSectionOrder.filter((k) => DESKTOP_SECTION_KEYS.includes(k))
      const rest = DESKTOP_SECTION_KEYS.filter((k) => !saved.includes(k))
      return [...saved, ...rest]
    })().filter((k) => k === 'conversas' || sectionCount[k] > 0)

    const sectionContent = (key: string) => {
      if (key === 'favoritos') return favoriteConvs.filter((c) => matches(c.label)).map((c) => contactRow(c.id, c.label, c.avatarUrl, c.unreadCount, () => onSelect(c)))
      if (key === 'conversas') {
        if (regularConvs.length === 0) return <p className="msn-empty">nenhuma conversa ainda</p>
        return regularConvs.filter((c) => matches(c.label)).map((c) => contactRow(c.id, c.label, c.avatarUrl, c.unreadCount, () => onSelect(c)))
      }
      if (key === 'grupos') return groupConvs.filter((c) => matches(c.label)).map((c) => contactRow(c.id, c.label, c.avatarUrl, c.unreadCount, () => onSelect(c)))
      return sortedCommunities.filter((c) => matches(c.name || '')).map((c) => contactRow(c.id, c.name || '', c.image_url, 0, () => onSelectCommunity(c)))
    }

    return (
      <section className="msn-contacts-window">
        <div className="msn-identity-card">
          <div className="msn-avatar-me">
            {me?.avatar_url ? <img src={me.avatar_url} alt="" /> : (me?.display_name || me?.username || 'V')[0]?.toUpperCase()}
          </div>
          <div className="msn-identity-copy">
            <strong>{me ? displayName(me) : 'Você'}</strong>
            <span className="msn-presence">{me?.status || 'Disponível'}</span>
          </div>
          <button type="button" className="msn-mail-button" title="Notificações" onClick={() => onAccountOpenChange(true)}>
            <IconBell size={18} />
          </button>
        </div>
        <div className="msn-search-row">
          <input type="search" placeholder="Pesquisar contatos ou conversas" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        {incoming.length > 0 && (
          <div className="msn-notice">
            Você tem {incoming.length} {incoming.length === 1 ? 'convite novo' : 'convites novos'}.{' '}
            <button type="button" onClick={() => { setFriendsView('list'); onPanelViewChange('friends'); onPanelOpenChange(true) }}>Ver agora</button>
          </div>
        )}
        <section className="msn-contact-list" ref={desktopContactListRef}>
          {orderedSectionKeys.map((key) => {
            const open = desktopOpenSections[key] !== false
            return (
              <details key={key} open={open} data-section-id={key} className={dragSectionId === key ? 'dragging' : ''}>
                <summary
                  className="msn-contact-group-title"
                  onClick={(e) => {
                    e.preventDefault()
                    setDesktopOpenSections((prev) => ({ ...prev, [key]: !open }))
                  }}
                >
                  <span
                    className="msn-section-grip"
                    onClick={(e) => e.stopPropagation()}
                    onPointerDown={(e) => {
                      e.preventDefault()
                      e.stopPropagation()
                      if (desktopContactListRef.current) startSectionDrag(key, desktopContactListRef.current)
                    }}
                  >
                    <IconGrip size={12} />
                  </span>
                  <span className={`msn-section-chevron${open ? ' open' : ''}`}><IconChevronDown size={13} /></span>
                  {sectionTitle[key]} <small>{sectionCount[key]}</small>
                </summary>
                {sectionContent(key)}
              </details>
            )
          })}
        </section>
      </section>
    )
  }

  return (
    <section className="chats">
      {selectedCommunity ? (
        <div className="community-sidebar">
          <div className="community-sidebar-topbar">
            <button type="button" className="icon-btn" onClick={onCommunityBack}>
              <IconArrowLeft size={20} />
            </button>
          </div>
          <AvatarBox src={selectedCommunity.image_url} id={selectedCommunity.id} fallbackLetter={(selectedCommunity.name || "C")[0]?.toUpperCase()} className="community-sidebar-photo" />
          <div className="community-sidebar-box">
            <div className="community-sidebar-name">{selectedCommunity.name}</div>
            <div className="community-sidebar-count">
              {communityMemberCount} {communityMemberCount === 1 ? 'membro' : 'membros'}
            </div>
            <button
              type="button"
              className={`community-sidebar-nav${communityTab === 'home' ? ' active' : ''}`}
              onClick={() => onCommunityTabChange('home')}
            >
              Tópicos
            </button>
            <button
              type="button"
              className={`community-sidebar-nav${communityTab === 'info' ? ' active' : ''}`}
              onClick={() => onCommunityTabChange('info')}
            >
              Informações
            </button>
            <button
              type="button"
              className={`community-sidebar-nav${communityTab === 'members' ? ' active' : ''}`}
              onClick={() => onCommunityTabChange('members')}
            >
              Membros
            </button>
            <button
              type="button"
              className={`community-sidebar-nav${communityTab === 'settings' ? ' active' : ''}`}
              onClick={() => onCommunityTabChange('settings')}
            >
              Configurações
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="top">
            <div className="brand-lockup">
              <div className="brand">ThothChat</div>
              <div className="brand-caption">Conversa de verdade, ao vivo.</div>
            </div>
            <div style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
              <button type="button" className="icon-btn" title="Atalhos" onClick={() => setQuickMenuOpen((v) => !v)}>
                <IconMore size={20} />
              </button>
              {quickMenuOpen && (
                <>
                  <div style={{ position: 'fixed', inset: 0, zIndex: 5 }} onClick={() => setQuickMenuOpen(false)} />
                  <div className="request-menu quick-actions-menu" style={{ top: 44, right: 0, zIndex: 6 }}>
                    <button
                      type="button"
                      onClick={() => { setQuickMenuOpen(false); onPanelOpenChange(true); onPanelViewChange('contact') }}
                    >
                      <IconUser size={17} />
                      <span>Novo contato</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setQuickMenuOpen(false); setGroupsQuickEntry(true); onGroupsOpenChange(true); setGroupsView('group-create') }}
                    >
                      <IconGroup size={17} />
                      <span>Criar grupo</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setQuickMenuOpen(false); setGroupsQuickEntry(true); onGroupsOpenChange(true); setGroupsView('group-mine') }}
                    >
                      <IconGroup size={17} />
                      <span>Meus grupos</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setQuickMenuOpen(false); setGroupsQuickEntry(true); onGroupsOpenChange(true); setGroupsView('group-trending') }}
                    >
                      <IconGroup size={17} />
                      <span>Grupos em alta</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setQuickMenuOpen(false); setGroupsQuickEntry(true); onGroupsOpenChange(true); setGroupsView('community-create') }}
                    >
                      <IconHeart size={17} />
                      <span>Criar comunidade</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setQuickMenuOpen(false); setGroupsQuickEntry(true); onGroupsOpenChange(true); setCommunityQuery(''); setGroupsView('community-search') }}
                    >
                      <IconHeart size={17} />
                      <span>Buscar comunidades</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setQuickMenuOpen(false); setGroupsQuickEntry(true); onGroupsOpenChange(true); setGroupsView('community-mine') }}
                    >
                      <IconHeart size={17} />
                      <span>Minhas comunidades</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => { setQuickMenuOpen(false); setGroupsQuickEntry(true); onGroupsOpenChange(true); setGroupsView('community-trending') }}
                    >
                      <IconHeart size={17} />
                      <span>Comunidades em alta</span>
                    </button>
                  </div>
                </>
              )}
              <NotificationCenter
                onOpenAppearance={() => {
                  pendingAccountViewRef.current = 'appearance'
                  onAccountOpenChange(true)
                }}
                onOpenStatus={onOpenStatus}
                onOpenCommunityTip={onOpenGroupsTip}
                onOpenChatInviteDemo={() => {
                  const target = conversations.find((c) => !c.isArchived) || conversations[0]
                  if (target) onRequestInviteDemo(target)
                }}
                hasFirstChat={conversations.length > 0}
              />
            </div>
          </div>

          <div className="search-wrap">
            <div className="search">
              <span><IconSearch size={18} /></span>
              <input
                aria-label="Pesquisar conversas"
                placeholder="Pesquisar conversas"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          <div className="filters-wrap" ref={filtersRef}>
            <div className="filters">
              {filterOrder.slice(0, VISIBLE_FILTER_COUNT).map((key) => (
                <div
                  key={key}
                  data-filter-key={key}
                  className={`filter-tab${dragKey === key ? ' dragging' : ''}${activeFilter === key ? ' active' : ''}`}
                >
                  <span
                    className="filter-grip"
                    onPointerDown={(e) => {
                      e.preventDefault()
                      if (filtersRef.current) startFilterDrag(key, filtersRef.current)
                    }}
                  >
                    <IconGrip size={12} />
                  </span>
                  <button className="filter" aria-pressed={activeFilter === key} onClick={() => setActiveFilter(key)}>
                    {FILTER_LABELS[key]}
                  </button>
                </div>
              ))}
              {filterOrder.length > VISIBLE_FILTER_COUNT && (
                <button
                  type="button"
                  className={`filter-more-btn${filterOrder.slice(VISIBLE_FILTER_COUNT).includes(activeFilter) ? ' active' : ''}`}
                  onClick={() => setFilterPopupOpen((v) => !v)}
                  title="Mais categorias"
                >
                  <IconChevronDown size={14} />
                </button>
              )}
            </div>
            {filterPopupOpen && (
              <>
                <div className="filter-popup-backdrop" onClick={() => setFilterPopupOpen(false)} />
                <div className="filter-popup">
                  {filterOrder.slice(VISIBLE_FILTER_COUNT).map((key) => (
                    <div
                      key={key}
                      data-filter-key={key}
                      className={`filter-tab filter-tab-popup${dragKey === key ? ' dragging' : ''}${activeFilter === key ? ' active' : ''}`}
                    >
                      <span
                        className="filter-grip"
                        onPointerDown={(e) => {
                          e.preventDefault()
                          if (filtersRef.current) startFilterDrag(key, filtersRef.current)
                        }}
                      >
                        <IconGrip size={12} />
                      </span>
                      <button
                        className="filter"
                        aria-pressed={activeFilter === key}
                        onClick={() => {
                          setActiveFilter(key)
                          setFilterPopupOpen(false)
                        }}
                      >
                        {FILTER_LABELS[key]}
                      </button>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {activeFilter === 'group' ? (
            <div className="chat-list">
              {filtered.length === 0 && myGroups.length === 0 && <div className="empty">Nenhum grupo ainda</div>}
              {filtered.map((c) => (
                <div
                  key={c.id}
                  className={`chat${selected?.id === c.id ? ' selected' : ''}`}
                  onClick={() => selectConversation(c)}
                  onContextMenu={(e) => handleContextMenu(e, c)}
                >
                  <div className="photo" style={{ borderColor: c.nameStyleColor || 'transparent' }}>
                    {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.label[0]?.toUpperCase()}
                  </div>
                  <div className="chat-info">
                    <div className="row">
                      {/* estilo do nome fica so no card de perfil por pedido do usuario - c.nameStyle* continua disponivel se quiser trazer de volta aqui */}
                      <div className="name">{c.label}</div>
                      {(c.unreadCount > 0 || c.isManuallyUnread) && (
                        <span className="unread-badge">{c.unreadCount > 0 ? c.unreadCount : ''}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
              {myGroups.map((g) => (
                <div
                  key={g.id}
                  className="chat"
                  onClick={() => {
                    onSelect({ id: g.id, type: 'group', name: g.name, image_url: g.image_url, created_by: '', created_at: '' } as Conversation)
                  }}
                >
                  <AvatarBox src={g.image_url} id={g.id} fallbackLetter={(g.name || "G")[0]?.toUpperCase()} className="photo" />
                  <div className="chat-info">
                    <div className="row">
                      <div className="name">{g.name}{g.role === 'admin' ? ' (adm)' : g.role === 'moderator' ? ' (mod)' : ''}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : activeFilter === 'communities' ? (
            <div className="chat-list">
              {myCommunities.length === 0 && <div className="empty">Nenhuma comunidade ainda</div>}
              {myCommunities.map((c) => (
                <div
                  key={c.id}
                  className="chat"
                  onClick={() => onSelectCommunity(c)}
                >
                  <AvatarBox src={c.image_url} id={c.id} fallbackLetter={(c.name || "C")[0]?.toUpperCase()} className="photo" />
                  <div className="chat-info">
                    <div className="row">
                      <div className="name">{c.name}</div>
                    </div>
                    {c.category && <div className="preview">{c.category}</div>}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="chat-list" ref={chatListRef}>
              {!me && <div className="empty">Entre para ver suas conversas</div>}
              {me && filtered.length === 0 && conversations.length === 0 && !query && activeFilter === 'all' && (
                <div className="empty empty-cta">
                  <p>Você ainda não tem nenhuma conversa</p>
                  <button
                    type="button"
                    className="primary"
                    onClick={() => {
                      onPanelViewChange('contact')
                      onPanelOpenChange(true)
                    }}
                  >
                    <IconPlus size={16} /> Adicionar contato
                  </button>
                </div>
              )}
              {me && filtered.length === 0 && (conversations.length > 0 || query || activeFilter !== 'all') && (
                <div className="empty">Nenhuma conversa ainda</div>
              )}
              {filtered.map((c) => (
                <div
                  key={c.id}
                  data-chat-id={c.id}
                  className={`chat${selected?.id === c.id ? ' selected' : ''}${dragChatId === c.id ? ' dragging' : ''}`}
                  onClick={() => selectConversation(c)}
                  onContextMenu={(e) => handleContextMenu(e, c)}
                >
                  {activeFilter === 'all' && (
                    <span
                      className="chat-grip"
                      onClick={(e) => e.stopPropagation()}
                      onPointerDown={(e) => {
                        e.preventDefault()
                        e.stopPropagation()
                        if (chatListRef.current) startChatDrag(c.id, chatListRef.current, filtered.map((x) => x.id))
                      }}
                    >
                      <IconGrip size={14} />
                    </span>
                  )}
                  <div className="photo" style={{ borderColor: c.nameStyleColor || 'transparent' }}>
                    {c.avatarUrl ? <img src={c.avatarUrl} alt="" /> : c.label[0]?.toUpperCase()}
                  </div>
                  <div className="chat-info">
                    <div className="row">
                      <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                        {/* estilo do nome fica so no card de perfil por pedido do usuario - c.nameStyle* continua disponivel se quiser trazer de volta aqui */}
                        <div className="name">{c.label}</div>
                        {c.isFavorite && (
                          <span className="favorite-heart" title="Favoritado">
                            <IconHeart size={13} />
                          </span>
                        )}
                      </div>
                      {(c.unreadCount > 0 || c.isManuallyUnread) && (
                        <span className="unread-badge">{c.unreadCount > 0 ? c.unreadCount : ''}</span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {contextMenu && (
        <div className="context-menu-backdrop" onClick={() => setContextMenu(null)} onContextMenu={(e) => { e.preventDefault(); setContextMenu(null) }}>
          <div
            className="context-menu"
            style={{ left: contextMenu.x, top: contextMenu.y }}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" onClick={() => archiveConversation(contextMenu.conv)}>
              <IconArchive size={16} /> {contextMenu.conv.isArchived ? 'Desarquivar conversa' : 'Arquivar conversa'}
            </button>
            <button type="button" onClick={() => muteConversation(contextMenu.conv)}>
              <IconBellOff size={16} /> {contextMenu.conv.isMuted ? 'Dessilenciar notificações' : 'Silenciar notificações'}
            </button>
            <button type="button" onClick={() => markUnread(contextMenu.conv)}>
              <IconMailUnread size={16} /> Marcar como não lida
            </button>
            <button type="button" onClick={() => toggleFavorite(contextMenu.conv)}>
              <IconHeart size={16} /> {contextMenu.conv.isFavorite ? 'Remover dos Favoritos' : 'Adicionar aos Favoritos'}
            </button>
            <button type="button" className="danger" onClick={() => { setConfirmDeleteConv(contextMenu.conv); setContextMenu(null) }}>
              <IconTrash size={16} /> Apagar conversa
            </button>
          </div>
        </div>
      )}

      {confirmDeleteConv && (
        <div className="modal-backdrop" onClick={() => setConfirmDeleteConv(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h2>Apagar conversa?</h2>
            <p>Isso remove "{confirmDeleteConv.label}" da sua lista. Se a pessoa mandar mensagem de novo, a conversa reaparece.</p>
            <button
              type="button"
              className="settings-danger-btn"
              onClick={() => { deleteConversation(confirmDeleteConv); setConfirmDeleteConv(null) }}
            >
              <IconTrash size={18} /> Sim, apagar
            </button>
            <button type="button" onClick={() => setConfirmDeleteConv(null)} style={{ marginTop: 8 }}>
              Cancelar
            </button>
          </div>
        </div>
      )}

      <div className={`new-conv-panel${panelOpen ? ' open' : ''}`}>
        <div className="new-conv-header">
          <button type="button" className="icon-btn" onClick={goBack}><IconArrowLeft size={20} /></button>
          <div className="brand" style={{ fontSize: 18 }}>{panelTitle}</div>
        </div>

        {panelView === 'root' && (
          <div className="new-conv-list">
            <div className="new-conv-option" onClick={() => onPanelViewChange('contact')}>
              <div className="option-icon"><IconUser size={20} /></div>
              <span>Novo contato</span>
            </div>
            <div className="new-conv-option" onClick={() => { setFriendsView('list'); onPanelViewChange('friends') }}>
              <div className="option-icon"><IconHeart size={20} /></div>
              <span>Amigos{incoming.length > 0 ? ` (${incoming.length})` : ''}</span>
            </div>
          </div>
        )}

        {panelView === 'friends' && friendsView === 'list' && (
          <>
            {incoming.length > 0 && (
              <>
                <label style={{ padding: '0 22px', fontSize: '.7rem', color: '#8696a0', textTransform: 'uppercase' }}>
                  Pedidos recebidos
                </label>
                <div className="friend-request-list" style={{ margin: '0 8px 10px' }}>
                  {incoming.map((req) => (
                    <div key={req.id} className="friend-request-row">
                      <div className="photo" style={{ width: 40, height: 40 }}>
                        {req.from_profile.username[0]?.toUpperCase()}
                      </div>
                      <div className="friend-request-info">
                        <div className="name">{req.from_profile.username}</div>
                        <div className="preview">{req.from_profile.email}</div>
                      </div>
                      <button type="button" disabled={busy} onClick={() => acceptRequest(req)}>Aceitar</button>
                      <button type="button" disabled={busy} className="decline" onClick={() => declineRequest(req)}>Recusar</button>
                    </div>
                  ))}
                </div>
              </>
            )}
            <div className="friend-request-list" style={{ margin: '8px 8px 0', borderTop: '1px solid var(--line-2)', paddingTop: 12 }}>
              {friends.length === 0 && <span className="invite-code">você ainda não tem amigos</span>}
              {friends.map((f) => (
                <div key={f.id} className="friend-request-row">
                  <div className="photo" style={{ width: 40, height: 40, overflow: 'hidden', borderColor: f.name_style_color || 'transparent' }}>
                    {f.avatar_url ? <img src={f.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : f.username[0]?.toUpperCase()}
                  </div>
                  <div className="friend-request-info">
                    <div className="name">{displayName(f)}</div>
                  </div>
                  <button type="button" className="decline" onClick={() => unfriend(f.id)}>Desfazer</button>
                </div>
              ))}
            </div>
          </>
        )}

        {panelView === 'friends' && friendsView === 'add' && (
          <div className="new-conv-form">
            <label>Adicionar por email</label>
            <input
              type="email"
              placeholder="email@exemplo.com"
              value={friendEmail}
              onChange={(e) => setFriendEmail(e.target.value)}
              autoFocus
            />
            <button type="button" disabled={busy} onClick={sendFriendRequest}>Enviar solicitação</button>
            {friendInfo && <span className="invite-code">{friendInfo}</span>}
            {error && <span className="auth-error">{error}</span>}

            <label style={{ marginTop: 10 }}>Recebidas</label>
            <div className="friend-request-list">
              {incoming.length === 0 && <span className="invite-code">nenhuma solicitação pendente</span>}
              {incoming.map((req) => (
                <div key={req.id} className="friend-request-row">
                  <div className="photo" style={{ width: 40, height: 40 }}>
                    {req.from_profile.username[0]?.toUpperCase()}
                  </div>
                  <div className="friend-request-info">
                    <div className="name">{req.from_profile.username}</div>
                    <div className="preview">{req.from_profile.email}</div>
                  </div>
                  <button type="button" disabled={busy} onClick={() => acceptRequest(req)}>Aceitar</button>
                  <button type="button" disabled={busy} className="decline" onClick={() => declineRequest(req)}>Recusar</button>
                  <div style={{ position: 'relative' }}>
                    <button
                      type="button"
                      className="icon-btn"
                      style={{ width: 28, height: 28 }}
                      onClick={() => setOpenMenuId(openMenuId === req.id ? null : req.id)}
                    >
                      <IconMore size={16} />
                    </button>
                    {openMenuId === req.id && (
                      <div className="request-menu">
                        <button type="button" disabled={busy} onClick={() => blockUser(req)}>Bloquear</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>

            <label style={{ marginTop: 10 }}>Enviadas</label>
            <div className="friend-request-list">
              {outgoing.length === 0 && <span className="invite-code">nenhuma solicitação enviada</span>}
              {outgoing.map((req) => (
                <div key={req.id} className="friend-request-row">
                  <div className="photo" style={{ width: 40, height: 40 }}>
                    {req.to_profile.username[0]?.toUpperCase()}
                  </div>
                  <div className="friend-request-info">
                    <div className="name">{req.to_profile.username}</div>
                    <div className="preview">{req.status === 'declined' ? 'pedido recusado' : 'aguardando resposta'}</div>
                  </div>
                  {req.status === 'declined' && (
                    <button type="button" disabled={busy} onClick={() => retryRequest(req)}>Tentar de novo</button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {panelView === 'contact' && (
          <div className="new-conv-form">
            <label>Email da pessoa</label>
            <input
              type="email"
              placeholder="email@exemplo.com"
              value={dmEmail}
              onChange={(e) => setDmEmail(e.target.value)}
              autoFocus
            />
            <button type="button" disabled={busy} onClick={startDm}>Chamar</button>
            {inviteSent && (
              <span className="invite-code">
                essa pessoa ainda não tem conta — mandamos um convite por email
              </span>
            )}
            {error && <span className="auth-error">{error}</span>}
          </div>
        )}

      </div>

      <div className={`new-conv-panel${accountOpen ? ' open' : ''}`}>
        <div className="new-conv-header">
          <button type="button" className="icon-btn" onClick={accountGoBack}><IconArrowLeft size={20} /></button>
          <div className="brand" style={{ fontSize: 18 }}>{accountTitle}</div>
        </div>

        {accountView === 'root' && me && (
          <>
            <div className="new-conv-list">
              <div className="new-conv-option" onClick={() => setAccountView('profile')}>
                <div className="option-icon"><IconUser size={20} /></div>
                <div>
                  <div>Conta</div>
                  <div className="option-subtitle">Nome, foto do perfil, nome de usuário</div>
                </div>
              </div>
              <div className="new-conv-option" onClick={() => setAccountView('appearance')}>
                <div className="option-icon"><IconPaint size={20} /></div>
                <div>
                  <div>Aparência</div>
                  <div className="option-subtitle">Cor ou imagem de fundo do seu perfil</div>
                </div>
              </div>
              <div className="new-conv-option" onClick={() => setAccountView('account')}>
                <div className="option-icon"><IconKey size={20} /></div>
                <div>
                  <div>Configurações</div>
                  <div className="option-subtitle">Tema, dados da conta, sair</div>
                </div>
              </div>
              <div className="new-conv-option" onClick={() => setAccountView('privacy')}>
                <div className="option-icon"><IconLock size={20} /></div>
                <div>
                  <div>Privacidade</div>
                  <div className="option-subtitle">Termos de Uso, Política de Privacidade</div>
                </div>
              </div>
            </div>
          </>
        )}

        {accountView === 'profile' && me && (
          <div className="new-conv-form">
            <div className="account-avatar-wrap">
              <div className="account-avatar" onClick={() => avatarInputRef.current?.click()} style={{ cursor: 'pointer', overflow: 'hidden', position: 'relative' }}>
                {me.avatar_url ? <img src={me.avatar_url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <IconUser size={40} />}
                <span className="account-avatar-edit">{avatarUploading ? '…' : <IconEdit size={14} />}</span>
              </div>
            </div>
            <input ref={avatarInputRef} type="file" accept="image/*" hidden onChange={uploadAvatar} />

            <label style={{ marginTop: 10 }}>Nome</label>
            <input
              placeholder="seu nome de exibição"
              value={displayNameDraft}
              onChange={(e) => setDisplayNameDraft(e.target.value)}
              onBlur={saveProfile}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />

            <label style={{ marginTop: 10 }}>Nome de usuário</label>
            <input
              value={usernameDraft}
              onChange={(e) => setUsernameDraft(e.target.value)}
              onBlur={saveProfile}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />

            <label style={{ marginTop: 10 }}>Status</label>
            <input
              placeholder="What's happening?"
              value={statusDraft}
              onChange={(e) => setStatusDraft(e.target.value)}
              onBlur={saveProfile}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />

            <label style={{ marginTop: 10 }}>Idade</label>
            <input
              type="number"
              placeholder="idade"
              value={ageDraft}
              onChange={(e) => setAgeDraft(e.target.value)}
              onBlur={saveProfile}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />

            <label style={{ marginTop: 10 }}>Cidade</label>
            <input
              placeholder="sua cidade"
              value={cityDraft}
              onChange={(e) => setCityDraft(e.target.value)}
              onBlur={saveProfile}
              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            />
            {accountError && <span className="auth-error">{accountError}</span>}
            {accountSaving && <span style={{ fontSize: '.75rem', color: '#8696a0', marginTop: 8 }}>salvando...</span>}
          </div>
        )}

        {accountView === 'appearance' && me && (
          <div className="new-conv-form">
            <div
              ref={bannerPreviewRef}
              className="profile-banner-preview"
              style={{
                display: 'block',
                width: '100%',
                minWidth: '100%',
                height: 188,
                minHeight: 188,
                boxSizing: 'border-box',
                ...((bannerImageDraft ?? me.banner_image_url)
                  ? {
                      backgroundImage: `url(${bannerImageDraft ?? me.banner_image_url})`,
                      backgroundPosition: bannerImagePosDraft,
                      backgroundSize: 'cover',
                      cursor: 'grab',
                    }
                  : { background: (bannerColorDraft ?? me.banner_color) || 'var(--green)' }),
              }}
              onPointerDown={handleBannerPointerDown}
              onPointerMove={handleBannerPointerMove}
              onPointerUp={handleBannerPointerUp}
              onPointerLeave={handleBannerPointerUp}
            >
              <div className="profile-banner-preview-avatar">
                {me.avatar_url ? <img src={me.avatar_url} alt="" /> : <IconUser size={26} />}
              </div>
            </div>
            <label style={{ marginTop: 12 }}>Imagem ou GIF</label>
            <input ref={bannerInputRef} type="file" accept="image/*" hidden onChange={uploadBannerImage} />
            <button type="button" disabled={bannerUploading} onClick={() => bannerInputRef.current?.click()}>
              {bannerUploading ? 'enviando...' : bannerImageDraft ? 'Trocar imagem' : 'Escolher imagem'}
            </button>
            {bannerImageDraft && (
              <button type="button" onClick={removeBannerImage} style={{ marginTop: 6 }}>
                Remover imagem
              </button>
            )}

            <label style={{ marginTop: 12 }}>Cor de fundo (foto)</label>
            <div className="banner-color-picker">
              <button
                type="button"
                className={`banner-color-swatch banner-color-reset${!bannerColorDraft && !bannerImageDraft ? ' active' : ''}`}
                disabled={bannerSaving}
                onClick={resetBannerToDefault}
                title="Padrão"
              >
                <IconMinusCircle size={14} />
              </button>
              {BANNER_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`banner-color-swatch${!bannerImageDraft && bannerColorDraft === color ? ' active' : ''}`}
                  style={{ background: color }}
                  disabled={bannerSaving}
                  onClick={() => setBannerColor(color)}
                />
              ))}
              <input
                type="color"
                className="banner-color-swatch banner-color-custom"
                value={bannerColorDraft || '#5865f2'}
                disabled={bannerSaving}
                onChange={(e) => setBannerColor(e.target.value)}
              />
            </div>
            {accountError && <span className="auth-error">{accountError}</span>}

            <div className="appearance-separator" />

            <label style={{ marginTop: 14 }}>Estilo do nome</label>

            <div className="name-style-preview">
              <StyledName
                name={displayName(me)}
                font={me.name_style_font}
                effect={me.name_style_effect}
                color={me.name_style_color}
              />
            </div>

            <label style={{ marginTop: 10 }}>Fonte</label>
            <div className="name-style-picker">
              {NAME_FONTS.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  className={`name-font-option${(me.name_style_font || 'default') === f.id ? ' active' : ''}`}
                  style={f.id !== 'default' ? { fontFamily: f.family } : undefined}
                  onClick={() => setNameStyle('name_style_font', f.id)}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <label style={{ marginTop: 12 }}>Efeito</label>
            <div className="name-style-picker">
              {NAME_EFFECTS.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  className={`name-effect-option${(me.name_style_effect || 'solid') === e.id ? ' active' : ''}${e.locked ? ' locked' : ''}`}
                  disabled={e.locked}
                  title={e.locked ? 'Em breve' : undefined}
                  onClick={() => !e.locked && setNameStyle('name_style_effect', e.id)}
                >
                  {e.label} {e.locked && <IconLock size={11} />}
                </button>
              ))}
            </div>

            <ColorField
              label="Cor"
              value={me.name_style_color}
              onPick={(v) => setNameStyle('name_style_color', v)}
              disableGradient={(me.name_style_effect || 'solid') !== 'gradient'}
              disableCustom={me.name_style_effect === 'gradient'}
            />

            <div className="appearance-separator" />

            <label style={{ marginTop: 14 }}>Aparência do app</label>

            <ColorField label="Fundo" value={me.app_bg_color} onPick={(v) => setAppColor('app_bg_color', v)} />
            <ColorField label="Barra lateral" value={me.app_sidebar_color} onPick={(v) => setAppColor('app_sidebar_color', v)} />
            <ColorField label="Botões" value={me.app_button_color} onPick={(v) => setAppColor('app_button_color', v)} />
            <ColorField label="Mensagem recebida" value={me.app_incoming_color} onPick={(v) => setAppColor('app_incoming_color', v)} />
            <ColorField label="Mensagem enviada" value={me.app_outgoing_color} onPick={(v) => setAppColor('app_outgoing_color', v)} />
            <ColorField label="Cards (comunidade)" value={me.app_card_color} onPick={(v) => setAppColor('app_card_color', v)} />

            <label style={{ marginTop: 12 }}>Tamanho do texto</label>
            <div className="name-style-picker">
              <button
                type="button"
                className={`name-effect-option${(me.app_text_size || 'normal') === 'small' ? ' active' : ''}`}
                onClick={() => setAppColor('app_text_size', 'small')}
              >
                Menor
              </button>
              <button
                type="button"
                className={`name-effect-option${(me.app_text_size || 'normal') === 'normal' ? ' active' : ''}`}
                onClick={() => setAppColor('app_text_size', null)}
              >
                Padrão
              </button>
              <button
                type="button"
                className={`name-effect-option${(me.app_text_size || 'normal') === 'large' ? ' active' : ''}`}
                onClick={() => setAppColor('app_text_size', 'large')}
              >
                Maior
              </button>
            </div>

            {isTauriDesktop ? (
              <>
                <label style={{ marginTop: 14 }}>Tema</label>
                <span className="invite-code">A versão desktop tem um tema próprio (ainda não é possível trocar por aqui) — mais opções chegam depois.</span>
              </>
            ) : (
              <>
                <label style={{ marginTop: 14 }}>Tema</label>
                <div className="theme-picker">
                  <button
                    type="button"
                    className={`theme-option${theme === 'dark' ? ' active' : ''}`}
                    onClick={() => onThemeChange('dark')}
                  >
                    Escuro
                  </button>
                  <button
                    type="button"
                    className={`theme-option${theme === 'light' ? ' active' : ''}`}
                    onClick={() => onThemeChange('light')}
                  >
                    Retro
                  </button>
                  <button
                    type="button"
                    className={`theme-option${theme === 'frutiger' ? ' active' : ''}`}
                    onClick={() => onThemeChange('frutiger')}
                  >
                    Frutiger Aero
                  </button>
                  <button
                    type="button"
                    className={`theme-option${theme === 'contrast' ? ' active' : ''}`}
                    onClick={() => onThemeChange('contrast')}
                  >
                    Alto contraste
                  </button>
                </div>
              </>
            )}
          </div>
        )}

        {accountView === 'account' && me && (
          <div className="new-conv-form">
            <label>Email</label>
            <input value={me.email} disabled />
            <span className="invite-code">notificações de segurança e mais dados da conta chegam em breve</span>

            <div className="new-conv-option" style={{ margin: '10px 0 0', padding: '14px 0' }} onClick={openBlocked}>
              <div className="option-icon"><IconLock size={20} /></div>
              <span>Contatos bloqueados</span>
            </div>

            <label style={{ marginTop: 10 }}>App</label>
            <button
              type="button"
              className="google-btn"
              disabled={appUpdating}
              style={{ display: 'block', width: '100%', textAlign: 'center' }}
              onClick={handleAppUpdateClick}
            >
              {appUpdating ? 'Baixando...' : `Baixar o app (Android) — v${latestVersion}`}
            </button>
            <span className="invite-code">
              {latestVersion !== APP_VERSION ? `sua versão instalada: v${APP_VERSION}` : 'você já está na versão mais nova'}
            </span>

            <label style={{ marginTop: 10 }}>Sobre o app</label>
            <a
              href="https://github.com/facincanitech/thothchat/releases/latest"
              target="_blank"
              rel="noreferrer"
              className="google-btn"
              style={{ display: 'block', width: '100%', textAlign: 'center', textDecoration: 'none' }}
            >
              Ver notas da versão (release)
            </a>

            <div style={{ marginTop: 24, borderTop: '1px solid var(--line-2)', paddingTop: 16 }}>
              {confirmSignOut ? (
                <>
                  <span className="invite-code">Tem certeza que quer sair da sua conta?</span>
                  <button type="button" className="account-signout" onClick={() => supabase.auth.signOut()} style={{ marginTop: 8 }}>
                    Sim, sair
                  </button>
                  <button type="button" onClick={() => setConfirmSignOut(false)} style={{ marginTop: 6 }}>
                    Cancelar
                  </button>
                </>
              ) : (
                <>
                  <button type="button" className="account-switch" onClick={switchAccount}>
                    Trocar de conta
                  </button>
                  <button type="button" className="account-signout" onClick={() => setConfirmSignOut(true)} style={{ marginTop: 6 }}>
                    Sair
                  </button>
                </>
              )}
            </div>

            <div style={{ marginTop: 16 }}>
              {confirmDeleteAccount ? (
                <>
                  <span className="invite-code">
                    Excluir sua conta é definitivo — seu perfil vira "Conta excluída" e você não consegue mais entrar. Mensagens que você mandou continuam visíveis pros outros, sem seu nome/foto.
                  </span>
                  {deleteAccountError && <span className="invite-code" style={{ color: '#e5484d' }}>{deleteAccountError}</span>}
                  <button type="button" className="settings-danger-btn" disabled={deletingAccount} onClick={deleteAccount} style={{ marginTop: 8 }}>
                    {deletingAccount ? 'Excluindo...' : 'Sim, excluir minha conta'}
                  </button>
                  <button type="button" disabled={deletingAccount} onClick={() => setConfirmDeleteAccount(false)} style={{ marginTop: 6 }}>
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" className="settings-danger-btn" onClick={() => setConfirmDeleteAccount(true)}>
                  Excluir conta
                </button>
              )}
            </div>
          </div>
        )}

        {accountView === 'privacy' && (
          <div className="new-conv-list">
            <div className="new-conv-option" onClick={() => setAccountView('terms')}>
              <div className="option-icon"><IconKey size={20} /></div>
              <span>Termos de Uso</span>
            </div>
            <div className="new-conv-option" onClick={() => setAccountView('privacy-policy')}>
              <div className="option-icon"><IconLock size={20} /></div>
              <span>Política de Privacidade</span>
            </div>
            <div className="new-conv-option">
              <div className="option-icon"><IconUser size={20} /></div>
              <span>Contato: facincanitech@gmail.com</span>
            </div>
          </div>
        )}

        {accountView === 'privacy-policy' && (
          <div className="new-conv-form terms-text">
            <p>
              Coletamos seu nome, foto e e-mail direto da sua conta Google quando você entra no app
              — é assim que criamos seu perfil, sem precisar de cadastro separado.
            </p>
            <p>
              As mensagens que você manda, os grupos que participa e as comunidades que segue
              ficam salvos no nosso banco de dados, pra que a conversa continue disponível pra
              quem participa dela.
            </p>
            <p>
              Fotos, vídeos e áudios que você envia ficam guardados nos nossos servidores. Mídia
              marcada como "temporária" ou "visualização única" é apagada automaticamente depois
              de aberta ou após 10 minutos.
            </p>
            <p>
              Não vendemos nem compartilhamos seus dados com empresas de publicidade ou terceiros.
            </p>
            <p>
              Você pode excluir sua conta a qualquer momento em Configurações → Excluir conta. Isso
              anonimiza seu perfil (nome, foto e outros dados pessoais somem) e desativa seu login
              permanentemente. Mensagens que você mandou em conversas com outras pessoas continuam
              existindo pra quem participou delas, só sem seu nome ou foto — igual em qualquer app
              de mensagens de verdade.
            </p>
          </div>
        )}

        {accountView === 'terms' && (
          <div className="new-conv-form terms-text">
            <p>
              O ThothChat é fornecido "como está". Não nos responsabilizamos por uso indevido do
              app por parte dos usuários, incluindo o conteúdo das mensagens trocadas.
            </p>
            <p>
              Imagens e vídeos transmitidos ao vivo não são salvos no nosso banco de dados —
              existem apenas enquanto estão sendo compartilhados em tempo real.
            </p>
            <p>
              O texto das mensagens enviadas fica salvo no banco de dados junto com o
              remetente, por tempo indeterminado.
            </p>
            <p>
              Mídias enviadas como "temporária" ou "visualização única" são apagadas
              automaticamente do armazenamento após serem abertas (ou após 10 minutos, no caso
              da temporária) e não ficam salvas no histórico.
            </p>
            <p>
              O app bloqueia print e gravação de tela em toda a área do ThothChat — não é possível
              tirar captura nem gravar o que aparece na tela enquanto o app está aberto.
            </p>
            <p>
              Quebra de sigilo dessas informações só ocorre mediante requisição jurídica
              (ordem judicial ou solicitação de autoridade competente).
            </p>
          </div>
        )}

        {accountView === 'blocked' && (
          <div className="new-conv-form">
            {blocked.length === 0 && <span className="invite-code">ninguém bloqueado</span>}
            <div className="friend-request-list">
              {blocked.map((b) => (
                <div key={b.id} className="friend-request-row">
                  <div className="photo" style={{ width: 40, height: 40 }}>{b.username[0]?.toUpperCase()}</div>
                  <div className="friend-request-info">
                    <div className="name">{b.username}</div>
                    <div className="preview">{b.email}</div>
                  </div>
                  <button type="button" onClick={() => unblock(b.id)}>Desbloquear</button>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>

      <div className={`new-conv-panel${groupsOpen ? ' open' : ''}`}>
        <div className="new-conv-header">
          <button
            type="button"
            className="icon-btn"
            onClick={() => {
              if (groupsQuickEntry) { setGroupsQuickEntry(false); onGroupsOpenChange(false); return }
              if (groupsView === 'group-root' || groupsView === 'community-root') { onGroupsOpenChange(false); return }
              if (groupsView.startsWith('community-')) { setGroupsView('community-root'); return }
              setGroupsView('group-root')
            }}
          >
            <IconArrowLeft size={20} />
          </button>
          <div className="brand" style={{ fontSize: 18 }}>
            {groupsView.startsWith('community-') ? 'ThothChat - Comunidades' : 'ThothChat - Grupos'}
          </div>
        </div>

        {groupsView === 'group-root' && (
          <>
            <div className="new-conv-list">
              <div className="new-conv-option" onClick={() => setGroupsView('group-create')}>
                <div className="option-icon"><IconGroup size={20} /></div>
                <span>Criar grupo</span>
              </div>
              <div className="new-conv-option" onClick={() => { setGroupQuery(''); setGroupsView('group-search') }}>
                <div className="option-icon"><IconSearch size={20} /></div>
                <span>Buscar grupos</span>
              </div>
              <div className="new-conv-option" onClick={() => setGroupsView('group-trending')}>
                <div className="option-icon"><IconGroup size={20} /></div>
                <span>Grupos em alta</span>
              </div>
              <div className="new-conv-option" onClick={() => setGroupsView('group-mine')}>
                <div className="option-icon"><IconGroup size={20} /></div>
                <span>Meus grupos</span>
              </div>
            </div>
          </>
        )}

        {groupsView === 'group-trending' && (
          <div className="chat-list">
            {trendingGroups.length === 0 && <div className="empty">Nenhum grupo público ainda</div>}
            {trendingGroups.map((g) => (
              <div
                key={g.id}
                className="chat"
                onClick={() => {
                  onSelect({ id: g.id, type: 'group', name: g.name, image_url: g.image_url, created_by: '', created_at: '' } as Conversation)
                  onLeaveGroupsPanel('group-root')
                }}
              >
                <AvatarBox src={g.image_url} id={g.id} fallbackLetter={(g.name || "G")[0]?.toUpperCase()} className="photo" />
                <div className="chat-info">
                  <div className="row">
                    <div className="name">{g.name}</div>
                  </div>
                  <div className="preview">{g.member_count} {g.member_count === 1 ? 'membro' : 'membros'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {groupsView === 'group-mine' && (
          <div className="chat-list">
            {myGroups.length === 0 && <div className="empty">Nenhum grupo ainda</div>}
            {myGroups.map((g) => (
              <div
                key={g.id}
                className="chat"
                onClick={() => {
                  onSelect({ id: g.id, type: 'group', name: g.name, image_url: g.image_url, created_by: '', created_at: '' } as Conversation)
                  onLeaveGroupsPanel('group-root')
                }}
              >
                <AvatarBox src={g.image_url} id={g.id} fallbackLetter={(g.name || "G")[0]?.toUpperCase()} className="photo" />
                <div className="chat-info">
                  <div className="row">
                    <div className="name">{g.name}{g.role === 'admin' ? ' (adm)' : g.role === 'moderator' ? ' (mod)' : ''}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {groupsView === 'group-search' && (
          <div className="new-conv-form">
            <input
              placeholder="Buscar grupos..."
              value={groupQuery}
              onChange={(e) => setGroupQuery(e.target.value)}
              autoFocus
            />
            <div className="chat-list" style={{ margin: '0 -22px' }}>
              {publicGroups
                .filter((g) => (g.name || '').toLowerCase().includes(groupQuery.toLowerCase()))
                .map((g) => (
                  <div key={g.id} className="chat" onClick={() => joinPublicGroup(g)}>
                    <AvatarBox src={g.image_url} id={g.id} fallbackLetter={(g.name || "G")[0]?.toUpperCase()} className="photo" />
                    <div className="chat-info">
                      <div className="row">
                        <div className="name">{g.name}</div>
                      </div>
                      <div className="preview">{g.invite_requires_approval ? 'pedir pra entrar' : 'entrar'}</div>
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}

        {groupsView === 'community-root' && (
          <>
            <div className="new-conv-list">
              <div className="new-conv-option" onClick={() => setGroupsView('community-create')}>
                <div className="option-icon"><IconHeart size={20} /></div>
                <span>Criar comunidade</span>
              </div>
              <div className="new-conv-option" onClick={() => { setCommunityQuery(''); setGroupsView('community-search') }}>
                <div className="option-icon"><IconSearch size={20} /></div>
                <span>Buscar comunidades</span>
              </div>
              <div className="new-conv-option" onClick={() => setGroupsView('community-trending')}>
                <div className="option-icon"><IconHeart size={20} /></div>
                <span>Comunidades em alta</span>
              </div>
              <div className="new-conv-option" onClick={() => setGroupsView('community-mine')}>
                <div className="option-icon"><IconHeart size={20} /></div>
                <span>Minhas comunidades</span>
              </div>
            </div>
          </>
        )}

        {groupsView === 'community-trending' && (
          <div className="chat-list">
            {trendingCommunities.length === 0 && <div className="empty">Nenhuma comunidade ainda</div>}
            {trendingCommunities.map((c) => (
              <div
                key={c.id}
                className="chat"
                onClick={() => {
                  onLeaveGroupsPanel('community-root')
                  onSelectCommunity(c)
                }}
              >
                <AvatarBox src={c.image_url} id={c.id} fallbackLetter={(c.name || "C")[0]?.toUpperCase()} className="photo" />
                <div className="chat-info">
                  <div className="row">
                    <div className="name">{c.name}</div>
                  </div>
                  <div className="preview">{c.comment_count} {c.comment_count === 1 ? 'comentário' : 'comentários'}</div>
                </div>
              </div>
            ))}
          </div>
        )}

        {groupsView === 'community-mine' && (
          <div className="chat-list">
            {myCommunities.length === 0 && <div className="empty">Nenhuma comunidade ainda</div>}
            {myCommunities.map((c) => (
              <div
                key={c.id}
                className="chat"
                onClick={() => {
                  onLeaveGroupsPanel('community-root')
                  onSelectCommunity(c)
                }}
              >
                <AvatarBox src={c.image_url} id={c.id} fallbackLetter={(c.name || "C")[0]?.toUpperCase()} className="photo" />
                <div className="chat-info">
                  <div className="row">
                    <div className="name">{c.name}</div>
                  </div>
                  {c.category && <div className="preview">{c.category}</div>}
                </div>
              </div>
            ))}
          </div>
        )}

        {groupsView === 'group-create' && (
          <div className="new-conv-form">
            <label>Nome do grupo</label>
            <input
              placeholder="nome do grupo"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              autoFocus
            />
            <label style={{ marginTop: 10 }}>Descrição</label>
            <input
              placeholder="descrição (opcional)"
              value={newGroupDesc}
              onChange={(e) => setNewGroupDesc(e.target.value)}
            />
            <label style={{ marginTop: 10 }}>Foto</label>
            <input ref={newGroupImageInputRef} type="file" accept="image/*" hidden onChange={uploadNewGroupImage} />
            <button type="button" disabled={newGroupImageUploading} onClick={() => newGroupImageInputRef.current?.click()}>
              {newGroupImageUploading ? 'enviando...' : newGroupImageUrl ? 'Trocar foto' : 'Escolher foto (opcional)'}
            </button>
            <label style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={newGroupIsPublic}
                onChange={(e) => setNewGroupIsPublic(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Grupo público (aparece na busca, qualquer um pode entrar)
            </label>
            <button type="button" disabled={groupsBusy} onClick={createGroup2}>Criar</button>
            {groupsError && <span className="auth-error">{groupsError}</span>}
          </div>
        )}

        {groupsView === 'community-create' && (
          <div className="new-conv-form">
            <label>Nome da comunidade</label>
            <input
              placeholder="nome da comunidade"
              value={newCommunityName}
              onChange={(e) => setNewCommunityName(e.target.value)}
              autoFocus
            />
            <label style={{ marginTop: 10 }}>Categoria</label>
            <select
              value={newCommunityCategory}
              onChange={(e) => setNewCommunityCategory(e.target.value)}
            >
              <option value="">Selecione uma categoria</option>
              {COMMUNITY_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>{cat}</option>
              ))}
            </select>
            <label style={{ marginTop: 10 }}>Descrição</label>
            <input
              placeholder="descrição (opcional)"
              value={newCommunityDesc}
              onChange={(e) => setNewCommunityDesc(e.target.value)}
            />
            <label style={{ marginTop: 10 }}>Idioma</label>
            <input
              placeholder="idioma"
              value={newCommunityLanguage}
              onChange={(e) => setNewCommunityLanguage(e.target.value)}
            />
            <label style={{ marginTop: 10, display: 'flex', alignItems: 'center', gap: 8 }}>
              <input
                type="checkbox"
                checked={newCommunityIsPrivate}
                onChange={(e) => setNewCommunityIsPrivate(e.target.checked)}
                style={{ width: 'auto' }}
              />
              Comunidade particular (só membros veem tópicos e comentários)
            </label>
            <button type="button" disabled={groupsBusy} onClick={createCommunity}>Criar</button>
            {groupsError && <span className="auth-error">{groupsError}</span>}
          </div>
        )}

        {groupsView === 'community-search' && (
          <div className="new-conv-form">
            <input
              placeholder="Buscar comunidades..."
              value={communityQuery}
              onChange={(e) => setCommunityQuery(e.target.value)}
              autoFocus
            />
            <div className="chat-list" style={{ margin: '0 -22px' }}>
              {communities
                .filter((c) => c.name.toLowerCase().includes(communityQuery.toLowerCase()) || (c.category || '').toLowerCase().includes(communityQuery.toLowerCase()))
                .map((c) => (
                  <div
                    key={c.id}
                    className="chat"
                    onClick={() => {
                      onLeaveGroupsPanel('community-search')
                      onSelectCommunity(c)
                    }}
                  >
                    <AvatarBox src={c.image_url} id={c.id} fallbackLetter={(c.name || "C")[0]?.toUpperCase()} className="photo" />
                    <div className="chat-info">
                      <div className="row">
                        <div className="name">{c.name}</div>
                      </div>
                      {c.category && <div className="preview">{c.category}</div>}
                    </div>
                  </div>
                ))}
            </div>
          </div>
        )}
      </div>

      {me && <StatusView me={me} open={statusOpen} onBack={() => onStatusOpenChange(false)} />}
    </section>
  )
}
