"use client";

import { useState } from "react";
import { useYearlyStats } from "@/lib/useYearlyStats";
import { getYearDates } from "@/lib/dateUtils";
import { computeMonthlyStats } from "@/lib/workStats";
import StatsTable from "./StatsTable";
import MonthlyStatsTable from "./MonthlyStatsTable";
import Button from "./ui/Button";

interface Props {
  defaultYear: number;
  defaultMonth: number;
}

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);

export default function YearlyStatsTable({ defaultYear, defaultMonth }: Props) {
  // 처음 열었을 때만 지금 보고 있는 근무표의 연/월을 기본값으로 쓰고, 그 뒤로는 이
  // 표 안에서 독립적으로 넘길 수 있다(위쪽 월별 근무표 이동에 따라가지 않음).
  const [year, setYear] = useState(defaultYear);
  const [month, setMonth] = useState(defaultMonth);
  const { employees, shifts, leaveUsages, loading } = useYearlyStats(year);

  const yearRows = computeMonthlyStats(getYearDates(year), employees, shifts, leaveUsages);

  return (
    <div className="border rounded-lg p-3 space-y-4 transition-shadow duration-150 hover:shadow-sm">
      <div className="flex items-center gap-2 flex-wrap">
        <p className="text-sm font-medium text-black">연간 근무 통계</p>
        <div className="flex items-center gap-2 ml-auto">
          <Button onClick={() => setYear((y) => y - 1)} className="px-2.5 py-1" aria-label="이전 연도">
            ◀
          </Button>
          <span className="text-base font-semibold text-black w-16 text-center">{year}년</span>
          <Button onClick={() => setYear((y) => y + 1)} className="px-2.5 py-1" aria-label="다음 연도">
            ▶
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-black py-8 justify-center">
          <div className="h-4 w-4 rounded-full border-2 border-gray-200 border-t-blue-900 animate-spin" />
          불러오는 중...
        </div>
      ) : (
        <>
          <StatsTable
            title={`${year}년 전체 근무시간 통계`}
            caption="(1/1~12/31 전체 합계 · 일 기준 8시간, 본인대휴 사용시간만 차감 · 연차·기타는 차감 없이 업무일 그대로 인정)"
            rows={yearRows}
          />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <p className="text-sm font-medium text-black">월별 상세</p>
              <select
                value={month}
                onChange={(e) => setMonth(Number(e.target.value))}
                aria-label="월 선택"
                className="ml-auto text-sm border rounded-lg px-2 py-1 bg-white cursor-pointer transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
              >
                {MONTHS.map((m) => (
                  <option key={m} value={m}>
                    {m}월
                  </option>
                ))}
              </select>
            </div>
            <MonthlyStatsTable
              year={year}
              month={month}
              employees={employees}
              shifts={shifts}
              leaveUsages={leaveUsages}
            />
          </div>
        </>
      )}
    </div>
  );
}
