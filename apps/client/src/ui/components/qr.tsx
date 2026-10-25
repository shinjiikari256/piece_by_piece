import { useMemo } from "react";
import { renderSVG } from "uqr";

/** QR-код на странице (SVG). */
export function QrCode({ text }: { text: string }) {
  const svg = useMemo(() => renderSVG(text), [text]);
  return <div className="qr" dangerouslySetInnerHTML={{ __html: svg }} />;
}

/** QR всегда чёрный на белом: цвета темы не используем, иначе код перестанет читаться сканером. */
const QR_BACKGROUND = "#ffffff";

/** QR-код картинкой PNG (для печати и слайдов). */
export async function downloadQr(text: string, name: string) {
  const svg = renderSVG(text, { border: 2 });
  const img = new Image();
  img.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  await img.decode();
  const size = 1024;
  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = QR_BACKGROUND;
  ctx.fillRect(0, 0, size, size);
  ctx.drawImage(img, 0, 0, size, size);
  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = `${name.replace(/[^\p{L}\p{N}_-]+/gu, "-")}.png`;
  a.click();
}
