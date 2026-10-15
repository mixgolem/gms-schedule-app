"use client";

import { useEffect } from "react";
import Link from "next/link";
import Button from "@/components/ui/Button";

// 화면을 그리다가 예상 못 한 오류가 나면 흰 화면 대신 이 안내가 뜬다(헤더는 그대로 남는다).
export default function ErrorPage({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="p-4 max-w-[1900px] mx-auto w-full flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-3 max-w-md">
        <p className="text-3xl" aria-hidden>
          😵
        </p>
        <p className="text-lg font-bold text-black">화면을 불러오다가 문제가 생겼어요</p>
        <p className="text-sm text-black">
          잠시 후 다시 시도해주세요. 계속 같은 화면이 나오면 관리자에게 알려주세요.
        </p>
        {error.digest && <p className="text-xs text-black/50 font-mono">오류 코드: {error.digest}</p>}
        <div className="flex items-center justify-center gap-2 pt-1">
          <Button variant="primary" onClick={() => retry()}>
            다시 시도
          </Button>
          <Button onClick={() => window.location.reload()}>새로고침</Button>
          <Link href="/" className="text-sm text-blue-900 underline underline-offset-2 px-2">
            처음 화면으로
          </Link>
        </div>
      </div>
    </main>
  );
}
