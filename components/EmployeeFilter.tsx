"use client";

import { Employee, employeeLabel } from "@/lib/types";
import Button from "./ui/Button";

export type EmployeeFilterMode = "highlight" | "only";

const HELP_TEXT = "클릭: 강조(다중 가능) → 강조된 사람 재클릭: 그 사람만 보기 → 다시 클릭: 전체보기";
const ITEM_CLASS = "justify-start min-[1760px]:w-full";

interface Props {
  employees: Employee[];
  selectedIds: string[];
  mode: EmployeeFilterMode;
  onSelect: (ids: string[], mode: EmployeeFilterMode) => void;
}

// 근무자를 누르면 전체보기 안에서 그 사람이 색으로 강조된다(여러 명 동시에 강조 가능).
// 이미 강조된 사람을 한 번 더 누르면 그 사람 근무만 필터링해서 보여주고(나만 보기),
// 이때 다른 강조는 전부 풀린다. 나만 보기 중에 다른 사람을 누르면 그 사람도 강조에 합류한다.
export default function EmployeeFilter({ employees, selectedIds, mode, onSelect }: Props) {
  const handleClick = (empId: string) => {
    if (mode === "only") {
      const onlyId = selectedIds[0];
      if (empId === onlyId) {
        onSelect([], "highlight");
      } else {
        onSelect([onlyId, empId], "highlight");
      }
      return;
    }

    if (selectedIds.includes(empId)) {
      onSelect([empId], "only");
    } else {
      onSelect([...selectedIds, empId], "highlight");
    }
  };

  // 넓은 화면에선 왼쪽 세로 목록, 좁은 화면에선 근무표 위 가로줄로 나란히 놓인다(page.tsx와 같은 1760px 기준).
  return (
    <div
      className="flex flex-wrap items-center gap-1 min-[1760px]:block min-[1760px]:w-full min-[1760px]:space-y-1"
      title={HELP_TEXT}
    >
      <p className="text-xs font-medium text-black px-1 min-[1760px]:mb-1">근무자별 조회</p>
      <Button
        onClick={() => onSelect([], "highlight")}
        active={selectedIds.length === 0}
        className={ITEM_CLASS}
      >
        전체보기
      </Button>
      {employees.map((emp) => (
        <Button
          key={emp.id}
          onClick={() => handleClick(emp.id)}
          active={selectedIds.includes(emp.id)}
          className={ITEM_CLASS}
        >
          <span className="mr-1 text-black">{employeeLabel(emp.sort_order - 1)}</span>
          {emp.name}
          {selectedIds.includes(emp.id) && (
            <span className="ml-1 text-xs opacity-80">{mode === "highlight" ? "강조" : "나만"}</span>
          )}
        </Button>
      ))}
      <p className="hidden min-[1760px]:block text-[11px] text-black px-1 pt-1 leading-snug">
        {HELP_TEXT}
      </p>
    </div>
  );
}
