import { APP_NAME_LATIN } from "../../env";
import { CertificateData, drawCertificate } from "./certificate";
import { PAGE_H, PAGE_W, loadFonts } from "./common";
import { ResultDocData, drawResultPages } from "./result";

// ---------- PDF: по картинке JPEG на страницу A4 ----------

const enc = new TextEncoder();

function dataUrlBytes(url: string): Uint8Array {
  const bin = atob(url.slice(url.indexOf(",") + 1));
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

/** Минимальный PDF 1.4: каталог, страницы A4, на каждой — JPEG во весь лист. */
export function jpegsToPdf(jpegs: Uint8Array[], width: number, height: number, title: string): Blob {
  const parts: Uint8Array[] = [];
  const offsets: number[] = [];
  let length = 0;
  const push = (chunk: string | Uint8Array) => {
    const bytes = typeof chunk === "string" ? enc.encode(chunk) : chunk;
    parts.push(bytes);
    length += bytes.length;
  };
  const obj = (n: number, body: string | (() => void)) => {
    offsets[n] = length;
    push(`${n} 0 obj\n`);
    if (typeof body === "string") push(body);
    else body();
    push("\nendobj\n");
  };
  // строки PDF в UTF-16BE — чтобы кириллица в названии читалась
  const pdfText = (s: string) => "<FEFF" + [...s].map((ch) => ch.charCodeAt(0).toString(16).padStart(4, "0")).join("").toUpperCase() + ">";
  const W = 595.28;
  const H = 841.89;
  const content = `q ${W} 0 0 ${H} 0 0 cm /Im0 Do Q`;
  // 1 — каталог, 2 — дерево страниц, 3 — сведения; на страницу i: страница, картинка, содержимое
  const pageObj = (i: number) => 4 + i * 3;
  const count = jpegs.length;
  const total = 4 + count * 3;

  push("%PDF-1.4\n%\xE2\xE3\xCF\xD3\n");
  obj(1, "<< /Type /Catalog /Pages 2 0 R >>");
  obj(2, `<< /Type /Pages /Kids [${jpegs.map((_, i) => `${pageObj(i)} 0 R`).join(" ")}] /Count ${count} >>`);
  obj(3, `<< /Title ${pdfText(title)} /Producer (${APP_NAME_LATIN}) >>`);
  jpegs.forEach((jpeg, i) => {
    const p = pageObj(i);
    obj(p, `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /XObject << /Im0 ${p + 1} 0 R >> >> /Contents ${p + 2} 0 R >>`);
    obj(p + 1, () => {
      push(`<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} /ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`);
      push(jpeg);
      push("\nendstream");
    });
    obj(p + 2, `<< /Length ${content.length} >>\nstream\n${content}\nendstream`);
  });
  const xref = length;
  push(`xref\n0 ${total}\n0000000000 65535 f \n${offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`);
  push(`trailer\n<< /Size ${total} /Root 1 0 R /Info 3 0 R >>\nstartxref\n${xref}\n%%EOF\n`);
  return new Blob(parts as BlobPart[], { type: "application/pdf" });
}

export function save(blob: Blob, filename: string) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
}

const surname = (name: string) => name.trim().split(/\s+/)[0] || "doznavatel";
const jpeg = (c: HTMLCanvasElement) => dataUrlBytes(c.toDataURL("image/jpeg", 0.9));

export async function downloadCertificate(d: CertificateData) {
  await loadFonts();
  const canvas = document.createElement("canvas");
  drawCertificate(canvas, d);
  save(jpegsToPdf([jpeg(canvas)], PAGE_W, PAGE_H, `Грамота — дело №${d.caseNumber}`), `gramota-${d.caseNumber}-${surname(d.name)}.pdf`);
}

export async function downloadResultPdf(d: ResultDocData) {
  await loadFonts();
  const pages = drawResultPages(d);
  save(jpegsToPdf(pages.map(jpeg), PAGE_W, PAGE_H, `Результат — дело №${d.caseNumber}`), `rezultat-${d.caseNumber}-${surname(d.name)}.pdf`);
}
