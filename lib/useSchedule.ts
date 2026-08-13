"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import {
  Employee,
  Shift,
  ShiftType,
  Holiday,
  ShiftLeaveUsage,
  LeaveUsageInput,
} from "@/lib/types";
import { getCalendarWeeks, getMonthDates } from "@/lib/dateUtils";
import { debounce } from "@/lib/debounce";

export function useSchedule(year: number, month: number) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [leaveUsages, setLeaveUsages] = useState<ShiftLeaveUsage[]>([]);
  const [loading, setLoading] = useState(true);
  // 채널 이름이 고정 문자열이면 StrictMode의 이중 마운트 중 이전 채널이 채 정리되기 전에
  // 같은 이름을 재사용하면서 충돌할 수 있어 인스턴스별로 고유하게 만든다.
  const instanceId = useId();
  // 월 이동 직후 이전 달 조회가 늦게 끝나 화면을 덮어쓰는 경쟁 상태를 막기 위한 요청 번호.
  // (예: 9월 초기화 → 곧바로 10월로 이동하면, 초기화가 걸어둔 9월 재조회가 10월 조회보다
  // 늦게 끝나면서 10월 상태를 9월 결과로 덮어써 "일부만 보임" 현상이 생겼다)
  const requestIdRef = useRef(0);

  // 달력에 꽉 찬 주 단위로 표시하니, 인접 월로 삐져나온 날짜까지 함께 가져온다.
  const weeks = getCalendarWeeks(year, month);
  const startDate = weeks[0][0].date;
  const endDate = weeks[weeks.length - 1][6].date;

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const [{ data: emp }, { data: sh }, { data: hol }, { data: usages }] = await Promise.all([
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
      supabase
        .from("shift_leave_usage")
        .select("*")
        .gte("work_date", startDate)
        .lte("work_date", endDate),
    ]);

    // 이 요청이 실행되는 동안 더 최신 fetchData가 시작됐다면(예: 그 사이 월 이동),
    // 이 낡은 응답으로 최신 상태를 덮어쓰지 않는다.
    if (requestId !== requestIdRef.current) {
      return { shifts: sh ?? [], holidays: hol ?? [], leaveUsages: usages ?? [] };
    }

    setEmployees(emp ?? []);
    setShifts(sh ?? []);
    setHolidays(hol ?? []);
    setLeaveUsages(usages ?? []);
    setLoading(false);
    return { shifts: sh ?? [], holidays: hol ?? [], leaveUsages: usages ?? [] };
  }, [startDate, endDate]);

  useEffect(() => {
    // 월이 바뀔 때마다 최초 데이터 로드 (fetchData 내부에서 setState)
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  // 다른 브라우저/사용자가 근무표/직원/공휴일/부분사용내역을 수정하면 실시간으로 반영.
  // 한 번의 작업(예: 이번 달 초기화)이 여러 행을 건드리면 이벤트도 그만큼 여러 번 오므로
  // 짧게 몰려온 이벤트는 debounce로 묶어서 한 번만 재조회한다.
  useEffect(() => {
    const debounced = debounce(fetchData, 300);
    const channel = supabase
      .channel(`schedule-changes-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, () => {
        debounced.run();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_leave_usage" }, () => {
        debounced.run();
      })
      .subscribe();

    return () => {
      debounced.cancel();
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
          // 예전 방식(하루 종일 연차/본인대휴)은 새벽·야간·주간 안의 부분사용 항목으로 대체되어
          // 더 이상 이 필드들을 채우지 않는다.
          is_personal_leave: false,
          leave_hours: null,
          annual_hours: null,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "work_date,employee_id" }
      );

      const fresh = await fetchData();
      return { error, shifts: fresh.shifts };
    },
    [fetchData]
  );

  // 특정 shift에 연결된 부분사용(연차/본인대휴) 항목을 통째로 교체
  const syncLeaveUsages = useCallback(
    async (shiftId: string, employeeId: string, workDate: string, entries: LeaveUsageInput[]) => {
      const { error: deleteError } = await supabase
        .from("shift_leave_usage")
        .delete()
        .eq("shift_id", shiftId);
      if (deleteError) return { error: deleteError };

      if (entries.length > 0) {
        const { error: insertError } = await supabase.from("shift_leave_usage").insert(
          entries.map((e) => ({
            shift_id: shiftId,
            employee_id: employeeId,
            work_date: workDate,
            usage_type: e.usageType,
            hours: e.hours,
            start_time: e.start,
            end_time: e.end,
          }))
        );
        if (insertError) return { error: insertError };
      }

      await fetchData();
      return { error: null };
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

  return {
    employees,
    shifts,
    holidays,
    leaveUsages,
    weeks,
    loading,
    upsertShift,
    syncLeaveUsages,
    toggleHoliday,
    resetMonth,
  };
}
