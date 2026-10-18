// 서버 레이아웃(<head>)에서도 쓰는 테마 상수라 "use client" 파일(theme.ts)과 분리해 둔다.
export const THEME_STORAGE_KEY = "gms.theme";

// 첫 화면이 그려지기 전에 저장된 테마를 <html data-style data-mode>에 바로 걸어서,
// 라이트로 잠깐 깜빡였다가 바뀌는 걸 막는다.
export const THEME_INIT_SCRIPT = `(function(){try{var t=JSON.parse(localStorage.getItem("${THEME_STORAGE_KEY}")||"{}");var d=document.documentElement;d.dataset.style=t.style==="basic"?"basic":"glass";d.dataset.mode="light";}catch(e){}})();`;
