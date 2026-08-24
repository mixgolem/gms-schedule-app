"use client";

import { useState } from "react";
import { useSpecialNotes } from "@/lib/useSpecialNotes";
import { weekdayLabel } from "@/lib/dateUtils";
import { employeeLabel } from "@/lib/types";
import Button from "./ui/Button";

interface Props {
  year: number;
}

type Scope = "year" | "all";

function formatDate(dateStr: string, withYear: boolean): string {
  const yearPrefix = withYear ? `${Number(dateStr.slice(0, 4))}/` : "";
  return `${yearPrefix}${Number(dateStr.slice(5, 7))}/${Number(dateStr.slice(8, 10))}(${weekdayLabel(dateStr)})`;
}

export default function SpecialNotesTable({ year }: Props) {
  const [scope, setScope] = useState<Scope>("year");
  const { groups, loading } = useSpecialNotes(scope === "year" ? year : null);

  if (loading) {
    return (
      <div className="border rounded-lg p-3 flex items-center gap-2 text-sm text-black justify-center">
        <div className="h-4 w-4 rounded-full border-2 border-gray-200 border-t-blue-900 animate-spin" />
        불러오는 중...
      </div>
    );
  }

  return (
    <div className="border rounded-lg p-3 transition-shadow duration-150 hover:shadow-sm">
      <div className="flex items-center justify-between flex-wrap gap-2 mb-2">
        <p className="text-sm font-medium text-black">
          특이사항{" "}
          <span className="text-xs text-black font-normal">
            ({scope === "year" ? `${year}년` : "전체 기간"})
          </span>
        </p>
        <div className="flex gap-1">
          <Button
            className="text-xs px-2 py-1"
            active={scope === "year"}
            onClick={() => setScope("year")}
          >
            당해년도 조회
          </Button>
          <Button
            className="text-xs px-2 py-1"
            active={scope === "all"}
            onClick={() => setScope("all")}
          >
            전체기간 조회
          </Button>
        </div>
      </div>
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
                  {g.dates.length > 0
                    ? g.dates.map((d) => formatDate(d, scope === "all")).join(", ")
                    : ""}
                </td>
                <td className="py-1 pl-2 text-blue-600">
                  {g.unassignedLeaveDates.length > 0
                    ? g.unassignedLeaveDates.map((d) => formatDate(d, scope === "all")).join(", ")
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
