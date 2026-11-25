// 브라우저에서 PDF 파일을 읽어 논문의 Methods 부분을 뽑아낸다. 파일은 서버로 보내지 않고 이 브라우저 안에서만 읽는다.
// pdf.js 는 무거우므로 PDF 를 고를 때 처음 불러온다(동적 import). 글자 처리는 pdf-text.mjs 가 맡는다.

import { extractMethods } from "./pdf-text.mjs";

export const MAX_PDF_BYTES = 40 * 1024 * 1024;
export const MAX_PDF_PAGES = 80;

export class PdfReadError extends Error {
  constructor(kind, message) {
    super(message);
    this.name = "PdfReadError";
    this.kind = kind;
  }
}

/** pdf.js 가 던진 오류 → 사용자에게 보여 줄 오류 */
export function describePdfError(err) {
  const name = String(err?.name ?? "");
  if (name === "PasswordException") return new PdfReadError("password", "암호가 걸린 PDF예요. 암호를 풀어서 다시 올려 주세요.");
  if (name === "InvalidPDFException" || name === "FormatError") return new PdfReadError("invalid", "PDF 파일을 열 수 없어요. 파일이 깨졌거나 PDF가 아닐 수 있어요.");
  if (name === "MissingPDFException") return new PdfReadError("invalid", "PDF 파일을 찾을 수 없어요.");
  return new PdfReadError("unknown", "PDF를 읽는 중 오류가 났어요. 다른 파일로 다시 시도하거나, 본문을 직접 붙여넣어 주세요.");
}

/**
 * PDF 파일 → extractMethods 의 결과({ text, found, sections, pageTexts, warnings, … }) + { totalPages, readPages }.
 * onProgress(읽은 쪽, 전체 쪽) 로 진행 상황을 알린다. 너무 긴 문서는 앞 MAX_PDF_PAGES 쪽만 읽고 warnings 에 'limited-pages' 를 남긴다.
 */
export async function readPdfMethods(file, { onProgress, maxChars = 30000 } = {}) {
  if (!file) throw new PdfReadError("invalid", "파일을 고르지 않았어요.");
  if (!/\.pdf$/i.test(file.name) && file.type !== "application/pdf") {
    throw new PdfReadError("invalid", "PDF 파일만 올릴 수 있어요.");
  }
  if (file.size > MAX_PDF_BYTES) {
    throw new PdfReadError("too-big", `파일이 너무 커요 (${(file.size / 1048576).toFixed(0)}MB). ${MAX_PDF_BYTES / 1048576}MB 이하만 읽을 수 있어요.`);
  }

  const pdfjs = await import("pdfjs-dist/build/pdf.mjs");
  pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

  // 정리(destroy)는 문서가 아니라 불러오기 작업(loadingTask)에 있다
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const cleanup = async () => {
    try {
      await task.destroy();
    } catch {
      // 정리 실패는 결과에 영향이 없다
    }
  };
  let doc;
  try {
    doc = await task.promise;
  } catch (err) {
    await cleanup();
    throw describePdfError(err);
  }

  try {
    const total = Math.min(doc.numPages, MAX_PDF_PAGES);
    const pages = [];
    for (let n = 1; n <= total; n++) {
      const content = await (await doc.getPage(n)).getTextContent();
      pages.push(
        content.items
          .filter((item) => "str" in item)
          .map((item) => ({ str: item.str, x: item.transform[4], w: item.width, h: item.height, eol: item.hasEOL })),
      );
      onProgress?.(n, total);
    }
    const result = extractMethods(pages, { maxChars });
    if (doc.numPages > total) result.warnings = [...result.warnings, "limited-pages"];
    return { ...result, totalPages: doc.numPages, readPages: total };
  } catch (err) {
    throw describePdfError(err);
  } finally {
    await cleanup();
  }
}
