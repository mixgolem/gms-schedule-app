"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  active?: boolean; // 선택/토글된 상태면 더 진한 남색 + 링으로 강조
}

// 기본 버튼은 흰 배경 + 진한 남색 글자·테두리. danger(삭제/초기화 등 위험한 동작)만
// 빨간색으로 남겨서 안전 신호를 유지한다. active(토글 선택됨)는 진한 남색 박스 + 링으로
// 눈에 띄게 구별한다.
const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-white text-blue-950 border-blue-900 hover:bg-blue-50",
  secondary: "bg-white text-blue-950 border-blue-900 hover:bg-blue-50",
  danger: "bg-white text-red-600 border-red-400 hover:bg-red-50 hover:border-red-500",
  ghost: "bg-transparent text-black border-transparent hover:bg-gray-200",
};

const ACTIVE_CLASS = "bg-blue-950 text-white border-blue-950 ring-2 ring-blue-300 hover:bg-blue-950";

export default function Button({
  variant = "secondary",
  active,
  className = "",
  ...props
}: Props) {
  const base =
    "inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm " +
    "transition-all duration-150 ease-out hover:shadow-md hover:-translate-y-0.5 " +
    "active:translate-y-0 active:shadow-sm " +
    "disabled:opacity-50 disabled:pointer-events-none disabled:hover:translate-y-0 disabled:hover:shadow-sm";

  const variantClass = active ? ACTIVE_CLASS : VARIANT_CLASS[variant];

  return <button className={`${base} ${variantClass} ${className}`} {...props} />;
}
