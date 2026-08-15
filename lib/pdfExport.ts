import { jsPDF } from "jspdf";

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

function loadImageSize(dataUrl: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUrl;
  });
}

// 캡처한 근무표 이미지를, 그 이미지 크기에 딱 맞는 한 페이지짜리 PDF로 만든다
// (별도 여백/스케일링 없이 이미지 그대로 한 장에 들어간다).
export async function imageBlobToPdfBlob(imageBlob: Blob): Promise<Blob> {
  const dataUrl = await blobToDataUrl(imageBlob);
  const { width, height } = await loadImageSize(dataUrl);

  const doc = new jsPDF({
    orientation: width >= height ? "landscape" : "portrait",
    unit: "px",
    format: [width, height],
  });
  doc.addImage(dataUrl, "PNG", 0, 0, width, height);
  return doc.output("blob");
}
