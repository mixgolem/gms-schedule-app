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
      <p className="text-sm font-medium text-black mb-2">
        특이사항{" "}
        <span className="text-xs text-black font-normal">(전체 기간)</span>
      </p>
      <div>
        <table className="text-xs font-bold w-full">
          <thead>
            <tr className="text-left text-blue-900 divide-x divide-gray-300">
              <th className="pb-1 pr-4 font-bold w-10">구분</th>
              <th className="pb-1 pl-2 pr-4 font-bold w-24">이름</th>
              <th className="pb-1 pl-2 pr-4 font-bold">주말근무 · 대휴 미지정</th>
              <th className="pb-1 pl-2 font-bold">대휴 · 원래근무일 미지정</th>
            </tr>
          </thead>
          <tbody>
            {groups.map((g) => (
              <tr
                key={g.employeeId}
                className="border-t divide-x divide-gray-300 transition-colors duration-150 hover:bg-gray-100"
              >
                <td className="py-1 pr-4 text-black">{employeeLabel(g.sortOrder - 1)}</td>
                <td className="py-1 pl-2 pr-4 whitespace-nowrap">{g.employeeName}</td>
                <td className="py-1 pl-2 pr-4 text-black">
                  {g.dates.length > 0 ? g.dates.map(formatDate).join(", ") : ""}
                </td>
                <td className="py-1 pl-2 text-blue-600">
                  {g.unassignedLeaveDates.length > 0
                    ? g.unassignedLeaveDates.map(formatDate).join(", ")
                    : ""}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
