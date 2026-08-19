"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Holiday } from "@/lib/types";
import { debounce } from "@/lib/debounce";
import { convertDayAndLeaveShiftsToOff } from "@/lib/holidays";

// 공휴일 관리 모달 전용: 지정한 연도(1/1~12/31)의 공휴일 전체를 조회/추가/수정/삭제한다.
export function useHolidayManager(year: number) {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();
  const requestIdRef = useRef(0);

  const rangeStart = `${year}-01-01`;
  const rangeEnd = `${year}-12-31`;

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const { data } = await supabase
      .from("holidays")
      .select("*")
      .gte("work_date", rangeStart)
      .lte("work_date", rangeEnd)
      .order("work_date");
    if (requestId !== requestIdRef.current) return;
    setHolidays(data ?? []);
    setLoading(false);
  }, [rangeStart, rangeEnd]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const debounced = debounce(fetchData, 300);
    const channel = supabase
      .channel(`holiday-manager-changes-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "holidays" }, () => {
        debounced.run();
      })
      .subscribe();

    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  const addHoliday = useCallback(
    async (workDate: string, name: string | null) => {
      if (holidays.some((h) => h.work_date === workDate)) {
        return { error: "이미 등록된 날짜예요." };
      }
      const { error } = await supabase.from("holidays").insert({ work_date: workDate, name });
      if (!error) await convertDayAndLeaveShiftsToOff(workDate);
      await fetchData();
      return { error: error?.message ?? null };
    },
    [holidays, fetchData]
  );

  const renameHoliday = useCallback(
    async (workDate: string, name: string | null) => {
      const { error } = await supabase.from("holidays").update({ name }).eq("work_date", workDate);
      await fetchData();
      return { error: error?.message ?? null };
    },
    [fetchData]
  );

  // 공휴일 지정을 해제하는 것뿐이라, 이전에 자동으로 휴무 처리됐던 근무는 되돌리지 않는다
  // (캘린더의 공휴일 체크박스 해제와 동일한 동작).
  const deleteHoliday = useCallback(
    async (workDate: string) => {
      const { error } = await supabase.from("holidays").delete().eq("work_date", workDate);
      await fetchData();
      return { error: error?.message ?? null };
    },
    [fetchData]
  );

  return { holidays, loading, addHoliday, renameHoliday, deleteHoliday };
}
