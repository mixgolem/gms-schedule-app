import Link from "next/link";

export default function NotFound() {
  return (
    <main className="p-4 max-w-[1900px] mx-auto w-full flex items-center justify-center min-h-[50vh]">
      <div className="text-center space-y-3">
        <p className="text-lg font-bold text-black">없는 페이지예요</p>
        <p className="text-sm text-black">주소가 바뀌었거나 잘못 입력됐을 수 있어요.</p>
        <Link
          href="/"
          className="inline-flex items-center rounded-lg border border-blue-900 bg-white px-4 py-2 text-sm font-medium text-blue-900 transition-all duration-150 ease-out hover:-translate-y-0.5 hover:bg-blue-50 hover:shadow-sm active:translate-y-0"
        >
          근무표로 가기
        </Link>
      </div>
    </main>
  );
}
