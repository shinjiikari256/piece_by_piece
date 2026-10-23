/**
 * Документы для скачивания: грамота и результат прохождения в PDF.
 * Рисуются на холсте теми же шрифтами, что и игра, и упаковываются в PDF A4 (по картинке на страницу) —
 * без библиотек, работает и в офлайн-файле.
 */

export { downloadCertificate, downloadResultPdf, jpegsToPdf } from "./pdf";
export { drawCertificate, type CertificateData } from "./certificate";
export { drawResultPages, type ResultDocData } from "./result";
export { PAGE_W, PAGE_H, type Tone } from "./common";
