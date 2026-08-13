import { Employee } from "./types";

// 헤더 글자(A,B,C...)를 0-based 슬롯 번호로. A~Z까지 지원해 사실상 인원수 제한이 없다.
export function letterToSlotIndex(letter: string): number | null {
  if (letter.length !== 1) return null;
  const code = letter.toUpperCase().charCodeAt(0);
  if (code < 65 || code > 90) return null;
  return code - 65;
}

export interface EmployeeColumn {
  // 원본 엑셀에서 이 슬롯이 몇 번째 근무자 열(0 = B열)인지. 헤더에 이 글자가 아예
  // 없으면 null — 이 경우 이 슬롯은 파일에서 전혀 언급되지 않은 것이므로 절대 건드리지 않는다.
  fileCol: number | null;
  // 지금 이 글자(슬롯)를 가진 직원. 자리는 있지만 지금은 아무도 없으면 null.
  employee: Employee | null;
}

// 헤더 행(1행)의 B열부터를 읽어 각 열이 A,B,C... 중 무엇인지 파악하고, 결과 배열의
// 위치 자체를 그 글자의 순번(A=0,B=1...)에 맞춘다. 그래서 열을 아무 순서로 입력해도
// 안전하게 올바른 직원에 매칭되고, employeeLabel(index)로 항상 정확한 글자를 되돌릴 수 있다.
export function resolveEmployeeColumns(
  headerRow: unknown[],
  employees: Employee[]
): EmployeeColumn[] {
  const fileColBySlot = new Map<number, number>();
  let maxSlot = -1;

  for (let col = 1; col < headerRow.length; col++) {
    const raw = headerRow[col];
    const label = raw !== undefined && raw !== null ? String(raw).trim() : "";
    if (!label) continue;
    const slotIndex = letterToSlotIndex(label);
    if (slotIndex === null) continue;
    fileColBySlot.set(slotIndex, col - 1);
    if (slotIndex > maxSlot) maxSlot = slotIndex;
  }

  const bySortOrder = new Map<number, Employee>();
  for (const e of employees) bySortOrder.set(e.sort_order, e);

  const columns: EmployeeColumn[] = [];
  for (let slot = 0; slot <= maxSlot; slot++) {
    columns.push({
      fileCol: fileColBySlot.get(slot) ?? null,
      employee: bySortOrder.get(slot + 1) ?? null,
    });
  }
  return columns;
}
