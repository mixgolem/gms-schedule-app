"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { getMonthDates } from "@/lib/dateUtils";
import { debounce } from "@/lib/debounce";

// 표시 순서: 12월(전년) → 1월~11월(해당 연도)
export const MONTH_ORDER = [12, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];

// 12월~11월 표 안에서의 열 인덱스(0~11)를 실제 (연,월)로 변환
export function monthColumnToYearMonth(fiscalYear: number, columnIndex: number) {
  const month = MONTH_ORDER[columnIndex];
  const year = month === 12 ? fiscalYear - 1 : fiscalYear;
  return { year, month };
}

export interface CompLeaveRow {
  employeeId: string;
  employeeName: string;
  sortOrder: number;
  monthlyHours: number[]; // MONTH_ORDER 순서
  accruedTotal: number; // 대휴누적시간
  usedTotal: number; // 사용누적시간(수동입력)
  availableLabel: string; // "N일 N시간 N분"
  usedThisMonthHours: number; // 당월 본인 대휴 사용시간
  usedThisMonthDates: number[]; // 당월 사용 일자 목록
  autoAccrualThisMonth: number; // 당월 근무기록 기준 자동 계산된 발생시간 (참고용)
}

// 대체휴무 발생시간 계산 규칙: 야간근무 1회당 1시간, 공휴일 근무 1일당 12시간
// (공휴일에 야간근무를 하면 12+1=13시간). 실제 발생 등록은 여전히 수기 입력이며,
// 이 값은 그 입력을 위한 참고용 계산치다.
function computeAutoAccrual(
  shifts: { work_date: string; shift_type: string }[],
  holidayDates: Set<string>
): number {
  let hours = 0;
  for (const s of shifts) {
    const isWork = s.shift_type === "dawn" || s.shift_type === "day" || s.shift_type === "night";
    if (!isWork) continue;
    if (holidayDates.has(s.work_date)) hours += 12;
    if (s.shift_type === "night") hours += 1;
  }
  return hours;
}

function formatDaysHoursMinutes(totalHours: number): string {
  const sign = totalHours < 0 ? "-" : "";
  const abs = Math.abs(totalHours);
  const days = Math.floor(abs / 8);
  const remHours = abs - days * 8;
  const hours = Math.floor(remHours);
  const minutes = Math.round((remHours - hours) * 60);
  return `${sign}${days}일 ${hours}시간 ${minutes}분`;
}

export function useCompLeaveLedger(year: number, month: number) {
  const [rows, setRows] = useState<CompLeaveRow[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    const monthDates = getMonthDates(year, month);
    const curMonthStart = monthDates[0];
    const curMonthEnd = monthDates[monthDates.length - 1];

    const [{ data: emp }, { data: monthly }, { data: summary }, { data: usedShifts }, { data: monthShifts }, { data: monthHolidays }] =
      await Promise.all([
        supabase.from("employees").select("id, name, sort_order").eq("active", true).order("sort_order"),
        supabase
          .from("comp_leave_monthly")
          .select("employee_id, year, month, hours")
          .in("year", [year - 1, year]),
        supabase.from("comp_leave_summary").select("employee_id, used_hours").eq("fiscal_year", year),
        supabase
          .from("shift_leave_usage")
          .select("employee_id, work_date, hours")
          .eq("usage_type", "personal_leave")
          .gte("work_date", curMonthStart)
          .lte("work_date", curMonthEnd),
        supabase
          .from("shifts")
          .select("employee_id, work_date, shift_type")
          .gte("work_date", curMonthStart)
          .lte("work_date", curMonthEnd),
        supabase.from("holidays").select("work_date").gte("work_date", curMonthStart).lte("work_date", curMonthEnd),
      ]);

    const employees = emp ?? [];

    // (year-1, 12) 와 (year, 1~11)만 이 회계연도(fiscal year)에 해당
    const relevantMonthly = (monthly ?? []).filter(
      (r) => (r.year === year - 1 && r.month === 12) || (r.year === year && r.month <= 11)
    );

    const monthlyMap = new Map<string, number[]>();
    for (const e of employees) monthlyMap.set(e.id, Array(12).fill(0));
    for (const r of relevantMonthly) {
      const idx = MONTH_ORDER.indexOf(r.month);
      if (idx === -1) continue;
      const arr = monthlyMap.get(r.employee_id);
      if (arr) arr[idx] = Number(r.hours);
    }

    const usedTotalMap = new Map<string, number>(
      (summary ?? []).map((s) => [s.employee_id, Number(s.used_hours)])
    );

    const thisMonthMap = new Map<string, { hours: number; dates: number[] }>();
    for (const s of usedShifts ?? []) {
      const cur = thisMonthMap.get(s.employee_id) ?? { hours: 0, dates: [] };
      cur.hours += Number(s.hours ?? 0);
      cur.dates.push(Number(s.work_date.slice(8, 10)));
      thisMonthMap.set(s.employee_id, cur);
    }

    const monthHolidaySet = new Set((monthHolidays ?? []).map((h) => h.work_date));
    const shiftsByEmployee = new Map<string, { work_date: string; shift_type: string }[]>();
    for (const s of monthShifts ?? []) {
      const arr = shiftsByEmployee.get(s.employee_id) ?? [];
      arr.push(s);
      shiftsByEmployee.set(s.employee_id, arr);
    }

    const result: CompLeaveRow[] = employees.map((e) => {
      const monthlyHours = monthlyMap.get(e.id) ?? Array(12).fill(0);
      const accruedTotal = monthlyHours.reduce((a, b) => a + b, 0);
      const usedTotal = usedTotalMap.get(e.id) ?? 0;
      const thisMonth = thisMonthMap.get(e.id) ?? { hours: 0, dates: [] };
      return {
        employeeId: e.id,
        employeeName: e.name,
        sortOrder: e.sort_order,
        monthlyHours,
        accruedTotal,
        usedTotal,
        availableLabel: formatDaysHoursMinutes(accruedTotal - usedTotal),
        usedThisMonthHours: thisMonth.hours,
        usedThisMonthDates: thisMonth.dates.sort((a, b) => a - b),
        autoAccrualThisMonth: computeAutoAccrual(shiftsByEmployee.get(e.id) ?? [], monthHolidaySet),
      };
    });

    if (requestId !== requestIdRef.current) return;
    setRows(result);
    setLoading(false);
  }, [year, month]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const debounced = debounce(fetchData, 300);
    const channel = supabase
      .channel(`comp-leave-ledger-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "comp_leave_monthly" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "comp_leave_summary" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_leave_usage" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        debounced.run();
      })
      .subscribe();

    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  const setMonthlyHours = useCallback(
    async (employeeId: string, targetYear: number, targetMonth: number, hours: number) => {
      const { error } = await supabase
        .from("comp_leave_monthly")
        .upsert(
          { employee_id: employeeId, year: targetYear, month: targetMonth, hours },
          { onConflict: "employee_id,year,month" }
        );
      await fetchData();
      return { error };
    },
    [fetchData]
  );

  const setUsedHours = useCallback(
    async (employeeId: string, fiscalYear: number, hours: number) => {
      const { error } = await supabase
        .from("comp_leave_summary")
        .upsert(
          { employee_id: employeeId, fiscal_year: fiscalYear, used_hours: hours },
          { onConflict: "employee_id,fiscal_year" }
        );
      await fetchData();
      return { error };
    },
    [fetchData]
  );

  return { rows, loading, setMonthlyHours, setUsedHours };
}
