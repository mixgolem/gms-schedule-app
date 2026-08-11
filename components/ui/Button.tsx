"use client";

import { ButtonHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  active?: boolean; // 선택/토글된 상태면 primary 스타일로 강조
}

const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-blue-900 text-white border-blue-900 hover:bg-blue-800",
  secondary: "bg-white text-gray-700 border-gray-400 hover:bg-gray-100 hover:border-gray-500",
  danger: "bg-white text-red-600 border-red-400 hover:bg-red-50 hover:border-red-500",
  ghost: "bg-transparent text-gray-500 border-transparent hover:bg-gray-100",
};

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

  const variantClass = active ? VARIANT_CLASS.primary : VARIANT_CLASS[variant];

  return <button className={`${base} ${variantClass} ${className}`} {...props} />;
}
