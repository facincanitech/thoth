export async function downloadAndInstallDesktopUpdate(url: string) {
  const { open } = await import('@tauri-apps/plugin-shell')
  await open(url)
}
