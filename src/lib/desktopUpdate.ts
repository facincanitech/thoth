export async function downloadAndInstallDesktopUpdate(url: string) {
  try {
    // Baixa e roda o instalador direto (o app fecha sozinho quando o instalador abre)
    const { invoke } = await import('@tauri-apps/api/core')
    await invoke('download_and_run_installer', { url })
  } catch {
    // fallback: abre o link no navegador pra baixar na mao
    const { open } = await import('@tauri-apps/plugin-shell')
    await open(url)
  }
}
