// Flag definida em tempo de build (build:tauri passa VITE_TAURI=1), nao em runtime -
// tentamos antes checar globalThis.isTauri/window.__TAURI_INTERNALS__ em runtime e
// nenhum dos dois se mostrou confiavel (o app sempre abria no tema errado), essa
// abordagem elimina a ambiguidade: so o build feito especificamente pro .exe liga isso.
export const isTauriDesktop = import.meta.env.VITE_TAURI === '1'
