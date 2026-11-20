-- =========================================================
-- MEU TREINO — estrutura do banco
-- Cole tudo no Supabase: SQL Editor → New query → Run
-- =========================================================

-- Fichas (Treino A, B, C…)
create table if not exists public.fichas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  letra text not null,
  nome text not null default '',
  ordem int not null default 0,
  origem text not null default 'manual',          -- 'manual' | 'print'
  atualizado_em timestamptz not null default now(),
  criado_em timestamptz not null default now()
);

-- Exercícios de cada ficha
create table if not exists public.exercicios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ficha_id uuid not null references public.fichas(id) on delete cascade,
  ordem int not null default 0,
  nome text not null,
  series int not null default 3,
  reps text not null default '12',                -- texto: aceita "10", "8-12", "falha"
  carga_prevista numeric,                         -- kg da ficha (pode ficar vazio)
  descanso_seg int not null default 90,
  obs text not null default '',
  ativo boolean not null default true,            -- removido da ficha = false (histórico fica)
  criado_em timestamptz not null default now()
);

-- Opções de equipamento (1, 2 e 3) de cada exercício
create table if not exists public.equipamentos (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  exercicio_id uuid not null references public.exercicios(id) on delete cascade,
  opcao int not null check (opcao between 1 and 3),
  nome text not null default '',
  local text not null default '',
  foto_path text,
  unique (exercicio_id, opcao)
);

-- Cada treino feito (início, fim, foto)
create table if not exists public.sessoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  ficha_id uuid references public.fichas(id) on delete set null,
  ficha_nome text not null default '',
  inicio timestamptz not null default now(),
  fim timestamptz,
  foto_path text,
  notas text not null default ''
);

-- Cada série feita
create table if not exists public.series_feitas (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  sessao_id uuid not null references public.sessoes(id) on delete cascade,
  exercicio_id uuid references public.exercicios(id) on delete set null,
  exercicio_nome text not null default '',
  equipamento_opcao int not null default 1,
  numero int not null,
  carga numeric,
  reps int,
  descanso_seg int,                               -- descanso real antes desta série
  feita_em timestamptz not null default now()
);

-- Avaliação física (academia ou medida em casa)
create table if not exists public.avaliacoes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data date not null default current_date,
  origem text not null default 'manual',          -- 'manual' | 'print' | 'casa'
  peso numeric,
  gordura numeric,
  massa_magra numeric,
  imc numeric,
  medidas jsonb not null default '{}'::jsonb,     -- {"Braço direito": 35.5, "Cintura": 88, ...}
  proxima date
);

create index if not exists idx_ex_ficha on public.exercicios(ficha_id);
create index if not exists idx_series_sessao on public.series_feitas(sessao_id);
create index if not exists idx_series_ex on public.series_feitas(exercicio_id, feita_em desc);
create index if not exists idx_sessoes_user on public.sessoes(user_id, inicio desc);

-- ---------- Perfis: quem é admin e se a conta está liberada ----------
create table if not exists public.perfis (
  id uuid primary key references auth.users(id) on delete cascade,
  nome text not null default '',
  email text not null default '',
  papel text not null default 'cliente' check (papel in ('admin','cliente')),
  ativo boolean not null default false,             -- toda conta nasce bloqueada; o admin libera
  acesso_ate date,                                  -- vazio = não vence
  criado_em timestamptz not null default now()
);
alter table public.perfis enable row level security;

create or replace function public.eh_admin() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.perfis where id = auth.uid() and papel = 'admin' and ativo);
$$;
create or replace function public.conta_ativa() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.perfis
    where id = auth.uid() and ativo
      and (papel = 'admin' or acesso_ate is null or acesso_ate >= (now() at time zone 'America/Sao_Paulo')::date)
  );
$$;
revoke execute on function public.eh_admin() from public, anon;
revoke execute on function public.conta_ativa() from public, anon;
grant execute on function public.eh_admin() to authenticated;
grant execute on function public.conta_ativa() to authenticated;

drop policy if exists "ver o proprio perfil ou admin" on public.perfis;
create policy "ver o proprio perfil ou admin" on public.perfis for select to authenticated
  using (id = (select auth.uid()) or (select public.eh_admin()));
grant select on public.perfis to authenticated;   -- alterações só pela função "admin"

create or replace function public.criar_perfil() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.perfis (id, email, nome)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'nome', ''))
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.criar_perfil() from public, anon, authenticated;
drop trigger if exists ao_criar_usuario on auth.users;
create trigger ao_criar_usuario after insert on auth.users
  for each row execute function public.criar_perfil();

-- Para virar admin (troque o e-mail e rode depois de criar sua conta):
-- update public.perfis set papel = 'admin', ativo = true where email = 'seu@email.com';

-- ---------- Segurança: cada um só vê os próprios dados, e só com a conta liberada ----------
do $$
declare t text;
begin
  foreach t in array array['fichas','exercicios','equipamentos','sessoes','series_feitas','avaliacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('create policy "dono" on public.%I for all to authenticated using (user_id = (select auth.uid()) and (select public.conta_ativa())) with check (user_id = (select auth.uid()) and (select public.conta_ativa()))', t);
    -- projetos novos do Supabase não dão acesso automático às tabelas: libera só para quem está logado
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant usage on schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;
-- a função "admin" usa a chave de servidor (service_role), que também precisa de acesso explícito
grant usage on schema public to service_role;
grant select, insert, update, delete on all tables in schema public to service_role;
grant usage, select on all sequences in schema public to service_role;

-- ---------- Fotos (bucket privado) ----------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists "fotos do dono - ler" on storage.objects;
drop policy if exists "fotos do dono - enviar" on storage.objects;
drop policy if exists "fotos do dono - alterar" on storage.objects;
drop policy if exists "fotos do dono - apagar" on storage.objects;

create policy "fotos do dono - ler" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.conta_ativa()));
create policy "fotos do dono - enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.conta_ativa()));
create policy "fotos do dono - alterar" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.conta_ativa()));
create policy "fotos do dono - apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = (select auth.uid())::text and (select public.conta_ativa()));

-- ---------- Estatísticas para conquistas e calendário (respeita o RLS: cada um só soma o que é seu) ----------
create or replace function public.minhas_estatisticas() returns json
language sql stable security invoker set search_path = '' as $$
  select json_build_object(
    'dias', coalesce((select json_agg(d order by d) from (
        select distinct (inicio at time zone 'America/Sao_Paulo')::date as d
        from public.sessoes where user_id = (select auth.uid()) and fim is not null) x), '[]'::json),
    'treinos', (select count(*) from public.sessoes where user_id = (select auth.uid()) and fim is not null),
    'volume', (select coalesce(sum(coalesce(carga, 0) * coalesce(reps, 0)), 0) from public.series_feitas where user_id = (select auth.uid())),
    'series', (select count(*) from public.series_feitas where user_id = (select auth.uid())),
    'carga_max', (select max(carga) from public.series_feitas where user_id = (select auth.uid())),
    'ex_carga_max', (select exercicio_nome from public.series_feitas where user_id = (select auth.uid()) and carga is not null order by carga desc limit 1)
  );
$$;
revoke execute on function public.minhas_estatisticas() from public, anon;
grant execute on function public.minhas_estatisticas() to authenticated;
