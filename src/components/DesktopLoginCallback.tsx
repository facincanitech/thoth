import { useEffect } from 'react'

// Pagina que recebe o retorno do login Google do ThothChat Messenger (desktop).
// O Supabase nao pode redirecionar direto pra ferus://callback a partir do navegador
// do sistema - varios navegadores simplesmente ficam "pensando" pra sempre numa
// navegacao pra um protocolo customizado sem handler confirmado. Por isso o
// redirectTo aponta pra essa pagina (URL https ja liberada no Supabase, a mesma
// usada pelo login web normal), que mostra uma mensagem de sucesso na hora e so
// depois tenta abrir o app via ferus://callback.
export function DesktopLoginCallback() {
  const target = 'ferus://callback' + window.location.hash

  useEffect(() => {
    // Alguns navegadores so abrem um protocolo customizado quando a navegacao vem
    // de um gesto real do usuario (clique), no window.location.href automatico do
    // useEffect eles ignoram silenciosamente - por isso o botao abaixo tambem existe
    // como caminho garantido, isso aqui e so uma tentativa a mais.
    window.location.href = target
  }, [target])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24,
    }}>
      <h1 style={{ fontSize: 20 }}>Login realizado!</h1>
      <p>Se o ThothChat Messenger não abrir sozinho, clique no botão abaixo.</p>
      <a
        href={target}
        style={{
          padding: '10px 22px', borderRadius: 6, fontWeight: 600, color: '#fff', textDecoration: 'none',
          background: '#087caf',
        }}
      >
        Abrir o ThothChat Messenger
      </a>
    </div>
  )
}
