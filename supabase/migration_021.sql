-- v21: DEV 메뉴에서 DB 용량(전체 크기 + 테이블별 크기)을 볼 수 있게 하는 조회 함수.
-- 브라우저에서는 DB 용량 같은 시스템 정보를 직접 못 읽어서, 관리자 권한을 확인한 뒤
-- 크기만 돌려주는 함수를 하나 둔다(데이터 내용은 전혀 반환하지 않는다).
-- 관리자(app_metadata.role = 'admin')가 아니면 오류를 내고, 비로그인(anon)은 아예 호출 못 한다.
--
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

create or replace function get_db_usage()
returns json
language plpgsql
security definer
set search_path = public, pg_catalog
as $$
begin
  if coalesce(auth.jwt() -> 'app_metadata' ->> 'role', '') <> 'admin' then
    raise exception '관리자만 조회할 수 있어요' using errcode = '42501';
  end if;

  return json_build_object(
    'database_bytes', pg_database_size(current_database()),
    'tables', coalesce((
      select json_agg(t order by t.total_bytes desc)
      from (
        select c.relname as name, pg_total_relation_size(c.oid) as total_bytes
        from pg_class c
        join pg_namespace n on n.oid = c.relnamespace
        where n.nspname = 'public' and c.relkind = 'r'
      ) t
    ), '[]'::json)
  );
end;
$$;

revoke all on function get_db_usage() from public, anon;
grant execute on function get_db_usage() to authenticated;
