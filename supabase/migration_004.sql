-- v4: 대휴-원래근무일 연결, 공지사항 메모
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table shifts add column if not exists leave_for_date date;

create table if not exists notice (
  id int primary key default 1 check (id = 1),
  content text not null default '',
  updated_at timestamptz not null default now()
);

insert into notice (id, content) values (1, '') on conflict (id) do nothing;

alter table notice enable row level security;

create policy "notice_select_all" on notice for select using (true);

create policy "notice_write_authenticated" on notice
  for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

alter publication supabase_realtime add table notice;
