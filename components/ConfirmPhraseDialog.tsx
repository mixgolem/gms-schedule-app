"use client";

import { useState } from "react";
import Button from "./ui/Button";

interface Props {
  open: boolean;
  title: string;
  message: string;
  phrase: string; // 이 문구를 정확히 입력해야 확인 버튼이 눌리고 Enter로도 제출된다
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

// 되돌릴 수 없는 대형 작업(이번 달 초기화, 전체 복원 등) 실행 전에, 실수로 버튼을 눌러
// 바로 진행되는 걸 막기 위해 정해진 문구를 정확히 입력해야만 통과시키는 확인창.
export default function ConfirmPhraseDialog({
  open,
  title,
  message,
  phrase,
  danger,
  onConfirm,
  onCancel,
}: Props) {
  const [value, setValue] = useState("");

  if (!open) return null;

  const matched = value === phrase;

  const close = (action: () => void) => {
    setValue("");
    action();
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!matched) return;
    close(onConfirm);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40 animate-[fadeIn_150ms_ease-out]"
        onClick={() => close(onCancel)}
      />
      <form
        onSubmit={handleSubmit}
        className="relative bg-white rounded-xl shadow-xl w-full max-w-sm p-4 space-y-3 animate-[popIn_150ms_ease-out]"
      >
        <p className="font-semibold text-sm text-black">{title}</p>
        <p className="text-xs text-black whitespace-pre-line">{message}</p>
        <div>
          <label className="text-xs text-black block mb-1">
            계속하려면 <span className="font-bold">{phrase}</span>을(를) 입력하고 Enter를
            누르세요
          </label>
          <input
            autoFocus
            value={value}
            onChange={(e) => setValue(e.target.value)}
            className="w-full border rounded-lg px-2 py-1.5 text-sm transition-shadow duration-150 focus:outline-none focus:ring-1 focus:ring-gray-300"
          />
        </div>
        <div className="flex gap-2">
          <Button
            type="submit"
            variant={danger ? "danger" : "primary"}
            disabled={!matched}
            className="flex-1 py-2"
          >
            확인
          </Button>
          <Button type="button" onClick={() => close(onCancel)} className="py-2">
            취소
          </Button>
        </div>
      </form>
    </div>
  );
}
