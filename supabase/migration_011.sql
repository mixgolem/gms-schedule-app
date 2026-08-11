-- v11: 로그인 계정별 UI 설정(근무 색상 표시, 정렬 방식) 저장
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create table if not exists user_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  show_colors boolean not null default true,
  sort_mode text not null default 'default' check (sort_mode in ('default', 'byShiftType')),
  updated_at timestamptz not null default now()
);

alter table user_preferences enable row level security;

-- 본인 설정만 읽고 쓸 수 있음
create policy "user_preferences_select_own" on user_preferences
  for select using (auth.uid() = user_id);

create policy "user_preferences_write_own" on user_preferences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
