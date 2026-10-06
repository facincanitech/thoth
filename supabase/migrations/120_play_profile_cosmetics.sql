-- Cosméticos públicos equipados no perfil do Play e novas categorias da Loja Thoth.
alter table public.store_items drop constraint if exists store_items_kind_check;
alter table public.store_items alter column creator_id drop not null;
alter table public.store_items add constraint store_items_kind_check
  check (kind in ('theme','sound','wink','sticker','emoji','avatar_frame','nameplate','profile_background'));

alter table public.store_preferences
  add column if not exists active_avatar_frame_id uuid references public.store_items(id) on delete set null,
  add column if not exists active_nameplate_id uuid references public.store_items(id) on delete set null,
  add column if not exists active_profile_background_id uuid references public.store_items(id) on delete set null;

alter table public.play_profiles
  add column if not exists avatar_frame jsonb,
  add column if not exists nameplate jsonb;

alter table public.play_profiles add constraint play_profiles_avatar_frame_shape check (
  avatar_frame is null or
  (jsonb_typeof(avatar_frame) = 'object' and avatar_frame ? 'item_id' and char_length(coalesce(avatar_frame->>'asset_url','')) <= 2048)
);
alter table public.play_profiles add constraint play_profiles_nameplate_shape check (
  nameplate is null or
  (jsonb_typeof(nameplate) = 'object' and nameplate ? 'item_id' and char_length(coalesce(nameplate->>'asset_url','')) <= 2048)
);

insert into public.store_items (id, kind, name, description, creator_id, status, manifest, preview_url, asset_url)
values
  ('a1000000-0000-4000-8000-000000000001','avatar_frame','Neon Ciano','Moldura luminosa para o avatar no Thoth Play.',null,'published','{"accent":"#20e7ff"}','/cosmetics/frame-neon-cyan.svg','/cosmetics/frame-neon-cyan.svg'),
  ('a1000000-0000-4000-8000-000000000002','avatar_frame','Pulso Rosa','Moldura rosa vibrante com brilho suave.',null,'published','{"accent":"#ff4fad"}','/cosmetics/frame-pink-pulse.svg','/cosmetics/frame-pink-pulse.svg'),
  ('a1000000-0000-4000-8000-000000000003','avatar_frame','Circuito Verde','Moldura tecnológica inspirada no Matrix.',null,'published','{"accent":"#36ff67"}','/cosmetics/frame-matrix.svg','/cosmetics/frame-matrix.svg'),
  ('b1000000-0000-4000-8000-000000000001','nameplate','Aurora','Placa clara com degradê de aurora.',null,'published','{"accent":"#7a7ee8"}','/cosmetics/nameplate-aurora.svg','/cosmetics/nameplate-aurora.svg'),
  ('b1000000-0000-4000-8000-000000000002','nameplate','Cyber Grid','Placa escura com linhas neon.',null,'published','{"accent":"#20e7ff"}','/cosmetics/nameplate-cyber.svg','/cosmetics/nameplate-cyber.svg'),
  ('b1000000-0000-4000-8000-000000000003','nameplate','Solar','Placa dourada clara e elegante.',null,'published','{"accent":"#d49a21"}','/cosmetics/nameplate-solar.svg','/cosmetics/nameplate-solar.svg')
on conflict (id) do nothing;
