import { toBlob } from "html-to-image";
import { CAPTURE_THEME, withCaptureTheme } from "./theme";

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

const LOGO_URL = "/logo-ksl.png";

// 제목줄 맨 왼쪽에 회사 로고를 그리고, 제목 글자가 시작할 x좌표를 돌려준다. 로고가 진한
// 남색이라 남색 배너 위에서는 묻혀서 흰색 둥근 카드를 깔고 그 위에 올린다.
async function drawLogo(
  ctx: CanvasRenderingContext2D,
  barHeight: number,
  margin: number,
  onBanner: boolean
): Promise<number> {
  let logo: HTMLImageElement;
  try {
    logo = await loadImage(LOGO_URL);
  } catch {
    return margin; // 로고를 못 불러와도 근무표 이미지 저장은 그대로 진행
  }

  const cardHeight = Math.round(barHeight * 0.74);
  const cardPad = Math.round(cardHeight * 0.14);
  const logoHeight = cardHeight - cardPad * 2;
  const logoWidth = Math.round((logoHeight * logo.naturalWidth) / logo.naturalHeight);
  const cardWidth = logoWidth + cardPad * 2;
  const cardX = margin;
  const cardY = Math.round((barHeight - cardHeight) / 2);

  if (onBanner) {
    ctx.fillStyle = "#ffffff";
    ctx.beginPath();
    ctx.roundRect(cardX, cardY, cardWidth, cardHeight, Math.round(cardHeight * 0.18));
    ctx.fill();
  }
  ctx.drawImage(logo, cardX + cardPad, cardY + cardPad, logoWidth, logoHeight);
  return cardX + cardWidth + Math.round(margin * 0.7);
}

// 리퀴드 글래스 배경(theme.css의 body::before와 같은 빛 번짐)을 캔버스에 직접 그린다. 이 배경은
// 근무표 바깥(화면 뒤 고정층)에 있어서 캡처에 안 잡히므로, 근무표는 투명 배경으로 찍고 이 위에 얹는다.
function paintGlassBackground(ctx: CanvasRenderingContext2D, width: number, height: number) {
  ctx.fillStyle = "#e2e9f8";
  ctx.fillRect(0, 0, width, height);
  const glow = (x: number, y: number, r: number, color: string) => {
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, color);
    g.addColorStop(1, "rgba(226, 233, 248, 0)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
  };
  glow(width * 0.08, -height * 0.05, width * 0.6, "#b4c8ff");
  glow(width, height * 0.03, width * 0.5, "#d6c5ff");
  glow(width * 0.55, height * 1.08, width * 0.5, "#b8e4f7");
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
  // 공유·인쇄용이라 각자 고른 테마와 상관없이 항상 기본값 테마로 찍는다
  const glass = CAPTURE_THEME.style === "glass";
  const raw = await withCaptureTheme(() =>
    toBlob(node, { pixelRatio: 2, backgroundColor: glass ? undefined : "#ffffff" })
  );
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

  if (glass) {
    paintGlassBackground(ctx, canvas.width, canvas.height);
  } else {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  if (options?.banner) {
    // tailwind blue-900, 앱 헤더와 같은 색 (글래스는 헤더처럼 살짝 비치는 남색)
    ctx.fillStyle = glass ? "rgba(30, 58, 138, 0.88)" : "#1e3a8a";
    ctx.fillRect(0, 0, canvas.width, titleHeight);
  }
  const titleX = await drawLogo(ctx, titleHeight, padding, !!options?.banner);
  ctx.fillStyle = options?.banner ? "#ffffff" : "#111111";
  ctx.font = `bold ${fontSize}px Arial, sans-serif`;
  ctx.textAlign = "left";
  ctx.textBaseline = "top";
  ctx.fillText(title, titleX, padding);
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
