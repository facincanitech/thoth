import type { CapacitorConfig } from '@capacitor/cli';

// O APK carrega a interface direto do site publicado (facincanitech.github.io/thoth), em vez de
// levar o HTML/JS/CSS empacotado dentro dele. Isso faz mudança de tema/tela/comportamento/backend
// chegar pra quem já tem o app instalado na hora que abre de novo, sem gerar APK novo - só muda
// build/versionCode quando mexe em algo nativo de verdade (plugin Java, permissão, etc).
// `webDir: 'docs'` continua existindo só pra empacotar o `offline.html` (ver server.errorPath) -
// nenhum outro arquivo de `docs/` é usado quando `server.url` está setado.
const config: CapacitorConfig = {
  appId: 'com.facincanitech.flux',
  appName: 'Flux',
  webDir: 'docs',
  server: {
    url: 'https://facincanitech.github.io/thoth/',
    cleartext: false,
    errorPath: 'offline.html',
  },
};

export default config;
