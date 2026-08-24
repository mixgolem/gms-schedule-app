import { AnchorHTMLAttributes } from "react";

type Variant = "primary" | "secondary" | "danger" | "ghost";

interface Props extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: Variant;
}

// Button.tsx와 같은 톤(흰 배경 + 남색 글자·테두리)을 쓰는 링크형 버튼.
// 파일 다운로드(<a download>)처럼 button으로 만들 수 없는 곳에 쓴다.
const VARIANT_CLASS: Record<Variant, string> = {
  primary: "bg-white text-blue-950 border-blue-900 hover:bg-blue-50",
  secondary: "bg-white text-blue-950 border-blue-900 hover:bg-blue-50",
  danger: "bg-white text-red-600 border-red-400 hover:bg-red-50 hover:border-red-500",
  ghost: "bg-transparent text-black border-transparent hover:bg-gray-200",
};

export default function LinkButton({ variant = "secondary", className = "", ...props }: Props) {
  const base =
    "inline-flex items-center justify-center gap-1 rounded-lg border px-3 py-1.5 text-sm font-medium shadow-sm " +
    "transition-all duration-150 ease-out hover:shadow-md hover:-translate-y-0.5 " +
    "active:translate-y-0 active:shadow-sm";

  return <a className={`${base} ${VARIANT_CLASS[variant]} ${className}`} {...props} />;
}
