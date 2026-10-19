// 관리자 메뉴를 일반 사용자가 조회만 할 때 창 위쪽에 띄우는 안내 줄
export default function ReadOnlyNotice({ className = "" }: { className?: string }) {
  return (
    <p className={`text-xs text-black bg-gray-50 border rounded-lg px-2 py-1 ${className}`}>
      조회 전용 · 수정은 관리자만 가능해요
    </p>
  );
}
