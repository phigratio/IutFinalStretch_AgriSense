import { readFile, mkdtemp, rm } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import mammoth from "mammoth";
import JSZip from "jszip";

const execFileAsync = promisify(execFile);

export interface ExtractedSection {
  label: string;
  text: string;
}

export type ExtractionProgress = (progress: { current: number; total: number; stage: string }) => Promise<void> | void;

function clean(text: string): string {
  return text.replace(/\u0000/g, "").replace(/[ \t]+/g, " ").replace(/\n{3,}/g, "\n\n").trim();
}

function stripHtml(html: string): string {
  return clean(html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&#39;/g, "'").replace(/&quot;/gi, "\"")
  );
}

async function extractPdf(filePath: string, onProgress?: ExtractionProgress): Promise<ExtractedSection[]> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const data = new Uint8Array(await readFile(filePath));
  const pdf = await pdfjs.getDocument({ data, useSystemFonts: true }).promise;
  const sections: ExtractedSection[] = [];
  for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
    try {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const embedded = clean(content.items.map((item) => "str" in item ? item.str : "").join(" "));
      // Scanned PDFs sometimes contain only page numbers or a few garbage glyphs.
      const ocr = embedded.length < 40 ? await ocrPdfPage(filePath, pageNo) : "";
      const text = ocr.length > embedded.length ? ocr : embedded;
      if (text) sections.push({ label: String(pageNo), text });
    } finally {
      await onProgress?.({ current: pageNo, total: pdf.numPages, stage: `OCR page ${pageNo}/${pdf.numPages}` });
    }
  }
  if (!sections.length) throw new Error("No readable Bangla or English text was found in this PDF");
  return sections;
}

async function ocrPdfPage(filePath: string, pageNo: number): Promise<string> {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agrisense-pdf-"));
  const outputBase = path.join(tempDir, "page");
  const imagePath = `${outputBase}.png`;
  try {
    await execFileAsync("pdftoppm", ["-f", String(pageNo), "-l", String(pageNo), "-singlefile", "-r", "300", "-gray", "-png", filePath, outputBase], {
      timeout: 5 * 60_000, maxBuffer: 10 * 1024 * 1024,
    });
    try {
      return (await extractImage(imagePath))[0]?.text ?? "";
    } catch (error) {
      // Blank covers, separators and image-only pages are normal in printed books.
      if (error instanceof Error && error.message.includes("OCR did not find")) return "";
      throw error;
    }
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
}

async function extractImage(filePath: string): Promise<ExtractedSection[]> {
  const { stdout } = await execFileAsync("tesseract", [filePath, "stdout", "-l", "ben+eng"], {
    maxBuffer: 50 * 1024 * 1024,
    timeout: 10 * 60_000,
  });
  const text = clean(stdout);
  if (!text) throw new Error("OCR did not find readable Bangla or English text in this image");
  return [{ label: "image", text }];
}

async function extractEpub(filePath: string): Promise<ExtractedSection[]> {
  const zip = await JSZip.loadAsync(await readFile(filePath));
  const names = Object.keys(zip.files).filter((name) => /\.(xhtml|html|htm)$/i.test(name)).sort();
  const sections: ExtractedSection[] = [];
  for (const name of names) {
    const text = stripHtml(await zip.files[name].async("string"));
    if (text) sections.push({ label: path.basename(name), text });
  }
  if (!sections.length) throw new Error("No readable chapters were found in this EPUB");
  return sections;
}

export async function extractFile(filePath: string, mimeType: string, originalName: string, onProgress?: ExtractionProgress): Promise<ExtractedSection[]> {
  const ext = path.extname(originalName).toLowerCase();
  if (mimeType === "application/pdf" || ext === ".pdf") return extractPdf(filePath, onProgress);
  if (mimeType.startsWith("image/") || [".png", ".jpg", ".jpeg", ".webp", ".tif", ".tiff"].includes(ext)) return extractImage(filePath);
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" || ext === ".docx") {
    const result = await mammoth.extractRawText({ path: filePath });
    const text = clean(result.value);
    if (!text) throw new Error("No readable text was found in this DOCX");
    return [{ label: "document", text }];
  }
  if (mimeType === "application/epub+zip" || ext === ".epub") return extractEpub(filePath);
  if (mimeType.startsWith("text/") || [".txt", ".md", ".csv"].includes(ext)) {
    const text = clean(await readFile(filePath, "utf8"));
    if (!text) throw new Error("The uploaded text file is empty");
    return [{ label: "document", text }];
  }
  throw new Error(`Unsupported file type: ${mimeType || ext}`);
}
