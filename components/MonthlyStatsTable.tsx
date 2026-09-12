"use client";

import { Employee, Shift, ShiftLeaveUsage } from "@/lib/types";
import { getMonthDates } from "@/lib/dateUtils";
import { computeMonthlyStats } from "@/lib/workStats";
import StatsTable from "./StatsTable";

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
    <StatsTable
      title={`${month}월 근무시간 통계`}
      caption="(일 기준 8시간, 본인대휴 사용시간만 차감 · 연차·기타는 차감 없이 업무일 그대로 인정)"
      rows={rows}
    />
  );
}
