// Baixa o instalador novo pra pasta temporaria e roda. O PowerShell (desanexado, sem
// janela) espera o download, fecha este app (o instalador nao consegue sobrescrever
// um exe em uso) e abre o instalador.
#[cfg(desktop)]
#[tauri::command]
fn download_and_run_installer(url: String) -> Result<(), String> {
  #[cfg(windows)]
  {
    use std::os::windows::process::CommandExt;
    if !url.starts_with("https://") {
      return Err("url invalida".into());
    }
    let safe_url = url.replace('\'', "");
    let script = format!(
      "$ErrorActionPreference='Stop'; $p=Join-Path $env:TEMP 'ThothMessenger-Update.exe';        [Net.ServicePointManager]::SecurityProtocol=[Net.SecurityProtocolType]::Tls12;        Invoke-WebRequest -UseBasicParsing -Uri '{}' -OutFile $p;        Stop-Process -Id {} -Force -ErrorAction SilentlyContinue; Start-Process $p",
      safe_url,
      std::process::id()
    );
    std::process::Command::new("powershell")
      .args(["-NoProfile", "-WindowStyle", "Hidden", "-Command", &script])
      .creation_flags(0x08000000)
      .spawn()
      .map_err(|e| e.to_string())?;
    Ok(())
  }
  #[cfg(not(windows))]
  {
    let _ = url;
    Err("so windows".into())
  }
}

// Servidor local temporario pro retorno do login Google: em vez de o navegador tentar
// abrir o app por um protocolo custom (pede confirmacao, falha em alguns PCs), o
// Google/Supabase redireciona pra http://127.0.0.1:PORTA/ - esta pagina le os tokens
// do fragmento da URL, devolve pra ca via /cb e avisa o front igual ao deep link.
#[cfg(desktop)]
const LOGIN_PAGE: &str = "<!doctype html><html><head><meta charset=\"utf-8\"><title>Thoth Messenger</title></head><body style=\"margin:0;height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;font-family:system-ui,sans-serif;background:#0a96ce;color:#fff;text-align:center\"><h2 id=\"t\">Concluindo login...</h2><p id=\"m\"></p><script>var h=location.hash.slice(1);if(h){fetch('/cb?'+h).then(function(){document.getElementById('t').textContent='Login realizado!';document.getElementById('m').textContent='Pode fechar esta aba e voltar pro Thoth Messenger.'}).catch(function(){document.getElementById('t').textContent='Nao consegui falar com o app';document.getElementById('m').textContent='Volte no app e use Colar codigo.'})}else{document.getElementById('t').textContent='Aguardando login...'}</script></body></html>";

#[cfg(desktop)]
#[tauri::command]
fn start_login_server(app: tauri::AppHandle) -> Result<u16, String> {
  use std::io::{Read, Write};
  use std::net::TcpListener;
  use std::time::{Duration, Instant};
  use tauri::Emitter;

  let mut bound = None;
  for port in 53682u16..=53690 {
    if let Ok(l) = TcpListener::bind(("127.0.0.1", port)) {
      bound = Some((l, port));
      break;
    }
  }
  let (listener, port) = bound.ok_or_else(|| "sem porta livre".to_string())?;
  listener.set_nonblocking(true).map_err(|e| e.to_string())?;

  std::thread::spawn(move || {
    let deadline = Instant::now() + Duration::from_secs(300);
    while Instant::now() < deadline {
      match listener.accept() {
        Ok((mut stream, _)) => {
          let _ = stream.set_nonblocking(false);
          let _ = stream.set_read_timeout(Some(Duration::from_secs(5)));
          let mut buf = [0u8; 16384];
          let n = stream.read(&mut buf).unwrap_or(0);
          let req = String::from_utf8_lossy(&buf[..n]).to_string();
          let path = req.lines().next().unwrap_or("").split_whitespace().nth(1).unwrap_or("/").to_string();
          let mut done = false;
          let body = if let Some(q) = path.strip_prefix("/cb?") {
            let _ = app.emit("deep-link", format!("thoth://callback#{}", q));
            done = true;
            "ok".to_string()
          } else {
            LOGIN_PAGE.to_string()
          };
          let resp = format!(
            "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nCache-Control: no-store\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}",
            body.len(),
            body
          );
          let _ = stream.write_all(resp.as_bytes());
          if done {
            break;
          }
        }
        Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(Duration::from_millis(100)),
        Err(_) => break,
      }
    }
  });

  Ok(port)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      use tauri::{Emitter, Manager};
      if let Some(url) = argv.iter().find(|a| a.starts_with("thoth://") || a.starts_with("ferus://")) {
        let _ = app.emit("deep-link", url.clone());
      }
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }));
  }

  builder
    .invoke_handler(tauri::generate_handler![download_and_run_installer, start_login_server])
    .plugin(tauri_plugin_shell::init())
    .plugin(tauri_plugin_deep_link::init())
    .setup(|app| {
      if cfg!(debug_assertions) {
        app.handle().plugin(
          tauri_plugin_log::Builder::default()
            .level(log::LevelFilter::Info)
            .build(),
        )?;
      }

      #[cfg(desktop)]
      {
        use tauri::{
          menu::{Menu, MenuItem, PredefinedMenuItem},
          tray::TrayIconBuilder,
          Emitter, Manager,
        };

        let show_item = MenuItem::with_id(app, "show", "Abrir", true, None::<&str>)?;
        let new_item = MenuItem::with_id(app, "new", "Novo contato", true, None::<&str>)?;
        let status_item = MenuItem::with_id(app, "status", "Status", true, None::<&str>)?;
        let groups_item = MenuItem::with_id(app, "groups", "Grupos", true, None::<&str>)?;
        let communities_item = MenuItem::with_id(app, "communities", "Comunidades", true, None::<&str>)?;
        let play_item = MenuItem::with_id(app, "play", "Thoth Play", true, None::<&str>)?;
        let quit_item = MenuItem::with_id(app, "quit", "Sair", true, None::<&str>)?;
        let sep1 = PredefinedMenuItem::separator(app)?;
        let sep2 = PredefinedMenuItem::separator(app)?;
        let menu = Menu::with_items(
          app,
          &[&show_item, &sep1, &new_item, &status_item, &groups_item, &communities_item, &play_item, &sep2, &quit_item],
        )?;

        // Os itens de atalho (Novo/Status/Grupos/Comunidades) fazem o mesmo que os
        // 3 pontinhos do app/webapp - so avisam o front por evento pra navegar,
        // depois de trazer a janela principal de volta.
        fn show_and_navigate(app: &tauri::AppHandle, target: &str) {
          if let Some(window) = app.get_webview_window("main") {
            let _ = window.show();
            let _ = window.set_focus();
          }
          let _ = app.emit("tray-nav", target);
        }

        TrayIconBuilder::new()
          .icon(app.default_window_icon().unwrap().clone())
          .tooltip("Thoth Messenger")
          .menu(&menu)
          .show_menu_on_left_click(false)
          .on_menu_event(|app, event| match event.id.as_ref() {
            "quit" => app.exit(0),
            // "Abrir" volta pra tela inicial (chats), nao so mostra a janela onde estava
            "show" => show_and_navigate(app, "home"),
            "new" => show_and_navigate(app, "new"),
            "status" => show_and_navigate(app, "status"),
            "groups" => show_and_navigate(app, "groups"),
            "communities" => show_and_navigate(app, "communities"),
            // Thoth Play abre numa janela propria, entao so avisa o front (que
            // ja sabe abrir/focar essa janela) sem forcar a principal aparecer
            "play" => { let _ = app.emit("tray-nav", "play"); }
            _ => {}
          })
          .on_tray_icon_event(|tray, event| {
            if let tauri::tray::TrayIconEvent::Click {
              button: tauri::tray::MouseButton::Left,
              button_state: tauri::tray::MouseButtonState::Up,
              ..
            } = event
            {
              let app = tray.app_handle();
              if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
              }
            }
          })
          .build(app)?;
      }

      Ok(())
    })
    .build(tauri::generate_context!())
    .expect("error while building tauri application")
    .run(|app_handle, event| {
      // Fechar a janela principal ou a do Thoth Play so esconde (manda pra
      // bandeja) em vez de encerrar o app - o estado (sessao, conversas
      // abertas, canal de voz conectado) continua vivo. Precisa ser aqui (no
      // RunEvent global) e nao soh no setup() porque a janela do Play e criada
      // dinamicamente depois, nao existe ainda quando o setup roda. Janelas de
      // chat continuam fechando normal (nao entram nessa lista).
      #[cfg(desktop)]
      if let tauri::RunEvent::WindowEvent { label, event: tauri::WindowEvent::CloseRequested { api, .. }, .. } = event {
        if label == "main" || label == "thoth-play" {
          api.prevent_close();
          if let Some(window) = tauri::Manager::get_webview_window(app_handle, &label) {
            let _ = window.hide();
          }
        }
      }
    });
}
