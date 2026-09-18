import { useEffect } from 'react'

// Pagina que recebe o retorno do login Google do ThothChat Messenger (desktop).
// O Supabase nao pode redirecionar direto pra ferus://callback a partir do navegador
// do sistema - varios navegadores simplesmente ficam "pensando" pra sempre numa
// navegacao pra um protocolo customizado sem handler confirmado. Por isso o
// redirectTo aponta pra essa pagina (URL https ja liberada no Supabase, a mesma
// usada pelo login web normal), que mostra uma mensagem de sucesso na hora e so
// depois tenta abrir o app via ferus://callback.
export function DesktopLoginCallback() {
  useEffect(() => {
    const target = 'ferus://callback' + window.location.hash
    window.location.href = target
  }, [])

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 12, fontFamily: 'system-ui, sans-serif', textAlign: 'center', padding: 24,
    }}>
      <h1 style={{ fontSize: 20 }}>Login realizado!</h1>
      <p>Pode fechar esta aba e voltar pro ThothChat Messenger.</p>
    </div>
  )
}
