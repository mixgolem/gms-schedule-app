// 전체 백업/복원 대상 테이블 목록. export/restore 양쪽에서 같이 쓰는 단일 기준점.
export interface BackupTableConfig {
  table: string;
  pk: string; // 정렬(페이지네이션 안정성)과 "전체 삭제" 필터에 쓰는 기본키 컬럼명
  label: string;
}

export const BACKUP_TABLE_CONFIG: BackupTableConfig[] = [
  { table: "employees", pk: "id", label: "직원" },
  { table: "shifts", pk: "id", label: "근무표" },
  { table: "shift_leave_usage", pk: "id", label: "연차/대휴/기타 사용내역" },
  { table: "holidays", pk: "work_date", label: "공휴일" },
  { table: "notice", pk: "id", label: "공지사항" },
  { table: "shift_type_defaults", pk: "shift_type", label: "근무시간 설정" },
  { table: "comp_leave_monthly", pk: "id", label: "대휴 월별발생(수기)" },
  { table: "comp_leave_summary", pk: "id", label: "대휴 사용누적(수기)" },
  { table: "annual_leave_allocation", pk: "id", label: "연차 할당(수기)" },
];
