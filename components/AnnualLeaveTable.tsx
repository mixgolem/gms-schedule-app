"use client";

import { useAnnualLeaveLedger } from "@/lib/useAnnualLeaveLedger";
import { employeeLabel } from "@/lib/types";
import EditableNumberCell from "./ui/EditableNumberCell";

interface Props {
  year: number;
  month: number;
  canEdit: boolean;
}

export default function AnnualLeaveTable({ year, month, canEdit }: Props) {
  const { rows, loading, fiscalYearStart, setAllocatedHours } = useAnnualLeaveLedger(year, month);

  if (loading) return null;

  return (
    <div className="border rounded-lg p-3 transition-shadow duration-150 hover:shadow-sm">
      <p className="text-sm font-medium text-black mb-2">
        연차 내역(시간){" "}
        <span className="text-xs text-black font-normal">
          ({fiscalYearStart}년 7월~{fiscalYearStart + 1}년 6월 기준, 사용일은 {month}월만 표시)
        </span>
      </p>
      {canEdit && (
        <p className="text-[11px] text-blue-600 mb-2">
          <span className="inline-block rounded px-1 bg-blue-50/30 border border-dashed border-blue-100 mr-1">
            숫자 ✎
          </span>
          표시된 칸은 클릭해서 직접 수정할 수 있어요. 나머지는 자동 계산된 값이에요.
        </p>
      )}
      <div>
        <table className="text-xs font-bold w-full">
          <thead>
            <tr className="text-left text-blue-900 divide-x divide-gray-300">
              <th className="pb-1 pr-3 font-bold">구분</th>
              <th className="pb-1 pl-2 pr-3 font-bold whitespace-nowrap">이름</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">할당(H)</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">사용</th>
              <th className="pb-1 px-2 font-bold whitespace-nowrap">당월사용일</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">잔여(H)</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">잔여(D)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.employeeId}
                className="border-t divide-x divide-gray-300 transition-colors duration-150 hover:bg-gray-100"
              >
                <td className="py-1 pr-3 text-black">{employeeLabel(row.sortOrder - 1)}</td>
                <td className="py-1 pl-2 pr-3 whitespace-nowrap">{row.employeeName}</td>
                <td className="py-1 px-2 text-right">
                  <EditableNumberCell
                    value={row.allocatedHours}
                    unit="h"
                    canEdit={canEdit}
                    onCommit={(n) => setAllocatedHours(row.employeeId, fiscalYearStart, n)}
                  />
                </td>
                <td className="py-1 px-2 text-right">{row.usedHoursYear ? `${row.usedHoursYear}h` : ""}</td>
                <td className="py-1 px-2 whitespace-nowrap">
                  {row.usedDatesThisMonth.map((d) => `${d}일`).join(", ")}
                </td>
                <td className="py-1 px-2 text-right">{row.remainingHours}h</td>
                <td className="py-1 px-2 text-right">{row.remainingDaysLabel}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
