import { useCallback, useEffect, useRef, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { IconBell } from './icons'
import { checkForUpdate } from '../lib/updateCheck'
import { downloadAndInstallUpdate } from '../lib/appUpdate'
import { downloadAndInstallDesktopUpdate } from '../lib/desktopUpdate'
import { isTauriDesktop } from '../lib/platform'
import { APP_VERSION, APK_DOWNLOAD_URL, DESKTOP_DOWNLOAD_URL } from '../version'

type Tip = {
  key: string
  storageKey: string
  text: string
  onClick: () => void
  enabled: boolean
}

type Props = {
  onOpenAppearance: () => void
  onOpenStatus: () => void
  onOpenCommunityTip: () => void
  onOpenChatInviteDemo: () => void
  hasFirstChat: boolean
}

export function NotificationCenter({ onOpenAppearance, onOpenStatus, onOpenCommunityTip, onOpenChatInviteDemo, hasFirstChat }: Props) {
  const [open, setOpen] = useState(false)
  const [updateVersion, setUpdateVersion] = useState<string | null>(null)
  const [updating, setUpdating] = useState(false)
  const [updateError, setUpdateError] = useState<string | null>(null)
  const [visited, setVisited] = useState<Record<string, boolean>>({})
  const checkingUpdateRef = useRef(false)

  function readVisited() {
    const keys = ['ferus-visited-appearance', 'ferus-visited-chat-config', 'ferus-visited-groups', 'ferus-visited-status']
    const next: Record<string, boolean> = {}
    for (const k of keys) {
      try {
        next[k] = localStorage.getItem(k) === '1'
      } catch {
        next[k] = false
      }
    }
    setVisited(next)
  }

  useEffect(() => {
    readVisited()
  }, [])

  const recheckUpdate = useCallback(async () => {
    if (!Capacitor.isNativePlatform() && !isTauriDesktop) return
    if (checkingUpdateRef.current) return
    checkingUpdateRef.current = true
    try {
      const info = await checkForUpdate(APP_VERSION)
      setUpdateVersion(info.available ? info.version || null : null)
    } finally {
      checkingUpdateRef.current = false
    }
  }, [])

  useEffect(() => {
    recheckUpdate()
    const interval = window.setInterval(recheckUpdate, 30 * 60 * 1000)
    const onFocus = () => recheckUpdate()
    const onVisibility = () => { if (!document.hidden) recheckUpdate() }
    window.addEventListener('focus', onFocus)
    document.addEventListener('visibilitychange', onVisibility)
    return () => {
      window.clearInterval(interval)
      window.removeEventListener('focus', onFocus)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [recheckUpdate])

  useEffect(() => {
    if (!open) return
    recheckUpdate()
    readVisited()
  }, [open, recheckUpdate])

  async function handleUpdateClick() {
    setUpdateError(null)
    setUpdating(true)
    try {
      if (isTauriDesktop) {
        await downloadAndInstallDesktopUpdate(DESKTOP_DOWNLOAD_URL)
      } else {
        await downloadAndInstallUpdate(APK_DOWNLOAD_URL)
      }
    } catch (err) {
      console.error('update failed', err)
      setUpdateError('Não consegui baixar a atualização. Tenta de novo.')
    } finally {
      setUpdating(false)
    }
  }

  const tips: Tip[] = [
    {
      key: 'chat-invite',
      storageKey: 'ferus-visited-chat-config',
      text: 'Você também pode adicionar um amigo no chat com seu contato — clique aqui e saiba mais',
      onClick: onOpenChatInviteDemo,
      enabled: hasFirstChat,
    },
    {
      key: 'community',
      storageKey: 'ferus-visited-groups',
      text: 'Você pode criar ou participar de uma comunidade — clique aqui e saiba mais',
      onClick: onOpenCommunityTip,
      enabled: true,
    },
    {
      key: 'status',
      storageKey: 'ferus-visited-status',
      text: 'Poste fotos, vídeos ou texto que somem em 24h no Status — clique aqui e saiba mais',
      onClick: onOpenStatus,
      enabled: true,
    },
    {
      key: 'appearance',
      storageKey: 'ferus-visited-appearance',
      text: 'Deixe seu app com a sua cara em Aparência — clique aqui e saiba mais',
      onClick: onOpenAppearance,
      enabled: true,
    },
  ]

  const pendingTips = tips.filter((t) => t.enabled && !visited[t.storageKey])

  function handleTipClick(tip: Tip) {
    try {
      localStorage.setItem(tip.storageKey, '1')
    } catch {
      // ignore
    }
    setOpen(false)
    tip.onClick()
  }

  // O ponto no sininho significa exclusivamente "ha uma versao nova".
  // Dicas continuam acessiveis no painel, mas nao simulam uma atualizacao.
  const hasBadge = !!updateVersion

  return (
    <div style={{ position: 'relative' }}>
      <button className="icon-btn" title="Novidades do app" onClick={() => setOpen((v) => !v)}>
        <IconBell size={20} />
      </button>
      {hasBadge && <span className="rail-badge" />}
      {open && (
        <>
          <div className="notif-backdrop" onClick={() => setOpen(false)} />
          <div className="notif-panel">
            {updateVersion && (
              <button
                type="button"
                className="notif-item notif-update"
                disabled={updating}
                onClick={handleUpdateClick}
              >
                <span className="notif-update-bang">!</span>
                <span>{updating ? 'Baixando atualização...' : `Nova versão disponível (v${updateVersion}) — toque pra atualizar`}</span>
              </button>
            )}
            {updateError && <p className="notif-empty error">{updateError}</p>}
            {pendingTips.map((tip) => (
              <button key={tip.key} type="button" className="notif-item" onClick={() => handleTipClick(tip)}>
                <span>{tip.text}</span>
              </button>
            ))}
            {!updateVersion && pendingTips.length === 0 && <p className="notif-empty">nenhuma novidade do app no momento</p>}
          </div>
        </>
      )}
    </div>
  )
}
