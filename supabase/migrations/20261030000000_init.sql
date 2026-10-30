-- 실험 프렙: 사용자별 실험 저장 + 자주 쓰는 시약(분자량) 목록
-- Supabase 대시보드의 SQL Editor에 통째로 붙여넣어 실행하면 된다. (CLI를 쓴다면 `supabase db push`)

-- updated_at 자동 갱신 ------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- 사용자당 저장 개수 제한 (악의적인 가입자가 무료 DB 용량을 채우는 것을 막는다) ------------------------
create or replace function public.enforce_row_limit()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  max_rows integer := tg_argv[0]::integer;
  current_rows integer;
begin
  execute format('select count(*) from %I.%I where user_id = $1', tg_table_schema, tg_table_name)
    into current_rows
    using new.user_id;
  if current_rows >= max_rows then
    raise exception '저장 한도(%개)를 넘었습니다. 오래된 항목을 삭제해 주세요.', max_rows
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

-- 실험: 논문 원문, 사용자가 확인·수정한 시약 목록과 실행 단계, 계산 결과 ---------------------------------
create table public.experiments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title text not null default '' check (char_length(title) <= 120),
  method_text text not null default '' check (char_length(method_text) <= 60000),
  scale_factor numeric not null default 1 check (scale_factor > 0 and scale_factor <= 1000),
  sig_figs smallint not null default 3 check (sig_figs between 1 and 6),
  reagents jsonb not null default '[]'::jsonb
    check (jsonb_typeof(reagents) = 'array' and octet_length(reagents::text) <= 200000),
  steps jsonb not null default '[]'::jsonb
    check (jsonb_typeof(steps) = 'array' and octet_length(steps::text) <= 200000),
  results jsonb not null default '{}'::jsonb
    check (jsonb_typeof(results) = 'object' and octet_length(results::text) <= 400000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index experiments_user_updated_idx on public.experiments (user_id, updated_at desc);

create trigger experiments_set_updated_at
  before update on public.experiments
  for each row execute function public.set_updated_at();

create trigger experiments_row_limit
  before insert on public.experiments
  for each row execute function public.enforce_row_limit(200);

-- 자주 쓰는 시약: 한 번 조회하거나 직접 입력한 분자량을 저장해 다음 분석에서 다시 쓴다 ------------------
-- 사용자별로 따로 둔다. (모두가 함께 쓰는 목록이면 잘못된 값이 다른 사용자에게 퍼질 수 있다)
create table public.user_reagents (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  key text not null check (char_length(key) between 1 and 120),
  name text not null check (char_length(name) between 1 and 120),
  mw numeric not null check (mw > 0 and mw < 10000000),
  formula text check (formula is null or char_length(formula) <= 60),
  source text not null default 'pubchem' check (source in ('pubchem', 'user')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (user_id, key)
);

create trigger user_reagents_set_updated_at
  before update on public.user_reagents
  for each row execute function public.set_updated_at();

create trigger user_reagents_row_limit
  before insert on public.user_reagents
  for each row execute function public.enforce_row_limit(500);

-- 접근 제한: 로그인한 사용자가 본인 행만 읽고 쓸 수 있다 -----------------------------------------------
alter table public.experiments enable row level security;
alter table public.user_reagents enable row level security;

revoke all on public.experiments from anon;
revoke all on public.user_reagents from anon;
grant select, insert, update, delete on public.experiments to authenticated;
grant select, insert, update, delete on public.user_reagents to authenticated;

create policy experiments_select_own on public.experiments
  for select to authenticated using ((select auth.uid()) = user_id);
create policy experiments_insert_own on public.experiments
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy experiments_update_own on public.experiments
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy experiments_delete_own on public.experiments
  for delete to authenticated using ((select auth.uid()) = user_id);

create policy user_reagents_select_own on public.user_reagents
  for select to authenticated using ((select auth.uid()) = user_id);
create policy user_reagents_insert_own on public.user_reagents
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy user_reagents_update_own on public.user_reagents
  for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy user_reagents_delete_own on public.user_reagents
  for delete to authenticated using ((select auth.uid()) = user_id);
