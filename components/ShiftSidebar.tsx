"use client";

import { ReactNode, useEffect } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function ShiftSidebar({ open, title, onClose, children }: Props) {
  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    if (open) document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  return (
    <div className={`fixed inset-0 z-30 ${open ? "" : "pointer-events-none"}`} aria-hidden={!open}>
      <div
        // 근무 편집/일자 상세 사이드바는 뒤 근무표를 보면서 편집할 수 있어야 해서
        // 다른 모달과 달리 흐림 효과 없이 살짝 어둡게만 처리한다.
        className={`absolute inset-0 bg-black/20 transition-opacity duration-200 ease-out ${
          open ? "opacity-100" : "opacity-0"
        }`}
        onClick={onClose}
      />
      <div
        className={`absolute right-0 top-0 h-full w-full max-w-sm bg-white shadow-xl transition-transform duration-200 ease-out flex flex-col ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0">
          <h2 className="font-semibold text-sm">{title}</h2>
          <button
            type="button"
            onClick={onClose}
            className="text-black text-lg leading-none rounded-md p-1 transition-all duration-150 hover:bg-gray-100 hover:scale-110"
          >
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">{children}</div>
      </div>
    </div>
  );
}
