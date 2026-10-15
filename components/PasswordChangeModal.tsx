"use client";

import { FormEvent, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useToast } from "@/app/providers";
import Button from "./ui/Button";

interface Props {
  open: boolean;
  email: string;
  // 관리자가 임시 비밀번호를 발급해준 계정으로 로그인한 경우 — 안내 문구를 바꿔 보여준다
  forced?: boolean;
  onClose: () => void;
}

const MIN_LENGTH = 8;
const INPUT_CLASS =
  "w-full border rounded-lg px-3 py-2 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300";

// Supabase가 영어로 돌려주는 대표적인 오류를 알아듣기 쉽게 바꾼다.
function translateError(message: string): string {
  if (/different from the old password/i.test(message)) return "지금 비밀번호와 다른 비밀번호를 입력해주세요.";
  if (/at least/i.test(message)) return `비밀번호는 ${MIN_LENGTH}자 이상이어야 해요.`;
  if (/weak|pwned|leaked/i.test(message)) return "너무 쉬운 비밀번호예요. 다른 비밀번호를 써주세요.";
  return `변경 실패: ${message}`;
}

export default function PasswordChangeModal({ open, email, forced = false, onClose }: Props) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const { showToast } = useToast();

  if (!open) return null;

  const close = () => {
    setCurrent("");
    setNext("");
    setConfirm("");
    setError(null);
    onClose();
  };

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    if (next.length < MIN_LENGTH) {
      setError(`새 비밀번호는 ${MIN_LENGTH}자 이상이어야 해요.`);
      return;
    }
    if (next !== confirm) {
      setError("새 비밀번호와 확인이 서로 달라요.");
      return;
    }
    if (next === current) {
      setError("지금 비밀번호와 다른 비밀번호를 입력해주세요.");
      return;
    }

    setSaving(true);
    // 자리를 비운 사이 다른 사람이 바꾸는 걸 막기 위해 지금 비밀번호부터 한 번 더 확인한다.
    const { error: verifyError } = await supabase.auth.signInWithPassword({ email, password: current });
    if (verifyError) {
      setSaving(false);
      setError("지금 비밀번호가 맞지 않아요.");
      return;
    }
    // 임시 비밀번호 표시도 같이 지워서 다음 로그인부터는 이 창이 자동으로 뜨지 않게 한다.
    const { error: updateError } = await supabase.auth.updateUser({
      password: next,
      data: { must_change_password: false },
    });
    setSaving(false);
    if (updateError) {
      setError(translateError(updateError.message));
      return;
    }
    close();
    showToast("비밀번호를 바꿨어요");
  };

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/30 backdrop-blur-[3px] animate-[fadeIn_150ms_ease-out]" onClick={close} />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-sm animate-[popIn_150ms_ease-out]"
      >
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <h2 className="font-semibold text-base">비밀번호 변경</h2>
          <button
            type="button"
            onClick={close}
            className="text-black text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>

        <div className="p-4 space-y-3">
          {forced && (
            <p className="text-sm text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 leading-relaxed">
              관리자가 발급한 <b>임시 비밀번호</b>로 로그인했어요. 본인만 아는 새 비밀번호로 바꿔주세요.
              (지금 비밀번호 칸에는 임시 비밀번호를 넣으면 돼요)
            </p>
          )}
          <p className="text-xs text-black">{email}</p>
          <input
            type="password"
            required
            autoComplete="current-password"
            placeholder="지금 비밀번호"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className={INPUT_CLASS}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder={`새 비밀번호 (${MIN_LENGTH}자 이상)`}
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className={INPUT_CLASS}
          />
          <input
            type="password"
            required
            autoComplete="new-password"
            placeholder="새 비밀번호 확인"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className={INPUT_CLASS}
          />
          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>

        <div className="border-t p-3 flex justify-end gap-2">
          <Button type="button" onClick={close}>
            {forced ? "나중에 바꾸기" : "취소"}
          </Button>
          <Button type="submit" variant="primary" disabled={saving}>
            {saving ? "바꾸는 중..." : "변경"}
          </Button>
        </div>
      </form>
    </div>
  );
}
