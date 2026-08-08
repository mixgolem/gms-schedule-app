-- 직원 초기 데이터
-- schema.sql 실행 후, SQL Editor 에서 실행하세요.
-- 박세철은 현재 근무 중이 아니라 active=false로 넣어둠 (복귀 시 UPDATE employees SET active = true WHERE name = '박세철';)

insert into employees (name, sort_order, active) values
  ('서진환', 1, true),
  ('송병진', 2, true),
  ('강정민', 3, true),
  ('강지소', 4, true),
  ('성치웅', 5, true),
  ('김찬영', 6, true),
  ('박세철', 7, false);
