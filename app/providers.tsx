"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabaseClient";

interface AuthContextValue {
  session: Session | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  const signIn = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    return { error: error?.message ?? null };
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return (
    <AuthContext.Provider value={{ session, loading, signIn, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}

// Header는 레이아웃 상 페이지(캘린더)보다 먼저 렌더링되는 형제 컴포넌트라 props를 직접
// 못 받는다. "이번 달 초기화" 버튼을 Header 쪽에 두면서도 어떤 연/월을 초기화할지, 실제
// 삭제 로직은 여전히 페이지(useSchedule)가 갖고 있게 하기 위한 공유 슬롯.
interface ResetMonthInfo {
  year: number;
  month: number;
  canReset: boolean;
  onReset: () => void;
}

interface ResetMonthContextValue {
  info: ResetMonthInfo | null;
  setInfo: (info: ResetMonthInfo | null) => void;
}

const ResetMonthContext = createContext<ResetMonthContextValue | undefined>(undefined);

export function ResetMonthProvider({ children }: { children: React.ReactNode }) {
  const [info, setInfo] = useState<ResetMonthInfo | null>(null);
  return (
    <ResetMonthContext.Provider value={{ info, setInfo }}>{children}</ResetMonthContext.Provider>
  );
}

export function useResetMonth() {
  const ctx = useContext(ResetMonthContext);
  if (!ctx) throw new Error("useResetMonth must be used within ResetMonthProvider");
  return ctx;
}

// 시간이 걸리는 작업(이번 달 초기화, 근무패턴 적용 등) 중에는 화면 전체를 덮는 로딩창을
// 띄워서, 진행 중에 사용자가 다른 달로 넘어가거나 다른 조작을 해서 요청이 꼬이는 걸 막는다.
interface GlobalLoadingContextValue {
  message: string | null;
  runWithLoading: <T>(message: string, fn: () => Promise<T>) => Promise<T>;
}

const GlobalLoadingContext = createContext<GlobalLoadingContextValue | undefined>(undefined);

export function GlobalLoadingProvider({ children }: { children: React.ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);

  const runWithLoading = useCallback(async <T,>(msg: string, fn: () => Promise<T>): Promise<T> => {
    setMessage(msg);
    try {
      return await fn();
    } finally {
      setMessage(null);
    }
  }, []);

  return (
    <GlobalLoadingContext.Provider value={{ message, runWithLoading }}>
      {children}
    </GlobalLoadingContext.Provider>
  );
}

export function useGlobalLoading() {
  const ctx = useContext(GlobalLoadingContext);
  if (!ctx) throw new Error("useGlobalLoading must be used within GlobalLoadingProvider");
  return ctx;
}

// 저장/삭제/변경/다운로드처럼 "됐는지 안 됐는지" 짧게 알려주면 되는 작업을 위한
// 3초짜리 팝업 알림. 성공/실패 상관없이 같은 방식으로 띄운다.
interface ToastState {
  id: number;
  message: string;
  kind: "success" | "error";
}

interface ToastContextValue {
  toast: ToastState | null;
  showToast: (message: string, kind?: "success" | "error") => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

const TOAST_DURATION_MS = 3000;

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const showToast = useCallback((message: string, kind: "success" | "error" = "success") => {
    if (timerRef.current) clearTimeout(timerRef.current);
    const id = Date.now();
    setToast({ id, message, kind });
    timerRef.current = setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur));
    }, TOAST_DURATION_MS);
  }, []);

  return <ToastContext.Provider value={{ toast, showToast }}>{children}</ToastContext.Provider>;
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used within ToastProvider");
  return ctx;
}
