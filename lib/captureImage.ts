import { toBlob } from "html-to-image";

export async function captureNodeAsBlob(node: HTMLElement): Promise<Blob | null> {
  return toBlob(node, { pixelRatio: 2, backgroundColor: "#ffffff" });
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

export interface CaptureScheduleImageOptions {
  // 제목 줄을 파란 바탕 + 흰 글씨 "배너"로 그릴지(PDF 저장용), 기본은 흰 바탕 + 검은 글씨.
  banner?: boolean;
}

// 이미지 복사/다운로드/PDF저장이 전부 이 함수로 만든 동일한 이미지(제목 + 근무표)를 쓴다.
export async function captureScheduleImage(
  node: HTMLElement,
  title: string,
  options?: CaptureScheduleImageOptions
): Promise<Blob | null> {
  const raw = await toBlob(node, { pixelRatio: 2, backgroundColor: "#ffffff" });
  if (!raw) return null;

  const url = URL.createObjectURL(raw);
  const img = await loadImage(url);
  URL.revokeObjectURL(url);

  const padding = Math.round(img.naturalWidth * 0.012);
  const fontSize = Math.max(28, Math.round(img.naturalWidth * 0.02));
  const titleHeight = fontSize + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = img.naturalWidth;
  canvas.height = img.naturalHeight + titleHeight;
  const ctx = canvas.getContext("2d");
  if (!ctx) return raw;

  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  if (options?.banner) {
    ctx.fillStyle = "#1e3a8a"; // tailwind blue-900, 앱 헤더/배너와 동일한 색
    ctx.fillRect(0, 0, canvas.width, titleHeight);
    ctx.fillStyle = "#ffffff";
  } else {
    ctx.fillStyle = "#111111";
  }
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, padding, padding);
  ctx.drawImage(img, 0, titleHeight);

  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b), "image/png");
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// 데스크탑 브라우저(특히 크롬)도 최근엔 navigator.share를 지원하는 경우가 있는데,
// 데스크탑에서는 항상 기존 클립보드 복사/파일 다운로드 방식을 그대로 쓰고 싶어서
// 모바일 기기일 때만 공유 시트를 쓰도록 제한한다.
export function isMobileDevice(): boolean {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

// 모바일(iOS Safari 등)에서는 클립보드 이미지 쓰기나 <a download>가 제대로 안 통하는
// 경우가 많아서, 모바일이면서 Web Share API가 되는 환경이면 그걸 우선 쓰는 게 안정적이다.
export function canShareFile(file: File): boolean {
  return (
    isMobileDevice() &&
    typeof navigator.share === "function" &&
    typeof navigator.canShare === "function" &&
    navigator.canShare({ files: [file] })
  );
}

// 공유 시트를 띄운다. 사용자가 취소한 경우(AbortError)는 실패로 치지 않는다.
export async function shareFile(file: File, title: string): Promise<{ shared: boolean }> {
  try {
    await navigator.share({ files: [file], title });
    return { shared: true };
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") return { shared: true };
    return { shared: false };
  }
}
