-- v15: 근무 중 부분사용(연차/본인대휴/기타) 항목에 사유를 남길 수 있게 컬럼 추가.
-- 특히 "기타"는 무슨 사유인지 구분이 안 되던 걸 보완하는 용도. 필수 입력은 아니다.
-- Supabase 대시보드 > SQL Editor 에서 실행하세요.

alter table shift_leave_usage add column if not exists reason text;
