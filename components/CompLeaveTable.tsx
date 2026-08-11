"use client";

import { useCompLeaveLedger, MONTH_ORDER, monthColumnToYearMonth } from "@/lib/useCompLeaveLedger";
import { employeeLabel } from "@/lib/types";
import EditableNumberCell from "./ui/EditableNumberCell";

interface Props {
  year: number;
  month: number;
  canEdit: boolean;
}

export default function CompLeaveTable({ year, month, canEdit }: Props) {
  const { rows, loading, setMonthlyHours, setUsedHours } = useCompLeaveLedger(year, month);

  if (loading) return null;

  return (
    <div className="border rounded-lg p-3 transition-shadow duration-150 hover:shadow-sm">
      <p className="text-sm font-medium text-gray-700 mb-2">
        대체휴무 내역{" "}
        <span className="text-xs text-gray-600 font-normal">
          ({year - 1}년 12월 ~ {year}년 11월, 당월 내역은 {month}월 기준)
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
      <div className="overflow-x-auto">
        <table className="text-xs font-bold w-full">
          <thead>
            <tr className="text-left text-blue-900 divide-x divide-gray-300">
              <th className="pb-1 pr-3 font-bold">구분</th>
              <th className="pb-1 pl-2 pr-3 font-bold whitespace-nowrap">이름</th>
              {MONTH_ORDER.map((m) => (
                <th key={m} className="pb-1 px-2 font-bold text-right">
                  {m}월
                </th>
              ))}
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">대휴누적</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">사용누적</th>
              <th className="pb-1 px-2 font-bold whitespace-nowrap">사용가능</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">당월사용(시간)</th>
              <th className="pb-1 px-2 font-bold whitespace-nowrap">당월사용(날짜)</th>
              <th
                className="pb-1 px-2 font-bold text-right whitespace-nowrap cursor-help"
                title="야간근무 1회당 1시간 + 공휴일근무 1일당 12시간 (공휴일 야간근무는 13시간). 실제 근무기록 기준 참고용 계산치이며, 해당 월 칸에는 직접 입력해야 반영돼요."
              >
                금월발생(참고)
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.employeeId}
                className="border-t divide-x divide-gray-300 transition-colors duration-150 hover:bg-gray-100"
              >
                <td className="py-1 pr-3 text-gray-400">{employeeLabel(i)}</td>
                <td className="py-1 pl-2 pr-3 whitespace-nowrap">{row.employeeName}</td>
                {row.monthlyHours.map((v, ci) => {
                  const { year: y, month: m } = monthColumnToYearMonth(year, ci);
                  return (
                    <td key={ci} className="py-1 px-2 text-right">
                      <EditableNumberCell
                        value={v}
                        unit="h"
                        canEdit={canEdit}
                        onCommit={(n) => setMonthlyHours(row.employeeId, y, m, n)}
                      />
                    </td>
                  );
                })}
                <td className="py-1 px-2 text-right">{row.accruedTotal}h</td>
                <td className="py-1 px-2 text-right">
                  <EditableNumberCell
                    value={row.usedTotal}
                    unit="h"
                    canEdit={canEdit}
                    onCommit={(n) => setUsedHours(row.employeeId, year, n)}
                  />
                </td>
                <td className="py-1 px-2 whitespace-nowrap">{row.availableLabel}</td>
                <td className="py-1 px-2 text-right">
                  {row.usedThisMonthHours ? `${row.usedThisMonthHours}h` : ""}
                </td>
                <td className="py-1 px-2 whitespace-nowrap">
                  {row.usedThisMonthDates.map((d) => `${d}일`).join(", ")}
                </td>
                <td className="py-1 px-2 text-right text-gray-500">
                  {row.autoAccrualThisMonth ? `${row.autoAccrualThisMonth}h` : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
