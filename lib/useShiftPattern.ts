"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { PatternDays } from "./shiftPatternImport";
import { debounce } from "./debounce";

export interface StoredPattern {
  id: string;
  uploadedByEmail: string | null;
  filename: string;
  uploadedAt: string;
  days: PatternDays;
}

export interface PatternApplication {
  startDate: string;
  endDate: string;
  appliedByEmail: string | null;
  appliedAt: string;
}

// 가장 최근에 업로드된 근무패턴 하나를 "현재 등록된 패턴"으로, 가장 최근 적용 기록을
// "지금 적용되어 있는 기간"으로 취급한다. 둘 다 새로 업로드/적용할 때마다 이력으로 쌓인다.
export function useShiftPattern() {
  const [current, setCurrent] = useState<StoredPattern | null>(null);
  const [latestApplication, setLatestApplication] = useState<PatternApplication | null>(null);
  const [loading, setLoading] = useState(true);
  const instanceId = useId();
  const requestIdRef = useRef(0);

  const fetchData = useCallback(async () => {
    const requestId = ++requestIdRef.current;
    setLoading(true);
    const [{ data: patternData }, { data: applicationData }] = await Promise.all([
      supabase
        .from("shift_patterns")
        .select("id, uploaded_by_email, filename, uploaded_at, pattern")
        .order("uploaded_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      supabase
        .from("shift_pattern_applications")
        .select("start_date, end_date, applied_by_email, applied_at")
        .order("applied_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);

    if (requestId !== requestIdRef.current) return;

    setCurrent(
      patternData
        ? {
            id: patternData.id,
            uploadedByEmail: patternData.uploaded_by_email,
            filename: patternData.filename,
            uploadedAt: patternData.uploaded_at,
            days: (patternData.pattern as { days: PatternDays }).days,
          }
        : null
    );

    setLatestApplication(
      applicationData
        ? {
            startDate: applicationData.start_date,
            endDate: applicationData.end_date,
            appliedByEmail: applicationData.applied_by_email,
            appliedAt: applicationData.applied_at,
          }
        : null
    );

    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const debounced = debounce(fetchData, 300);
    const channel = supabase
      .channel(`shift-patterns-${instanceId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "shift_patterns" }, () => {
        debounced.run();
      })
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "shift_pattern_applications" },
        () => {
          debounced.run();
        }
      )
      .subscribe();

    return () => {
      debounced.cancel();
      supabase.removeChannel(channel);
    };
  }, [fetchData, instanceId]);

  const uploadPattern = useCallback(
    async (filename: string, days: PatternDays) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("shift_patterns").insert({
        uploaded_by: userData.user?.id ?? null,
        uploaded_by_email: userData.user?.email ?? null,
        filename,
        pattern: { days },
      });
      await fetchData();
      return { error: error?.message ?? null };
    },
    [fetchData]
  );

  const recordApplication = useCallback(
    async (patternId: string | null, startDate: string, endDate: string) => {
      const { data: userData } = await supabase.auth.getUser();
      const { error } = await supabase.from("shift_pattern_applications").insert({
        pattern_id: patternId,
        applied_by: userData.user?.id ?? null,
        applied_by_email: userData.user?.email ?? null,
        start_date: startDate,
        end_date: endDate,
      });
      await fetchData();
      return { error: error?.message ?? null };
    },
    [fetchData]
  );

  return { current, latestApplication, loading, uploadPattern, recordApplication };
}
