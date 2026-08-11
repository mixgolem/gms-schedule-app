-- v10: 직원 사번 추가
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table employees add column if not exists employee_number text;

-- 사번은 입력하면 중복 불가, 비워두는 건(레거시 직원 등) 여러 명 허용
create unique index if not exists employees_employee_number_unique
  on employees (employee_number)
  where employee_number is not null;
