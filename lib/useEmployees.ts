"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { Employee } from "@/lib/types";

// 직원 관리 모달 전용: 비활성 직원까지 포함한 전체 목록
export function useEmployees() {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  // 채널 이름이 고정 문자열이면 StrictMode의 이중 마운트(구독 후 곧바로 정리) 중
  // 이전 채널이 채 정리되기 전에 같은 이름을 재사용하면서 충돌할 수 있어 인스턴스별로 고유하게 만든다.
  const instanceId = useId();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("employees").select("*").order("sort_order");
    setEmployees(data ?? []);
    setLoading(false);
    return data ?? [];
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`employees-manager-changes-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "employees" }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  const addEmployee = useCallback(
    async (name: string) => {
      const nextOrder = employees.reduce((max, e) => Math.max(max, e.sort_order), 0) + 1;
      const { error } = await supabase
        .from("employees")
        .insert({ name, sort_order: nextOrder, active: true });
      await fetchData();
      return { error };
    },
    [employees, fetchData]
  );

  const renameEmployee = useCallback(
    async (id: string, name: string) => {
      const { error } = await supabase.from("employees").update({ name }).eq("id", id);
      await fetchData();
      return { error };
    },
    [fetchData]
  );

  const setActive = useCallback(
    async (id: string, active: boolean) => {
      const { error } = await supabase.from("employees").update({ active }).eq("id", id);
      await fetchData();
      return { error };
    },
    [fetchData]
  );

  const moveEmployee = useCallback(
    async (id: string, direction: "up" | "down") => {
      const sorted = [...employees].sort((a, b) => a.sort_order - b.sort_order);
      const idx = sorted.findIndex((e) => e.id === id);
      const targetIdx = direction === "up" ? idx - 1 : idx + 1;
      if (idx === -1 || targetIdx < 0 || targetIdx >= sorted.length) return { error: null };

      const current = sorted[idx];
      const target = sorted[targetIdx];

      const [{ error: e1 }, { error: e2 }] = await Promise.all([
        supabase.from("employees").update({ sort_order: target.sort_order }).eq("id", current.id),
        supabase.from("employees").update({ sort_order: current.sort_order }).eq("id", target.id),
      ]);
      await fetchData();
      return { error: e1 ?? e2 };
    },
    [employees, fetchData]
  );

  return { employees, loading, addEmployee, renameEmployee, setActive, moveEmployee };
}
