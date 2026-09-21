import { useEffect } from 'react'
import { Capacitor } from '@capacitor/core'
import { App as CapacitorApp } from '@capacitor/app'
import { supabase } from './supabase'

const ACTIVITY_KEY = 'thoth-last-activity'
// Sem nenhuma janela do app em foco por mais que isso = "ausente" (borda amarela: app aberto, mas a pessoa esta em outro app)
const AWAY_AFTER_MS = 60000
// APK minimizado: o Android congela o app; marca ausente e segura por esse tempo antes de virar offline (avatar a 50%)
const BACKGROUND_GRACE_MS = 10 * 60000

function readSharedActivity(): number {
  try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0 } catch { return 0 }
}

// Presenca: grava last_seen_at a cada 30s em toda janela aberta (principal, Thoth Play, conversas).
// "Atividade" = alguma janela do app em foco / clique / tecla, compartilhada entre janelas via localStorage.
//   online  = app aberto e em uso        (borda verde, 100%)
//   ausente = app aberto, mas em outro app (borda amarela, 100%)
//   offline = app fechado                (50%)
export function useHeartbeat(userId: string | undefined) {
  useEffect(() => {
    if (!userId) return
    let lastWrite = 0
    function markActive() {
      const now = Date.now()
      if (now - lastWrite > 4000) {
        lastWrite = now
        try { localStorage.setItem(ACTIVITY_KEY, String(now)) } catch { /* ignore */ }
      }
    }
    const events = ['mousedown', 'keydown', 'touchstart', 'focus']
    events.forEach((ev) => window.addEventListener(ev, markActive, { passive: true }))
    if (document.hasFocus()) markActive()

    const heartbeat = () => {
      if (document.hasFocus()) markActive()
      const isIdle = Date.now() - readSharedActivity() > AWAY_AFTER_MS
      supabase.from('profiles').update({ last_seen_at: new Date().toISOString(), is_idle: isIdle }).eq('id', userId).then()
    }
    heartbeat()
    const interval = setInterval(heartbeat, 30000)
    document.addEventListener('visibilitychange', heartbeat)

    let appStateHandle: { remove: () => void } | null = null
    if (Capacitor.isNativePlatform()) {
      CapacitorApp.addListener('appStateChange', ({ isActive }) => {
        if (isActive) { markActive(); heartbeat(); return }
        // indo pro segundo plano: o JS para de rodar, entao deixa a presenca "ausente" com validade
        supabase.from('profiles').update({ last_seen_at: new Date(Date.now() + BACKGROUND_GRACE_MS).toISOString(), is_idle: true }).eq('id', userId).then()
      }).then((h) => { appStateHandle = h })
    }
    return () => {
      clearInterval(interval)
      events.forEach((ev) => window.removeEventListener(ev, markActive))
      document.removeEventListener('visibilitychange', heartbeat)
      appStateHandle?.remove()
    }
  }, [userId])
}
