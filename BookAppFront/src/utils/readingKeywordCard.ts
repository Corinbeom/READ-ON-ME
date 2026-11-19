import { Asset } from 'expo-asset';

const galpiImage = require('@/assets/mascot/reading_keyword_story.png');
export const readingKeywordCardSize = { width: 1080, height: 1920 };
const serif = '"NotoSerifKR-Regular", serif';
const heading = ['요즘 내가', '읽는 세계'];
const keywordSize = 81;
const keywordPositions = [
  { x: 347, y: 805, angle: -9, maxWidth: 450 },
  { x: 759, y: 925, angle: 6, maxWidth: 373 },
  { x: 318, y: 1114, angle: 10, maxWidth: 345 },
];

function wrapKeyword(ctx: CanvasRenderingContext2D, keyword: string, maxWidth: number) {
  if (ctx.measureText(keyword).width <= maxWidth) return [keyword];

  const words = keyword.split(/\s+/u);
  const useWordBoundaries = words.length > 1;
  const parts = useWordBoundaries ? words : Array.from(keyword);
  const separator = useWordBoundaries ? ' ' : '';
  let lines = [keyword];
  let widest = Infinity;
  for (let index = 1; index < parts.length; index += 1) {
    const first = parts.slice(0, index).join(separator);
    const second = parts.slice(index).join(separator);
    const width = Math.max(ctx.measureText(first).width, ctx.measureText(second).width);
    if (width < widest) {
      widest = width;
      lines = [first, second];
    }
  }
  return lines;
}

function drawKeywords(ctx: CanvasRenderingContext2D, keywords: readonly string[]) {
  ctx.fillStyle = '#4a322a';
  keywords.forEach((keyword, index) => {
    const { x, y, angle, maxWidth } = keywordPositions[index];
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle * Math.PI / 180);
    ctx.textAlign = 'center';
    ctx.font = `${keywordSize}px ${serif}`;

    const lines = wrapKeyword(ctx, keyword.trim(), maxWidth);
    const widest = Math.max(...lines.map(line => ctx.measureText(line).width));
    const size = widest > maxWidth ? keywordSize * maxWidth / widest : keywordSize;
    ctx.font = `${size}px ${serif}`;
    lines.forEach((line, lineIndex) => {
      const offset = (lineIndex - (lines.length - 1) / 2) * size * 1.12;
      ctx.fillText(line, 0, offset, maxWidth);
    });
    ctx.restore();
  });
}

let artwork: Promise<HTMLImageElement> | undefined;

export function loadReadingKeywordCardArtwork() {
  if (!artwork) {
    const mascot = new Image();
    mascot.src = Asset.fromModule(galpiImage).uri;
    artwork = Promise.all([
      mascot.decode(),
      document.fonts.load(`${keywordSize}px ${serif}`, heading.join(' ')),
    ]).then(() => mascot).catch(error => {
      artwork = undefined;
      throw error;
    });
  }
  return artwork;
}

export function drawReadingKeywordCard(canvas: HTMLCanvasElement, mascot: HTMLImageElement, keywords: readonly string[]) {
  if (keywords.length > keywordPositions.length) throw new RangeError('Select up to three reading keywords');
  const { width, height } = readingKeywordCardSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');

  const background = ctx.createRadialGradient(529, 1075, 0, 529, 1075, 1290);
  background.addColorStop(0, '#fae5d2');
  background.addColorStop(0.57, '#fdf3e6');
  background.addColorStop(1, '#fff9ef');
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, width, height);

  ctx.drawImage(mascot, 18, 535, 1044, 1044);

  ctx.fillStyle = '#322b26';
  ctx.textBaseline = 'middle';
  ctx.textAlign = 'left';
  ctx.font = `73px ${serif}`;
  ctx.fillText(heading[0], 111, 263);
  ctx.font = `122px ${serif}`;
  ctx.fillText(heading[1], 111, 379);
  drawKeywords(ctx, keywords);

  ctx.fillStyle = '#503d33';
  ctx.textAlign = 'center';
  ctx.font = 'italic 48px Georgia, serif';
  ctx.fillText('Read On Me', width / 2, 1690);
}

export async function saveReadingKeywordCard(canvas: HTMLCanvasElement) {
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(result => result ? resolve(result) : reject(new Error('PNG export failed')), 'image/png');
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'read-on-me-reading-story.png';
  link.click();
  // Give the browser time to open the download before releasing the URL.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
