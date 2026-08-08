"use client";

import { Employee, employeeLabel } from "@/lib/types";

interface Props {
  employees: Employee[];
  selectedId: string | null;
  onSelect: (id: string | null) => void;
}

export default function EmployeeFilter({ employees, selectedId, onSelect }: Props) {
  return (
    <div className="w-36 shrink-0 space-y-1">
      <p className="text-xs font-medium text-gray-500 px-1 mb-1">근무자별 조회</p>
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`w-full text-left text-sm rounded border px-2 py-1.5 ${
          selectedId === null
            ? "bg-gray-900 text-white border-gray-900"
            : "bg-white hover:bg-gray-50"
        }`}
      >
        전체보기
      </button>
      {employees.map((emp, i) => (
        <button
          key={emp.id}
          type="button"
          onClick={() => onSelect(emp.id)}
          className={`w-full text-left text-sm rounded border px-2 py-1.5 ${
            selectedId === emp.id
              ? "bg-gray-900 text-white border-gray-900"
              : "bg-white hover:bg-gray-50"
          }`}
        >
          <span className="mr-1 text-gray-400">{employeeLabel(i)}</span>
          {emp.name}
        </button>
      ))}
    </div>
  );
}
