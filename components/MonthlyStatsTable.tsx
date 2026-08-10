"use client";

import { Employee, Shift, ShiftLeaveUsage, employeeLabel } from "@/lib/types";
import { getMonthDates } from "@/lib/dateUtils";
import { computeMonthlyStats } from "@/lib/workStats";

interface Props {
  year: number;
  month: number;
  employees: Employee[];
  shifts: Shift[];
  leaveUsages: ShiftLeaveUsage[];
}

export default function MonthlyStatsTable({ year, month, employees, shifts, leaveUsages }: Props) {
  const monthDates = getMonthDates(year, month);
  const rows = computeMonthlyStats(monthDates, employees, shifts, leaveUsages);

  return (
    <div className="border rounded-lg p-3 transition-shadow duration-150 hover:shadow-sm">
      <p className="text-sm font-medium text-gray-700 mb-2">
        {month}월 근무시간 통계{" "}
        <span className="text-xs text-gray-400 font-normal">
          (일 기준 8시간, 연차·대휴 사용시간 차감)
        </span>
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs w-full">
          <thead>
            <tr className="text-left text-blue-900">
              <th className="pb-1 pr-3 font-normal">구분</th>
              <th className="pb-1 pr-3 font-normal whitespace-nowrap">이름</th>
              <th className="pb-1 px-2 font-normal text-right whitespace-nowrap">근무시간합계</th>
              <th className="pb-1 px-2 font-normal text-right whitespace-nowrap">업무일</th>
              <th className="pb-1 px-2 font-normal text-right whitespace-nowrap">일평균근무시간</th>
              <th className="pb-1 px-2 font-normal text-right whitespace-nowrap">새벽메인(☆)</th>
              <th className="pb-1 px-2 font-normal text-right whitespace-nowrap">야간메인(★)</th>
              <th className="pb-1 px-2 font-normal text-right whitespace-nowrap">새벽출근</th>
              <th className="pb-1 px-2 font-normal text-right whitespace-nowrap">야간출근</th>
              <th className="pb-1 px-2 font-normal text-right whitespace-nowrap">주간출근</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={row.employeeId}
                className="border-t transition-colors duration-150 hover:bg-gray-100"
              >
                <td className="py-1 pr-3 text-gray-400">{employeeLabel(i)}</td>
                <td className="py-1 pr-3 whitespace-nowrap">{row.employeeName}</td>
                <td className="py-1 px-2 text-right">{row.totalHours}</td>
                <td className="py-1 px-2 text-right">{row.workDays}</td>
                <td className="py-1 px-2 text-right">{row.avgHoursPerDay}</td>
                <td className="py-1 px-2 text-right">{row.dawnMainCount}</td>
                <td className="py-1 px-2 text-right">{row.nightMainCount}</td>
                <td className="py-1 px-2 text-right">{row.dawnAttendance}</td>
                <td className="py-1 px-2 text-right">{row.nightAttendance}</td>
                <td className="py-1 px-2 text-right">{row.dayAttendance}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
