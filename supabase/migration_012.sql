-- v12: 반복 근무패턴(예: 7명 49일 순환) 업로드/적용 기능
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create table if not exists shift_patterns (
  id uuid primary key default gen_random_uuid(),
  uploaded_by uuid references auth.users(id) on delete set null,
  uploaded_by_email text,
  filename text not null,
  uploaded_at timestamptz not null default now(),
  pattern jsonb not null -- { days: ({shiftType, isMain} | null)[][] }, 49일 x 7명 등
);

alter table shift_patterns enable row level security;

create policy "shift_patterns_select_all" on shift_patterns for select using (true);

create policy "shift_patterns_write_authenticated" on shift_patterns
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table shift_patterns;
