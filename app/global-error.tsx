"use client";

// 레이아웃(헤더 등) 자체가 깨졌을 때의 마지막 안전망. 이때는 앱 스타일·컴포넌트를 못 믿으니
// 최소한의 인라인 스타일만으로 그린다.
export default function GlobalError({ retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <html lang="ko">
      <body style={{ fontFamily: "sans-serif", display: "flex", justifyContent: "center", paddingTop: 80 }}>
        <div style={{ textAlign: "center" }}>
          <p style={{ fontSize: 18, fontWeight: 700 }}>GMS 근무 스케줄을 불러오지 못했어요</p>
          <p style={{ fontSize: 14 }}>잠시 후 다시 시도해주세요.</p>
          <button
            onClick={() => retry()}
            style={{ marginTop: 12, padding: "8px 16px", border: "1px solid #1e3a8a", borderRadius: 8, background: "white", color: "#1e3a8a", cursor: "pointer" }}
          >
            다시 시도
          </button>
        </div>
      </body>
    </html>
  );
}
