"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { isWeekend } from "@/lib/dateUtils";

export interface SpecialNoteGroup {
  employeeId: string;
  employeeName: string;
  dates: string[]; // yyyy-MM-dd, 오래된 순
}

// 활성 직원이 토요일/일요일(공휴일 제외)에 새벽·주간·야간으로 근무했는데,
// 그 날짜를 보상 대상으로 지정한 대휴 기록이 없는 경우를 월과 상관없이 전체 기간에서 찾는다.
// 대상이 없는 직원도 구분/이름은 그대로 나오도록 활성 직원 전원을 기준으로 그룹을 만든다.
export function useSpecialNotes() {
  const [groups, setGroups] = useState<SpecialNoteGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const [{ data: emp }, { data: worked }, { data: leaves }, { data: hols }] = await Promise.all([
      supabase.from("employees").select("id, name").eq("active", true).order("sort_order"),
      supabase
        .from("shifts")
        .select("employee_id, work_date")
        .in("shift_type", ["dawn", "day", "night"]),
      supabase
        .from("shifts")
        .select("employee_id, leave_for_date")
        .eq("shift_type", "leave")
        .not("leave_for_date", "is", null),
      supabase.from("holidays").select("work_date"),
    ]);

    const employees = emp ?? [];
    const holidaySet = new Set<string>((hols ?? []).map((h) => h.work_date));
    const coveredSet = new Set<string>(
      (leaves ?? []).map((l) => `${l.employee_id}_${l.leave_for_date}`)
    );

    const datesByEmployee = new Map<string, string[]>();
    for (const e of employees) datesByEmployee.set(e.id, []);

    for (const w of worked ?? []) {
      if (!datesByEmployee.has(w.employee_id)) continue; // 비활성 직원 제외
      if (!isWeekend(w.work_date)) continue;
      if (holidaySet.has(w.work_date)) continue;
      if (coveredSet.has(`${w.employee_id}_${w.work_date}`)) continue;
      datesByEmployee.get(w.employee_id)!.push(w.work_date);
    }

    const result: SpecialNoteGroup[] = employees.map((e) => ({
      employeeId: e.id,
      employeeName: e.name,
      dates: (datesByEmployee.get(e.id) ?? []).sort(),
    }));

    setGroups(result);
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`special-notes-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shifts" }, () => {
        fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, () => {
        fetchData();
      })
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  return { groups, loading };
}
