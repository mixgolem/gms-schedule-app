"use client";

import { Employee, employeeLabel } from "@/lib/types";
import Button from "./ui/Button";

interface Props {
  employees: Employee[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function EmployeeFilter({ employees, selectedId, onSelect }: Props) {
  return (
    <div className="w-full space-y-1">
      <p className="text-xs font-medium text-gray-500 px-1 mb-1">근무자별 조회</p>
      <Button
        onClick={() => onSelect(null)}
        active={selectedId === null}
        className="w-full justify-start"
      >
        전체보기
      </Button>
      {employees.map((emp, i) => (
        <Button
          key={emp.id}
          onClick={() => onSelect(emp.id)}
          active={selectedId === emp.id}
          className="w-full justify-start"
        >
          <span className="mr-1 text-gray-400">{employeeLabel(i)}</span>
          {emp.name}
        </Button>
      ))}
    </div>
  );
}
