-- Reaproveita as artes oficiais das placas do Play no catalogo do Messenger.
-- Os itens continuam independentes: equipar no Messenger nao altera o Play.
insert into public.store_items (id, kind, name, description, creator_id, status, manifest, preview_url, asset_url)
values
  ('c2000000-0000-4000-8000-000000000001','messenger_nameplate','Aurora Cristal','Aurora e cristais na lista de contatos do Messenger.',null,'published','{"accent":"#82dfff"}','/cosmetics/nameplate-aurora-ai.png','/cosmetics/nameplate-aurora-ai.png'),
  ('c2000000-0000-4000-8000-000000000002','messenger_nameplate','Placa Inferno','Obsidiana e lava na lista de contatos do Messenger.',null,'published','{"accent":"#ff5a13"}','/cosmetics/nameplate-inferno.png','/cosmetics/nameplate-inferno.png'),
  ('c2000000-0000-4000-8000-000000000003','messenger_nameplate','Jardim Sakura','Cerejeiras ornamentadas na lista de contatos do Messenger.',null,'published','{"accent":"#ed8eaa"}','/cosmetics/nameplate-sakura.png','/cosmetics/nameplate-sakura.png'),
  ('c2000000-0000-4000-8000-000000000004','messenger_nameplate','Terminal Matrix','Circuitos verdes na lista de contatos do Messenger.',null,'published','{"accent":"#45ff55"}','/cosmetics/nameplate-matrix-ai.png','/cosmetics/nameplate-matrix-ai.png'),
  ('c2000000-0000-4000-8000-000000000005','messenger_nameplate','Insígnia Real','Púrpura, ouro e rubis na lista de contatos do Messenger.',null,'published','{"accent":"#d9a928"}','/cosmetics/nameplate-royal.png','/cosmetics/nameplate-royal.png'),
  ('c2000000-0000-4000-8000-000000000006','messenger_nameplate','Horizonte Galáctico','Nebulosa cósmica na lista de contatos do Messenger.',null,'published','{"accent":"#a35cff"}','/cosmetics/nameplate-galaxy.png','/cosmetics/nameplate-galaxy.png'),
  ('c2000000-0000-4000-8000-000000000007','messenger_nameplate','Bosque Vivo','Folhagem encantada na lista de contatos do Messenger.',null,'published','{"accent":"#35c878"}','/cosmetics/nameplate-nature.png','/cosmetics/nameplate-nature.png'),
  ('c2000000-0000-4000-8000-000000000008','messenger_nameplate','Eco do Vazio','Energia ultravioleta na lista de contatos do Messenger.',null,'published','{"accent":"#8b46ff"}','/cosmetics/nameplate-void.png','/cosmetics/nameplate-void.png')
on conflict (id) do update set
  kind = excluded.kind,
  name = excluded.name,
  description = excluded.description,
  status = excluded.status,
  manifest = excluded.manifest,
  preview_url = excluded.preview_url,
  asset_url = excluded.asset_url;
