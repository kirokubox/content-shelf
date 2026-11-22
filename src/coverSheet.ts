// 表紙の並びを1枚の画像（PNG）にする。月のまとめの「画像で保存」で使う。
// 入れるのは見出し（例：2026年11月）と表紙だけ。題名は、表紙の画像が無い作品の代わりの表紙にだけ出る。
import { getPhoto } from "./storage";
import type { Work } from "./types";

export interface CoverSheetResult {
  blob: Blob;
  /** 画像に入れた作品の数 */
  drawn: number;
  /** 表紙の画像を読み込めず、題名の表紙にした作品の数（もともと画像が無い作品は数えない） */
  failed: number;
  /** 多すぎて入れなかった作品の数 */
  omitted: number;
}

export const COVER_SHEET_LIMIT = 120;
const WIDTH = 1080;
const PAD = 48;
const GAP = 16;
const HEADER = 110;

export function coverSheetColumns(count: number): number {
  if (count <= 4) return 2;
  if (count <= 9) return 3;
  return 4;
}

type CoverWork = Pick<Work, "coverPhotoId" | "coverUrl" | "medium" | "title">;
type Drawable = { source: CanvasImageSource; width: number; height: number };

function loadUrl(url: string): Promise<Drawable | null> {
  return new Promise((resolve) => {
    const img = new Image();
    // ほかのサイトの画像は、相手が許可している場合だけ画像に書き出せる。許可が無ければ読み込みに失敗させ、題名の表紙にする
    img.crossOrigin = "anonymous";
    img.onload = () => resolve({ source: img, width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

async function loadCover(work: CoverWork): Promise<Drawable | null> {
  if (work.coverPhotoId) {
    try {
      const photo = await getPhoto(work.coverPhotoId);
      if (photo?.blob) {
        const bitmap = await createImageBitmap(photo.blob);
        return { source: bitmap, width: bitmap.width, height: bitmap.height };
      }
    } catch {
      // 写真を読めなければ、画像のURLを試す
    }
  }
  return work.coverUrl ? loadUrl(work.coverUrl) : null;
}

function cssVar(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function roundedRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** 題名を幅に合わせて折り返す（入りきらない分は「…」） */
export function wrapTitle(title: string, maxWidth: number, maxLines: number, measure: (text: string) => number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const ch of Array.from(title)) {
    if (measure(line + ch) <= maxWidth || line === "") {
      line += ch;
      continue;
    }
    lines.push(line);
    line = ch;
    if (lines.length === maxLines) break;
  }
  if (lines.length < maxLines && line !== "") lines.push(line);
  else if (lines.length === maxLines && line !== "") {
    let last = lines[maxLines - 1];
    while (last.length > 1 && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
    lines[maxLines - 1] = `${last}…`;
  }
  return lines;
}

export async function buildCoverSheet(heading: string, works: CoverWork[], limit = COVER_SHEET_LIMIT): Promise<CoverSheetResult> {
  const list = works.slice(0, limit);
  const cols = coverSheetColumns(list.length);
  const rows = Math.max(1, Math.ceil(list.length / cols));
  const tileW = Math.floor((WIDTH - PAD * 2 - GAP * (cols - 1)) / cols);
  const tileH = Math.round(tileW * 1.5);
  const canvas = document.createElement("canvas");
  canvas.width = WIDTH;
  canvas.height = PAD + HEADER + rows * tileH + (rows - 1) * GAP + PAD;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("画像を作れませんでした");
  const fontFamily = getComputedStyle(document.body).fontFamily || "sans-serif";

  ctx.fillStyle = cssVar("--kb-surface", "#ffffff");
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = cssVar("--kb-text", "#1f2328");
  ctx.textBaseline = "middle";
  ctx.font = `700 56px ${fontFamily}`;
  ctx.fillText(heading, PAD, PAD + HEADER / 2 - 10);

  const covers = await Promise.all(list.map((work) => loadCover(work)));
  let failed = 0;
  const radius = Math.round(tileW * 0.04);
  list.forEach((work, i) => {
    const x = PAD + (i % cols) * (tileW + GAP);
    const y = PAD + HEADER + Math.floor(i / cols) * (tileH + GAP);
    const cover = covers[i];
    ctx.save();
    roundedRect(ctx, x, y, tileW, tileH, radius);
    ctx.clip();
    if (cover && cover.width > 0 && cover.height > 0) {
      // 枠いっぱいに敷き、はみ出す分は中央で切る
      const scale = Math.max(tileW / cover.width, tileH / cover.height);
      const sw = tileW / scale;
      const sh = tileH / scale;
      ctx.drawImage(cover.source, (cover.width - sw) / 2, (cover.height - sh) / 2, sw, sh, x, y, tileW, tileH);
    } else {
      if (work.coverPhotoId || work.coverUrl) failed += 1;
      ctx.fillStyle = cssVar(`--kb-cover-${work.medium}`, "#5d676d");
      ctx.fillRect(x, y, tileW, tileH);
      ctx.fillStyle = cssVar("--kb-cover-text", "#ffffff");
      const size = Math.round(tileW * 0.105);
      ctx.font = `800 ${size}px ${fontFamily}`;
      ctx.textAlign = "center";
      const inner = tileW - Math.round(tileW * 0.16);
      const lines = wrapTitle(work.title, inner, 6, (text) => ctx.measureText(text).width);
      const lineHeight = Math.round(size * 1.35);
      const top = y + tileH / 2 - ((lines.length - 1) * lineHeight) / 2;
      lines.forEach((text, n) => ctx.fillText(text, x + tileW / 2, top + n * lineHeight));
      ctx.textAlign = "start";
    }
    ctx.restore();
  });

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"));
  if (!blob) throw new Error("画像を作れませんでした");
  return { blob, drawn: list.length, failed, omitted: works.length - list.length };
}
