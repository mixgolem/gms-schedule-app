"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { isWeekend } from "@/lib/dateUtils";
import { debounce } from "@/lib/debounce";

export interface SpecialNoteGroup {
  employeeId: string;
  employeeName: string;
  sortOrder: number;
  dates: string[]; // yyyy-MM-dd, 오래된 순 - 주말근무인데 대휴 미지정
  unassignedLeaveDates: string[]; // yyyy-MM-dd, 오래된 순 - 대휴인데 원래근무일 미지정
}

// 활성 직원이 토요일/일요일(공휴일 제외)에 새벽·주간·야간으로 근무했는데,
// 그 날짜를 보상 대상으로 지정한 대휴 기록이 없는 경우와, 반대로 대휴로 잡혀있는데
// 원래근무일이 지정 안 된 경우를 찾는다. year를 주면 그 해(1/1~12/31)만, 안 주면(null)
// 월/연도와 상관없이 전체 기간에서 찾는다.
// 대상이 없는 직원도 구분/이름은 그대로 나오도록 활성 직원 전원을 기준으로 그룹을 만든다.
export function useSpecialNotes(year: number | null = null) {
  const [groups, setGroups] = useState<SpecialNoteGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);

    const rangeStart = year ? `${year}-01-01` : null;
    const rangeEnd = year ? `${year}-12-31` : null;

    let workedQuery = supabase
      .from("shifts")
      .select("employee_id, work_date")
      .in("shift_type", ["dawn", "day", "night"]);
    let leavesQuery = supabase
      .from("shifts")
      .select("employee_id, leave_for_date")
      .eq("shift_type", "leave")
      .not("leave_for_date", "is", null);
    let holsQuery = supabase.from("holidays").select("work_date");
    let unassignedLeavesQuery = supabase
      .from("shifts")
      .select("employee_id, work_date")
      .eq("shift_type", "leave")
      .is("leave_for_date", null);

    if (rangeStart && rangeEnd) {
      workedQuery = workedQuery.gte("work_date", rangeStart).lte("work_date", rangeEnd);
      leavesQuery = leavesQuery.gte("leave_for_date", rangeStart).lte("leave_for_date", rangeEnd);
      holsQuery = holsQuery.gte("work_date", rangeStart).lte("work_date", rangeEnd);
      unassignedLeavesQuery = unassignedLeavesQuery
        .gte("work_date", rangeStart)
        .lte("work_date", rangeEnd);
    }

    const [{ data: emp }, { data: worked }, { data: leaves }, { data: hols }, { data: unassignedLeaves }] =
      await Promise.all([
        supabase
          .from("employees")
          .select("id, name, sort_order")
          .eq("active", true)
          .order("sort_order"),
        workedQuery,
        leavesQuery,
        holsQuery,
        unassignedLeavesQuery,
      ]);

    const employees = emp ?? [];
    const holidaySet = new Set<string>((hols ?? []).map((h) => h.work_date));
    const coveredSet = new Set<string>(
      (leaves ?? []).map((l) => `${l.employee_id}_${l.leave_for_date}`)
    );

    const datesByEmployee = new Map<string, string[]>();
    const unassignedLeaveByEmployee = new Map<string, string[]>();
    for (const e of employees) {
      datesByEmployee.set(e.id, []);
      unassignedLeaveByEmployee.set(e.id, []);
    }

    for (const w of worked ?? []) {
      if (!datesByEmployee.has(w.employee_id)) continue; // 비활성 직원 제외
      if (!isWeekend(w.work_date)) continue;
      if (holidaySet.has(w.work_date)) continue;
      if (coveredSet.has(`${w.employee_id}_${w.work_date}`)) continue;
      datesByEmployee.get(w.employee_id)!.push(w.work_date);
    }

    for (const l of unassignedLeaves ?? []) {
      if (!unassignedLeaveByEmployee.has(l.employee_id)) continue; // 비활성 직원 제외
      unassignedLeaveByEmployee.get(l.employee_id)!.push(l.work_date);
    }

    const result: SpecialNoteGroup[] = employees.map((e) => ({
      employeeId: e.id,
      employeeName: e.name,
      sortOrder: e.sort_order,
      dates: (datesByEmployee.get(e.id) ?? []).sort(),
      unassignedLeaveDates: (unassignedLeaveByEmployee.get(e.id) ?? []).sort(),
    }));

    if (requestId !== requestIdRef.current) return;
    setGroups(result);
    setLoading(false);
  }, [year]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const debounced = debounce(fetchData, 300);
    const channel = supabase
      .channel(`special-notes-${instanceId}`)
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

  return { groups, loading };
}
