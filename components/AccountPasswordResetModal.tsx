"use client";

import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import Button from "./ui/Button";
import ConfirmDialog from "./ConfirmDialog";

interface Props {
  open: boolean;
  onClose: () => void;
}

interface AccountRow {
  id: string;
  email: string;
  isAdmin: boolean;
  lastSignInAt: string | null;
  mustChangePassword: boolean;
  isMe: boolean;
}

// 관리자 전용 API(app/api/admin/*)는 로그인 토큰으로 관리자인지 서버에서 다시 확인한다.
async function callAdminApi<T>(path: string, body?: unknown): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("로그인이 필요해요.");
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(json.error ?? `요청 실패 (${res.status})`);
  return json as T;
}

function formatLastSignIn(iso: string | null): string {
  if (!iso) return "로그인 기록 없음";
  return new Date(iso).toLocaleString("ko-KR", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

// 직원이 비밀번호를 잊었을 때 관리자가 임시 비밀번호를 발급해주는 화면. 메일 발송 없이
// 바로 바뀌고, 발급받은 사람은 다음 로그인 때 새 비밀번호로 바꾸라는 창이 자동으로 뜬다.
export default function AccountPasswordResetModal({ open, onClose }: Props) {
  const [accounts, setAccounts] = useState<AccountRow[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [target, setTarget] = useState<AccountRow | null>(null);
  const [resetting, setResetting] = useState(false);
  const [issued, setIssued] = useState<{ email: string; tempPassword: string } | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const { users } = await callAdminApi<{ users: AccountRow[] }>("/api/admin/users");
      setAccounts(users);
    } catch (e) {
      setLoadError(e instanceof Error ? e.message : String(e));
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAccounts(null);
    setIssued(null);
    setActionError(null);
    load();
  }, [open, load]);

  if (!open) return null;

  const runReset = async () => {
    if (!target) return;
    const account = target;
    setTarget(null);
    setResetting(true);
    setActionError(null);
    setCopied(false);
    try {
      const result = await callAdminApi<{ email: string; tempPassword: string }>(
        "/api/admin/reset-password",
        { userId: account.id }
      );
      setIssued(result);
      load();
    } catch (e) {
      setActionError(e instanceof Error ? e.message : String(e));
    } finally {
      setResetting(false);
    }
  };

  const copyIssued = async () => {
    if (!issued) return;
    try {
      await navigator.clipboard.writeText(issued.tempPassword);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]" onClick={onClose} />
      <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg max-h-[85vh] flex flex-col animate-[popIn_150ms_ease-out]">
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-base">계정 비밀번호 초기화</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-black text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3 text-sm">
          <p className="text-black leading-relaxed">
            비밀번호를 잊은 계정에 <b>임시 비밀번호</b>를 발급해요. 발급한 비밀번호를 본인에게
            알려주면, 그걸로 로그인했을 때 새 비밀번호로 바꾸라는 창이 자동으로 떠요.
          </p>

          {issued && (
            <div className="border-2 border-blue-900 rounded-lg p-3 space-y-2 bg-blue-50">
              <p className="text-black">
                <b>{issued.email}</b> 임시 비밀번호
              </p>
              <div className="flex items-center gap-2">
                <code className="flex-1 font-mono text-lg font-bold tracking-wider bg-white border rounded px-2 py-1 select-all">
                  {issued.tempPassword}
                </code>
                <Button onClick={copyIssued} className="shrink-0">
                  {copied ? "복사됨" : "복사"}
                </Button>
              </div>
              <p className="text-xs text-black">
                이 창을 닫으면 다시 볼 수 없어요. 본인에게 전달한 뒤 닫아주세요.
              </p>
            </div>
          )}
          {actionError && <p className="text-red-600">{actionError}</p>}

          {loadError ? (
            <p className="text-red-600">{loadError}</p>
          ) : accounts === null ? (
            <p className="text-black">불러오는 중...</p>
          ) : (
            <ul className="border rounded-lg divide-y">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center gap-2 px-3 py-2">
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-black break-all">
                      {a.email}
                      {a.isAdmin && (
                        <span className="ml-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-300 rounded px-1">
                          관리자
                        </span>
                      )}
                      {a.mustChangePassword && (
                        <span className="ml-1.5 text-[11px] font-bold text-blue-800 bg-blue-50 border border-blue-300 rounded px-1">
                          임시 비밀번호 사용 중
                        </span>
                      )}
                    </p>
                    <p className="text-xs text-black/60">마지막 로그인: {formatLastSignIn(a.lastSignInAt)}</p>
                  </div>
                  {a.isMe ? (
                    <span className="text-xs text-black/60 shrink-0">본인</span>
                  ) : (
                    <Button
                      onClick={() => setTarget(a)}
                      disabled={resetting}
                      className="text-xs px-2 py-1 shrink-0"
                    >
                      임시 비밀번호 발급
                    </Button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={target !== null}
        title="임시 비밀번호 발급"
        message={`${target?.email ?? ""}의 지금 비밀번호는 바로 못 쓰게 돼요.\n임시 비밀번호를 발급할까요?`}
        confirmLabel="발급"
        onConfirm={runReset}
        onCancel={() => setTarget(null)}
      />
    </div>
  );
}
