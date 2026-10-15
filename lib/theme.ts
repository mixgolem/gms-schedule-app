"use client";

import { useCallback, useEffect, useState } from "react";
import { THEME_STORAGE_KEY } from "./themeScript";

// 화면 테마 = 스타일(기본/리퀴드 글래스) × 밝기(라이트/다크). <html data-style data-mode>에
// 걸어두면 globals.css의 테마 규칙이 색 변수·표면 효과를 바꾼다. 컴포넌트 클래스는 그대로.
export type ThemeStyle = "basic" | "glass";
export type ThemeMode = "light" | "dark";
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
    mode: d.mode === "dark" ? "dark" : "light",
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

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(DEFAULT_THEME);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setThemeState(readTheme());
  }, []);

  const setTheme = useCallback((patch: Partial<Theme>) => {
    setThemeState((prev) => {
      const next = { ...prev, ...patch };
      applyThemeInstantly(next);
      try {
        localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(next));
      } catch {
        // 저장 못 하는 환경이면 이번 접속 동안만 유지
      }
      return next;
    });
  }, []);

  return { theme, setTheme };
}
