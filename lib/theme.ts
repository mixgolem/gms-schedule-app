"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabaseClient";
import { THEME_STORAGE_KEY } from "./themeScript";

// 화면 테마 = 스타일(기본/리퀴드 글래스) × 밝기(라이트/다크). <html data-style data-mode>에
// 걸어두면 globals.css의 테마 규칙이 색 변수·표면 효과를 바꾼다. 컴포넌트 클래스는 그대로.
export type ThemeStyle = "basic" | "glass";
// 다크 모드는 없앴다 — 예전에 다크로 저장된 값이 있어도 라이트로 보인다
export type ThemeMode = "light";
export interface Theme {
  style: ThemeStyle;
  mode: ThemeMode;
}

// 처음 들어오거나 저장된 값이 없을 때의 테마
export const DEFAULT_THEME: Theme = { style: "glass", mode: "light" };
// 이미지·PDF 캡처용 테마 — 각자 고른 테마(다크 등)와 상관없이 항상 기본값 테마로 찍는다
export const CAPTURE_THEME: Theme = DEFAULT_THEME;

function readTheme(): Theme {
  const d = document.documentElement.dataset;
  return {
    style: d.style === "basic" ? "basic" : "glass",
    mode: "light",
  };
}

export function applyTheme(theme: Theme) {
  const d = document.documentElement.dataset;
  d.style = theme.style;
  d.mode = theme.mode;
}

// 버튼·칸마다 걸린 색 전환 애니메이션(transition) 때문에 테마가 서서히 바뀌는 동안은 색이 섞여
// 보인다. 테마를 바꾸는 순간에는 전환 효과를 꺼서 한 번에 바뀌게 한다(globals → theme.css).
function setTransitionsDisabled(disabled: boolean) {
  document.documentElement.classList.toggle("theme-switching", disabled);
}

function nextFrames(): Promise<void> {
  return new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => r())));
}

function applyThemeInstantly(theme: Theme) {
  setTransitionsDisabled(true);
  applyTheme(theme);
  nextFrames().then(() => setTransitionsDisabled(false));
}

// 이미지·PDF 캡처는 공유·인쇄용이라 보는 사람마다 다른 테마가 아니라 항상 기본값 테마로 찍는다.
export async function withCaptureTheme<T>(run: () => Promise<T>): Promise<T> {
  const saved = readTheme();
  const needsSwitch = saved.style !== CAPTURE_THEME.style || saved.mode !== CAPTURE_THEME.mode;
  if (!needsSwitch) return run();
  // 캡처하는 동안엔 전환 효과를 꺼둔다 — 안 그러면 색이 바뀌는 도중의 섞인 색이 찍힌다
  setTransitionsDisabled(true);
  applyTheme(CAPTURE_THEME);
  await nextFrames();
  try {
    return await run();
  } finally {
    applyTheme(saved);
    await nextFrames();
    setTransitionsDisabled(false);
  }
}

function saveLocal(theme: Theme) {
  try {
    localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(theme));
  } catch {
    // 저장 못 하는 환경이면 이번 접속 동안만 유지
  }
}

function hasLocalChoice(): boolean {
  try {
    return localStorage.getItem(THEME_STORAGE_KEY) !== null;
  } catch {
    return false;
  }
}

async function saveToAccount(userId: string, theme: Theme) {
  const { error } = await supabase.from("user_preferences").upsert(
    {
      user_id: userId,
      theme_style: theme.style,
      theme_mode: theme.mode,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" }
  );
  if (error) console.error("테마 설정 저장 실패:", error);
}

// 테마는 계정별로 기억한다(user_preferences, migration v23) — 어느 기기로 로그인해도 같은 테마.
// 브라우저(localStorage)에도 같이 적어 두는 건 로그인 전 화면·첫 화면 깜빡임 방지용이다.
// Header처럼 항상 떠 있는 곳에서 한 번만 쓴다(로그인하자마자 계정 테마를 불러와야 해서).
export function useTheme(userId: string | null) {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);
  const themeRef = useRef<Theme>(DEFAULT_THEME);

  const commit = useCallback((next: Theme) => {
    themeRef.current = next;
    setThemeState(next);
    applyThemeInstantly(next);
    saveLocal(next);
  }, []);

  useEffect(() => {
    const current = readTheme();
    themeRef.current = current;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(current);
  }, []);

  // 로그인하면 계정에 저장된 테마로 바꾼다. 계정에 아직 없는데 이 브라우저에서 골라 둔 게
  // 있으면(계정 저장 기능 전에 고른 경우) 그걸 계정으로 옮겨 둔다.
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    supabase
      .from("user_preferences")
      .select("theme_style, theme_mode")
      .eq("user_id", userId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) {
          console.error("테마 설정 불러오기 실패:", error);
          return;
        }
        if (data?.theme_style) {
          const saved: Theme = {
            style: data.theme_style === "basic" ? "basic" : "glass",
            mode: "light",
          };
          if (saved.style !== themeRef.current.style || saved.mode !== themeRef.current.mode) {
            commit(saved);
          }
        } else if (hasLocalChoice()) {
          saveToAccount(userId, themeRef.current);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [userId, commit]);

  const setTheme = useCallback(
    (patch: Partial<Theme>) => {
      const next = { ...themeRef.current, ...patch };
      commit(next);
      if (userId) saveToAccount(userId, next);
    },
    [userId, commit]
  );

  return { theme, setTheme };
}
