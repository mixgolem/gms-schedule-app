"use client";

import { ReactNode, useEffect, useRef, useState } from "react";
import Button from "./Button";

interface Props {
  label: ReactNode;
  children: ReactNode;
  title?: string;
  // 열림 여부에 따라 트리거 버튼에 덧붙일 클래스 (예: 위험 메뉴는 글자색만 빨강)
  triggerClassName?: (open: boolean) => string;
}

// 버튼을 누르면 아래로 항목 목록이 펼쳐지는 메뉴. 바깥을 누르거나 항목을 고르면 닫힌다.
export default function DropdownMenu({ label, children, title, triggerClassName }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  return (
    <div className="relative" ref={ref}>
      <Button
        type="button"
        onClick={() => setOpen((v) => !v)}
        active={open}
        title={title}
        aria-expanded={open}
        className={triggerClassName?.(open) ?? ""}
      >
        {label} {open ? "▴" : "▾"}
      </Button>
      {open && (
        <div
          onClick={() => setOpen(false)}
          className="absolute right-0 top-full z-50 mt-1 flex min-w-max flex-col gap-1 rounded-lg border border-gray-200 bg-white p-1.5 shadow-lg animate-[popIn_150ms_ease-out]"
        >
          {children}
        </div>
      )}
    </div>
  );
}
