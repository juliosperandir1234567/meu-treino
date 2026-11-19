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

-- ---------- Segurança: cada um só vê os próprios dados ----------
do $$
declare t text;
begin
  foreach t in array array['fichas','exercicios','equipamentos','sessoes','series_feitas','avaliacoes'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists "dono" on public.%I', t);
    execute format('create policy "dono" on public.%I for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid())', t);
    -- projetos novos do Supabase não dão acesso automático às tabelas: libera só para quem está logado
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
  end loop;
end $$;
grant usage on schema public to authenticated;
grant usage, select on all sequences in schema public to authenticated;

-- ---------- Fotos (bucket privado) ----------
insert into storage.buckets (id, name, public)
values ('fotos', 'fotos', false)
on conflict (id) do nothing;

drop policy if exists "fotos do dono - ler" on storage.objects;
drop policy if exists "fotos do dono - enviar" on storage.objects;
drop policy if exists "fotos do dono - alterar" on storage.objects;
drop policy if exists "fotos do dono - apagar" on storage.objects;

create policy "fotos do dono - ler" on storage.objects for select to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos do dono - enviar" on storage.objects for insert to authenticated
  with check (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos do dono - alterar" on storage.objects for update to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "fotos do dono - apagar" on storage.objects for delete to authenticated
  using (bucket_id = 'fotos' and (storage.foldername(name))[1] = auth.uid()::text);
