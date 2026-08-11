"use client";

import { useState } from "react";
import { Employee, Shift, employeeLabel } from "@/lib/types";
import { ShiftDefaultsMap } from "@/lib/useShiftDefaults";
import { exportErpExcel } from "@/lib/erpExport";
import Button from "./ui/Button";

interface Props {
  open: boolean;
  employees: Employee[];
  year: number;
  month: number;
  shifts: Shift[];
  holidayDates: Set<string>;
  shiftDefaults: ShiftDefaultsMap;
  onClose: () => void;
}

export default function ErpExportModal({
  open,
  employees,
  year,
  month,
  shifts,
  holidayDates,
  shiftDefaults,
  onClose,
}: Props) {
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const handleSelect = (employee: Employee) => {
    const result = exportErpExcel(employee, year, month, shifts, holidayDates, shiftDefaults);
    if (result.error) {
      setError(result.error);
      return;
    }
    setError(null);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-sm max-h-[80vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">ERP 엑셀 다운로드 — 근무자 선택</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-gray-400 hover:text-gray-700 text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>

        {error && (
          <p className="mx-4 mt-3 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-2 py-1.5">
            {error}
          </p>
        )}

        <div className="flex-1 overflow-y-auto p-4 space-y-1">
          {employees.map((emp) => (
            <Button key={emp.id} onClick={() => handleSelect(emp)} className="w-full justify-start">
              <span className="mr-1 text-gray-400">{employeeLabel(emp.sort_order - 1)}</span>
              {emp.name}
              {emp.employee_number && (
                <span className="ml-auto text-xs text-gray-400">#{emp.employee_number}</span>
              )}
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
