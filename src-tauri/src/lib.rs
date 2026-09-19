#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
  let mut builder = tauri::Builder::default();

  #[cfg(desktop)]
  {
    builder = builder.plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
      use tauri::{Emitter, Manager};
      if let Some(url) = argv.iter().find(|a| a.starts_with("ferus://")) {
        let _ = app.emit("deep-link", url.clone());
      }
      if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
      }
    }));
  }

  builder
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
            "show" => {
              if let Some(window) = app.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
              }
            }
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
