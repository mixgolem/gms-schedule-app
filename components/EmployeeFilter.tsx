"use client";

import { Employee, employeeLabel } from "@/lib/types";
import Button from "./ui/Button";

export type EmployeeFilterMode = "highlight" | "only";

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

  return (
    <div className="w-full space-y-1">
      <p className="text-xs font-medium text-black px-1 mb-1">근무자별 조회</p>
      <Button
        onClick={() => onSelect([], "highlight")}
        active={selectedIds.length === 0}
        className="w-full justify-start"
      >
        전체보기
      </Button>
      {employees.map((emp) => (
        <Button
          key={emp.id}
          onClick={() => handleClick(emp.id)}
          active={selectedIds.includes(emp.id)}
          className="w-full justify-start"
        >
          <span className="mr-1 text-black">{employeeLabel(emp.sort_order - 1)}</span>
          {emp.name}
          {selectedIds.includes(emp.id) && (
            <span className="ml-1 text-xs opacity-80">{mode === "highlight" ? "강조" : "나만"}</span>
          )}
        </Button>
      ))}
      <p className="text-[11px] text-black px-1 pt-1 leading-snug">
        클릭: 강조(다중 가능) → 강조된 사람 재클릭: 그 사람만 보기 → 다시 클릭: 전체보기
      </p>
    </div>
  );
}
