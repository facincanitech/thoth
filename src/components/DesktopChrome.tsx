import { currentWindow } from '../lib/desktopWindows'
import thothLogo from '../../logo/toth_chat.png'

type TitleBarProps = {
  title: string
}

export function DesktopTitleBar({ title }: TitleBarProps) {
  const win = currentWindow()
  return (
    <header className="titlebar" data-tauri-drag-region>
      <img className="titlebar-logo" src={thothLogo} alt="" data-tauri-drag-region />
      <span className="titlebar-brand" data-tauri-drag-region>{title}</span>
      <div className="window-controls">
        <button type="button" className="window-minimize" aria-label="Minimizar" onClick={() => win.minimize()}><span /></button>
        <button type="button" className="window-maximize" aria-label="Maximizar ou restaurar" onClick={() => win.toggleMaximize()}><span /></button>
        <button type="button" className="window-close" aria-label="Fechar" onClick={() => win.close()}><span /></button>
      </div>
    </header>
  )
}
