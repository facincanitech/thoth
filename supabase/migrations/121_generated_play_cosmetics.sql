-- Coleção visual oficial gerada para a Loja do Play.
insert into public.store_items (id, kind, name, description, creator_id, status, manifest, preview_url, asset_url)
values
  ('d1000000-0000-4000-8000-000000000001','avatar_frame','Plasma Glacial','Cristais e energia azul envolvendo sua foto.',null,'published','{"accent":"#25dfff"}','/cosmetics/frame-ice-plasma.png','/cosmetics/frame-ice-plasma.png'),
  ('d1000000-0000-4000-8000-000000000002','avatar_frame','Coração do Vulcão','Obsidiana, lava e faíscas nas bordas.',null,'published','{"accent":"#ff5a13"}','/cosmetics/frame-inferno.png','/cosmetics/frame-inferno.png'),
  ('d1000000-0000-4000-8000-000000000003','avatar_frame','Sakura Imperial','Flores de cerejeira com acabamento delicado.',null,'published','{"accent":"#f58aaa"}','/cosmetics/frame-sakura.png','/cosmetics/frame-sakura.png'),
  ('d1000000-0000-4000-8000-000000000004','avatar_frame','Código Verde','Circuitos e brilho digital inspirados no Matrix.',null,'published','{"accent":"#45ff55"}','/cosmetics/frame-matrix-ai.png','/cosmetics/frame-matrix-ai.png'),
  ('d1000000-0000-4000-8000-000000000005','avatar_frame','Coroa Real','Ouro, púrpura e rubis em uma moldura nobre.',null,'published','{"accent":"#d9a928"}','/cosmetics/frame-royal.png','/cosmetics/frame-royal.png'),
  ('d1000000-0000-4000-8000-000000000006','avatar_frame','Núcleo Galáctico','Nebulosas e estrelas em tons cósmicos.',null,'published','{"accent":"#9b5cff"}','/cosmetics/frame-galaxy.png','/cosmetics/frame-galaxy.png'),
  ('d1000000-0000-4000-8000-000000000007','avatar_frame','Bosque Encantado','Folhas, orvalho e pequenos brilhos da floresta.',null,'published','{"accent":"#35c878"}','/cosmetics/frame-nature.png','/cosmetics/frame-nature.png'),
  ('d1000000-0000-4000-8000-000000000008','avatar_frame','Fenda do Vazio','Energia ultravioleta sobre matéria escura.',null,'published','{"accent":"#8b46ff"}','/cosmetics/frame-void.png','/cosmetics/frame-void.png'),
  ('e1000000-0000-4000-8000-000000000001','nameplate','Aurora Cristal','Card luminoso com aurora e cristais.',null,'published','{"accent":"#82dfff"}','/cosmetics/nameplate-aurora-ai.png','/cosmetics/nameplate-aurora-ai.png'),
  ('e1000000-0000-4000-8000-000000000002','nameplate','Placa Inferno','Obsidiana rachada com lava viva.',null,'published','{"accent":"#ff5a13"}','/cosmetics/nameplate-inferno.png','/cosmetics/nameplate-inferno.png'),
  ('e1000000-0000-4000-8000-000000000003','nameplate','Jardim Sakura','Card claro ornamentado com cerejeiras.',null,'published','{"accent":"#ed8eaa"}','/cosmetics/nameplate-sakura.png','/cosmetics/nameplate-sakura.png'),
  ('e1000000-0000-4000-8000-000000000004','nameplate','Terminal Matrix','Painel digital verde com circuito neon.',null,'published','{"accent":"#45ff55"}','/cosmetics/nameplate-matrix-ai.png','/cosmetics/nameplate-matrix-ai.png'),
  ('e1000000-0000-4000-8000-000000000005','nameplate','Insígnia Real','Card púrpura com ouro e rubis.',null,'published','{"accent":"#d9a928"}','/cosmetics/nameplate-royal.png','/cosmetics/nameplate-royal.png'),
  ('e1000000-0000-4000-8000-000000000006','nameplate','Horizonte Galáctico','Nebulosa profunda para nomes cósmicos.',null,'published','{"accent":"#a35cff"}','/cosmetics/nameplate-galaxy.png','/cosmetics/nameplate-galaxy.png'),
  ('e1000000-0000-4000-8000-000000000007','nameplate','Bosque Vivo','Folhagem encantada em um card natural.',null,'published','{"accent":"#35c878"}','/cosmetics/nameplate-nature.png','/cosmetics/nameplate-nature.png'),
  ('e1000000-0000-4000-8000-000000000008','nameplate','Eco do Vazio','Card escuro cortado por energia ultravioleta.',null,'published','{"accent":"#8b46ff"}','/cosmetics/nameplate-void.png','/cosmetics/nameplate-void.png')
on conflict (id) do update set
  name = excluded.name, description = excluded.description, status = excluded.status,
  manifest = excluded.manifest, preview_url = excluded.preview_url, asset_url = excluded.asset_url;
