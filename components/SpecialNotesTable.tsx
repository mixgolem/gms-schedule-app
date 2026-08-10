"use client";

import { useSpecialNotes } from "@/lib/useSpecialNotes";
import { weekdayLabel } from "@/lib/dateUtils";
import { employeeLabel } from "@/lib/types";

function formatDate(dateStr: string): string {
  return `${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}(${weekdayLabel(dateStr)})`;
}

export default function SpecialNotesTable() {
  const { groups, loading } = useSpecialNotes();

  if (loading) return null;

  return (
    <div className="border rounded-lg p-3 transition-shadow duration-150 hover:shadow-sm">
      <p className="text-sm font-medium text-gray-700 mb-2">
        특이사항{" "}
        <span className="text-xs text-gray-400 font-normal">
          (주말 근무인데 대휴가 지정 안 된 경우, 전체 기간)
        </span>
      </p>
      <div className="overflow-x-auto">
        <table className="text-sm w-full">
          <thead>
            <tr className="text-left text-blue-900 text-xs">
              <th className="pb-1 pr-4 font-normal w-10">구분</th>
              <th className="pb-1 pr-4 font-normal w-24">이름</th>
              <th className="pb-1 font-normal">날짜</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g, i) => (
              <tr
                key={g.employeeId}
                className="border-t transition-colors duration-150 hover:bg-gray-100"
              >
                <td className="py-1 pr-4 text-gray-400">{employeeLabel(i)}</td>
                <td className="py-1 pr-4 whitespace-nowrap">{g.employeeName}</td>
                <td className="py-1 text-gray-600">
                  {g.dates.length > 0 ? g.dates.map(formatDate).join(", ") : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
