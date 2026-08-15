-- v17: 감사 로그 개선
-- 1) 실제로 값이 하나도 안 바뀐 저장(예: 근무형태는 그대로 두고 연차/대휴 부분사용만
--    건드린 경우, upsert가 shifts 행에 updated_at만 갱신하며 지나가는 경우)은
--    "변경 없음" 로그를 남기지 않는다.
-- 2) 근무 중 부분사용(연차/본인대휴/기타) 추가·수정·삭제도 감사 로그에 남긴다
--    (지금까지는 shifts만 봐서, 부분사용만 바뀌면 로그에 아무 내용도 안 보였다).
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

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
  -- UPDATE인데 updated_at/created_at 말고는 실질적으로 아무 값도 안 바뀌었으면 건너뛴다.
  if (tg_op = 'UPDATE') then
    if (to_jsonb(old) - 'updated_at' - 'created_at') = (to_jsonb(new) - 'updated_at' - 'created_at') then
      return new;
    end if;
  end if;

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

drop trigger if exists shift_leave_usage_audit on shift_leave_usage;
create trigger shift_leave_usage_audit
  after insert or update or delete on shift_leave_usage
  for each row execute function audit_log_trigger();
