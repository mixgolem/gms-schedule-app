// realtime 변경 이벤트는 한 번의 작업(예: 이번 달 초기화로 여러 행 삭제)에도
// 행 개수만큼 여러 번 올 수 있어, 그때마다 즉시 재조회하면 네트워크 요청이
// 몰려 브라우저가 느려지거나(ERR_INSUFFICIENT_RESOURCES 등) 응답 순서가 꼬일 수 있다.
// 짧은 시간 안에 몰려온 호출은 마지막 한 번으로 합쳐서 실행한다.
export function debounce<Args extends unknown[]>(fn: (...args: Args) => void, waitMs: number) {
  let timer: ReturnType<typeof setTimeout> | null = null;

  const run = (...args: Args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn(...args);
    }, waitMs);
  };

  const cancel = () => {
    if (timer) clearTimeout(timer);
    timer = null;
  };

  return { run, cancel };
}
