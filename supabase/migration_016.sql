-- v16: 근무표/공휴일/직원 정보가 언제, 누가, 무엇을 바꿨는지 남기는 변경 이력(감사 로그).
-- 트리거로 DB 레벨에서 자동 기록하므로 클라이언트 코드가 깜빡하고 안 남기는 일이 없다.
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create table if not exists audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  row_id text not null, -- shifts/employees는 uuid, holidays는 work_date(날짜) 문자열
  operation text not null check (operation in ('INSERT', 'UPDATE', 'DELETE')),
  changed_by uuid references auth.users(id) on delete set null,
  changed_by_email text,
  old_data jsonb,
  new_data jsonb,
  changed_at timestamptz not null default now()
);

create index if not exists audit_log_table_row_idx on audit_log (table_name, row_id);
create index if not exists audit_log_changed_at_idx on audit_log (changed_at desc);

alter table audit_log enable row level security;

-- 로그인한 사람만 조회 가능. 쓰기는 아래 트리거(security definer)로만 이뤄지고
-- 클라이언트가 직접 insert/update/delete 할 수 있는 정책은 일부러 만들지 않는다.
create policy "audit_log_select_authenticated" on audit_log
  for select using (auth.role() = 'authenticated');

create or replace function audit_log_trigger() returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  actor_email text;
  row_id_val text;
  old_json jsonb;
  new_json jsonb;
begin
  select email into actor_email from auth.users where id = auth.uid();

  if (tg_op = 'DELETE') then
    old_json := to_jsonb(old);
    new_json := null;
    row_id_val := coalesce(old_json->>'id', old_json->>'work_date');
  elsif (tg_op = 'UPDATE') then
    old_json := to_jsonb(old);
    new_json := to_jsonb(new);
    row_id_val := coalesce(new_json->>'id', new_json->>'work_date');
  else
    old_json := null;
    new_json := to_jsonb(new);
    row_id_val := coalesce(new_json->>'id', new_json->>'work_date');
  end if;

  insert into audit_log (table_name, row_id, operation, changed_by, changed_by_email, old_data, new_data)
  values (tg_table_name, row_id_val, tg_op, auth.uid(), actor_email, old_json, new_json);

  if (tg_op = 'DELETE') then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists shifts_audit on shifts;
create trigger shifts_audit
  after insert or update or delete on shifts
  for each row execute function audit_log_trigger();

drop trigger if exists holidays_audit on holidays;
create trigger holidays_audit
  after insert or update or delete on holidays
  for each row execute function audit_log_trigger();

drop trigger if exists employees_audit on employees;
create trigger employees_audit
  after insert or update or delete on employees
  for each row execute function audit_log_trigger();
