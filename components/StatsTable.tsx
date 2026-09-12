"use client";

import { employeeLabel } from "@/lib/types";
import { MonthlyStatsRow } from "@/lib/workStats";

interface Props {
  title: string;
  caption: string;
  rows: MonthlyStatsRow[];
}

// 월별/연간 근무시간 통계에서 공통으로 쓰는 표 — 기간(월 하루치 날짜든 연 365일치든)만
// 다르고 집계 방식·표시 형식은 항상 같아서 표 자체를 공유한다.
export default function StatsTable({ title, caption, rows }: Props) {
  return (
    <div className="border rounded-lg p-3 transition-shadow duration-150 hover:shadow-sm">
      <p className="text-sm font-medium text-black mb-2">
        {title} <span className="text-xs text-black font-normal">{caption}</span>
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
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">새벽메인(★)</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">야간메인(★)</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">새벽출근</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">야간출근</th>
              <th className="pb-1 px-2 font-bold text-right whitespace-nowrap">주간출근</th>
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
