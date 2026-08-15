"use client";

import { useGlobalLoading } from "@/app/providers";

// 화면 전체(모달 포함)를 덮어서 클릭을 막는다 — 작업 중 다른 달로 넘어가는 등
// 요청이 꼬일 수 있는 조작을 원천 차단하기 위함.
export default function GlobalLoadingOverlay() {
  const { message } = useGlobalLoading();
  if (!message) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 animate-[fadeIn_150ms_ease-out]">
      <div className="bg-white rounded-xl shadow-xl px-6 py-5 flex flex-col items-center gap-3 animate-[popIn_150ms_ease-out]">
        <div className="h-8 w-8 rounded-full border-4 border-gray-200 border-t-blue-900 animate-spin" />
        <p className="text-sm font-medium text-black">{message}</p>
      </div>
    </div>
  );
}
