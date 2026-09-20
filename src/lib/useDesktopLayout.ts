import { useEffect, useState } from 'react'
import { Capacitor } from '@capacitor/core'
import { isTauriDesktop } from './platform'

// Estrutura (layout) do app: "desktop" = a do .exe (skin thothmessenger); "celular" = a do APK.
// exe: sempre desktop. APK: sempre celular. Navegador: desktop se a janela for larga, celular se estreita.
// Os temas seguem a estrutura (desktop-webapp = temas do exe, celular-webapp = temas do APK).
const QUERY = '(min-width: 900px)'

export function useDesktopLayout(): boolean {
  const fixed = isTauriDesktop ? true : Capacitor.isNativePlatform() ? false : null
  const [wide, setWide] = useState(() => (fixed !== null ? fixed : window.matchMedia(QUERY).matches))
  useEffect(() => {
    if (fixed !== null) return
    const mq = window.matchMedia(QUERY)
    const onChange = () => setWide(mq.matches)
    mq.addEventListener('change', onChange)
    onChange()
    return () => mq.removeEventListener('change', onChange)
  }, [fixed])
  return fixed !== null ? fixed : wide
}
