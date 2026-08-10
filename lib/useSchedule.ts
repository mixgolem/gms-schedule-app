"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Employee, Shift, ShiftType, Holiday } from "@/lib/types";
import { getCalendarWeeks, getMonthDates } from "@/lib/dateUtils";

export function useSchedule(year: number, month: number) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  // 채널 이름이 고정 문자열이면 StrictMode의 이중 마운트 중 이전 채널이 채 정리되기 전에
  // 같은 이름을 재사용하면서 충돌할 수 있어 인스턴스별로 고유하게 만든다.
  const instanceId = useId();

  // 달력에 꽉 찬 주 단위로 표시하니, 인접 월로 삐져나온 날짜까지 함께 가져온다.
  const weeks = getCalendarWeeks(year, month);
  const startDate = weeks[0][0].date;
  const endDate = weeks[weeks.length - 1][6].date;

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: emp }, { data: sh }, { data: hol }] = await Promise.all([
      supabase.from("employees").select("*").eq("active", true).order("sort_order"),
      supabase
        .from("shifts")
        .select("*")
        .gte("work_date", startDate)
        .lte("work_date", endDate),
      supabase
        .from("holidays")
        .select("*")
        .gte("work_date", startDate)
        .lte("work_date", endDate),
    ]);
    setEmployees(emp ?? []);
    setShifts(sh ?? []);
    setHolidays(hol ?? []);
    setLoading(false);
    return { shifts: sh ?? [], holidays: hol ?? [] };
  }, [startDate, endDate]);

  useEffect(() => {
    // 월이 바뀔 때마다 최초 데이터 로드 (fetchData 내부에서 setState)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // 다른 브라우저/사용자가 근무표/직원/공휴일을 수정하면 실시간으로 반영
  useEffect(() => {
    const channel = supabase
      .channel(`schedule-changes-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  const upsertShift = useCallback(
    async (
      employeeId: string,
      workDate: string,
      shiftType: ShiftType,
      isMain: boolean,
      startTime: string | null,
      endTime: string | null,
      leaveForDate: string | null
    ) => {
      // 메인당직으로 지정하면 같은 날짜/타입의 기존 메인당직자를 먼저 해제
      if (isMain) {
        await supabase
          .from("shifts")
          .update({ is_main: false })
          .eq("work_date", workDate)
          .eq("shift_type", shiftType)
          .eq("is_main", true);
      }

      const { error } = await supabase.from("shifts").upsert(
        {
          employee_id: employeeId,
          work_date: workDate,
          shift_type: shiftType,
          is_main: isMain,
          start_time: startTime,
          end_time: endTime,
          leave_for_date: leaveForDate,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "work_date,employee_id" }
      );

      const fresh = await fetchData();
      return { error, shifts: fresh.shifts };
    },
    [fetchData]
  );

  // 직원/공휴일은 그대로 두고, 이 달의 근무표(shifts)만 전부 삭제
  const resetMonth = useCallback(async () => {
    const monthDates = getMonthDates(year, month);
    const monthStart = monthDates[0];
    const monthEnd = monthDates[monthDates.length - 1];

    const { error } = await supabase
      .from("shifts")
      .delete()
      .gte("work_date", monthStart)
      .lte("work_date", monthEnd);

    await fetchData();
    return { error };
  }, [year, month, fetchData]);

  const toggleHoliday = useCallback(
    async (workDate: string, name?: string) => {
      const existing = holidays.find((h) => h.work_date === workDate);
      if (existing) {
        await supabase.from("holidays").delete().eq("work_date", workDate);
      } else {
        await supabase.from("holidays").insert({ work_date: workDate, name: name ?? null });
      }
      await fetchData();
    },
    [holidays, fetchData]
  );

  return { employees, shifts, holidays, weeks, loading, upsertShift, toggleHoliday, resetMonth };
}
