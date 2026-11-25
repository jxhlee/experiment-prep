// pdf.js 가 PDF 를 읽을 때 쓰는 작업자(worker) 파일을 public 으로 복사한다.
// 브라우저가 /pdf.worker.min.mjs 로 가져가므로, 설치(postinstall)와 개발·빌드 직전에 항상 맞춰 둔다. 복사본은 git 에 올리지 않는다.
import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const from = join(root, "node_modules", "pdfjs-dist", "build", "pdf.worker.min.mjs");
const to = join(root, "public", "pdf.worker.min.mjs");

if (!existsSync(from)) {
  console.warn("pdfjs-dist 가 아직 설치되지 않아 pdf worker 복사를 건너뜁니다. (npm install 뒤에 다시 실행됩니다)");
} else {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  console.log("pdf worker 를 public/ 으로 복사했습니다.");
}
