"use client";

import { useToast } from "@/app/providers";

// 화면 정중앙에 3초간 떴다 사라지는 성공/실패 알림 팝업.
export default function ToastPopup() {
  const { toast } = useToast();
  if (!toast) return null;

  const isError = toast.kind === "error";

  return (
    <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none animate-[popIn_150ms_ease-out]">
      <div
        className={`rounded-lg px-4 py-2.5 text-sm font-medium shadow-lg text-white ${
          isError ? "bg-red-600" : "bg-blue-900"
        }`}
      >
        {toast.message}
      </div>
    </div>
  );
}
