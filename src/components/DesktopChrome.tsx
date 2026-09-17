import { currentWindow } from '../lib/desktopWindows'

type TitleBarProps = {
  title: string
}

export function DesktopTitleBar({ title }: TitleBarProps) {
  const win = currentWindow()
  return (
    <header className="titlebar" data-tauri-drag-region>
      <span className="titlebar-brand" data-tauri-drag-region>{title}</span>
      <div className="window-controls">
        <span onClick={() => win.minimize()}>_</span>
        <span onClick={() => win.toggleMaximize()}>□</span>
        <span onClick={() => win.close()}>×</span>
      </div>
    </header>
  )
}

type MenuBarProps = {
  items: string[]
}

export function DesktopMenuBar({ items }: MenuBarProps) {
  return (
    <nav className="menubar">
      {items.map((item) => (
        <button key={item} type="button">{item}</button>
      ))}
    </nav>
  )
}
