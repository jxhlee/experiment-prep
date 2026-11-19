-- 실험 프렙: 보유 시약 목록 (우리 학교·연구실에 있는 시약)
-- 이미 20261030000000_init.sql 을 실행한 프로젝트에서, Supabase 대시보드의 SQL Editor 에 통째로 붙여넣어 실행하면 된다.
-- (init 에서 만든 enforce_row_limit 함수를 그대로 쓴다)
--
-- 확인·수정 단계에서 시약이 이 목록에 있는지 대조해, 없으면 "구매 요망"으로 알려 주는 데 쓴다.
-- 사용자별로 따로 둔다. 같은 학교 사람이 목록을 함께 쓰는 기능은 아니다.

create table public.inventory_items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  -- 이름을 비교용으로 정리한 값(공백·기호를 뺀 소문자). 같은 시약을 두 번 넣지 못하게 한다.
  key text not null check (char_length(key) between 1 and 120),
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- 악의적인 가입자가 무료 DB 용량을 채우는 것을 막는다
create trigger inventory_items_row_limit
  before insert on public.inventory_items
  for each row execute function public.enforce_row_limit(2000);

alter table public.inventory_items enable row level security;

revoke all on public.inventory_items from anon;
grant select, insert, delete on public.inventory_items to authenticated;

create policy inventory_items_select_own on public.inventory_items
  for select to authenticated using ((select auth.uid()) = user_id);
create policy inventory_items_insert_own on public.inventory_items
  for insert to authenticated with check ((select auth.uid()) = user_id);
create policy inventory_items_delete_own on public.inventory_items
  for delete to authenticated using ((select auth.uid()) = user_id);
