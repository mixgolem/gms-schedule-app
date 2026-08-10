import { toBlob } from "html-to-image";

export async function captureNodeAsBlob(node: HTMLElement): Promise<Blob | null> {
  return toBlob(node, { pixelRatio: 2, backgroundColor: "#ffffff" });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
