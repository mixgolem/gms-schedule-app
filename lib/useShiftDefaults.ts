"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { DEFAULT_SHIFT_HOURS } from "@/lib/types";

export type ShiftDefaultsMap = Record<"dawn" | "day" | "night", { start: string; end: string }>;

export function useShiftDefaults() {
  const [defaults, setDefaults] = useState<ShiftDefaultsMap>(DEFAULT_SHIFT_HOURS);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();

  const fetchData = useCallback(async () => {
    setLoading(true);
    const { data } = await supabase.from("shift_type_defaults").select("*");
    if (data && data.length > 0) {
      const map = { ...DEFAULT_SHIFT_HOURS };
      for (const row of data) {
        map[row.shift_type as "dawn" | "day" | "night"] = {
          start: row.start_time.slice(0, 5),
          end: row.end_time.slice(0, 5),
        };
      }
      setDefaults(map);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const channel = supabase
      .channel(`shift-type-defaults-changes-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_type_defaults" },
        () => {
          fetchData();
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  const setShiftDefault = useCallback(
    async (shiftType: "dawn" | "day" | "night", start: string, end: string) => {
      const { error } = await supabase
        .from("shift_type_defaults")
        .upsert({ shift_type: shiftType, start_time: start, end_time: end });
      await fetchData();
      return { error };
    },
    [fetchData]
  );

  return { defaults, loading, setShiftDefault };
}
