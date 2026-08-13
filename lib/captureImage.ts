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

// 이미지 복사/다운로드/인쇄가 전부 이 함수로 만든 동일한 이미지(제목 + 근무표)를 쓴다.
export async function captureScheduleImage(
  node: HTMLElement,
  title: string
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
  ctx.fillStyle = "#111111";
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
