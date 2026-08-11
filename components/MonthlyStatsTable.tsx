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
        <span className="text-xs text-gray-600 font-normal">
          (일 기준 8시간, 연차·대휴 사용시간 차감)
        </span>
      </p>
      <div className="overflow-x-auto">
        <table className="text-xs font-bold w-full">
          <thead>
            <tr className="text-left text-blue-900 divide-x divide-gray-300">
              <th className="pb-1 pr-3 font-bold">구분</th>
              <th className="pb-1 pl-2 pr-3 font-bold whitespace-nowrap">이름</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">근무시간합계</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">업무일</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">일평균근무시간</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">새벽메인(☆)</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">야간메인(★)</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">새벽출근</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">야간출근</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">주간출근</th>
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
                <td className="py-1 px-2 text-right">{row.totalHours}h</td>
                <td className="py-1 px-2 text-right">{row.workDays}일</td>
                <td className="py-1 px-2 text-right">{row.avgHoursPerDay}h</td>
                <td className="py-1 px-2 text-right">{row.dawnMainCount}일</td>
                <td className="py-1 px-2 text-right">{row.nightMainCount}일</td>
                <td className="py-1 px-2 text-right">{row.dawnAttendance}일</td>
                <td className="py-1 px-2 text-right">{row.nightAttendance}일</td>
                <td className="py-1 px-2 text-right">{row.dayAttendance}일</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
