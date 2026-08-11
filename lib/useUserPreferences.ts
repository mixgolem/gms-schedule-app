"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabaseClient";
import { useAuth } from "@/app/providers";
import { SortMode } from "@/components/CalendarGrid";

// 근무 색상 표시 여부/정렬 방식은 로그인한 계정별로 기억해서, 다음에 로그인해도
// 마지막에 쓰던 설정 그대로 보이게 한다. 로그아웃 상태에서는 그냥 이번 세션 동안만 유지.
export function useUserPreferences() {
  const { session } = useAuth();
  const userId = session?.user.id ?? null;

  const [showColors, setShowColorsState] = useState(true);
  const [sortMode, setSortModeState] = useState<SortMode>("default");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;

    supabase
      .from("user_preferences")
      .select("show_colors, sort_mode")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error: fetchError }) => {
        if (cancelled) return;
        if (fetchError) {
          console.error("설정 불러오기 실패:", fetchError);
          return;
        }
        if (!data) return;
        setShowColorsState(data.show_colors);
        setSortModeState(data.sort_mode as SortMode);
      });

    return () => {
      cancelled = true;
    };
  }, [userId]);

  const setShowColors = useCallback(
    (value: boolean) => {
      setShowColorsState(value);
      if (!userId) return;
      supabase
        .from("user_preferences")
        .upsert(
          { user_id: userId, show_colors: value, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        )
        .then(({ error: upsertError }) => {
          if (upsertError) {
            console.error("근무 색상 설정 저장 실패:", upsertError);
            setError(`설정 저장 실패: ${upsertError.message}`);
          } else {
            setError(null);
          }
        });
    },
    [userId]
  );

  const setSortMode = useCallback(
    (value: SortMode) => {
      setSortModeState(value);
      if (!userId) return;
      supabase
        .from("user_preferences")
        .upsert(
          { user_id: userId, sort_mode: value, updated_at: new Date().toISOString() },
          { onConflict: "user_id" }
        )
        .then(({ error: upsertError }) => {
          if (upsertError) {
            console.error("정렬 설정 저장 실패:", upsertError);
            setError(`설정 저장 실패: ${upsertError.message}`);
          } else {
            setError(null);
          }
        });
    },
    [userId]
  );

  return { showColors, setShowColors, sortMode, setSortMode, error };
}
