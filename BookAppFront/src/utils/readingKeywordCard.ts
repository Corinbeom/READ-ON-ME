import { Asset } from 'expo-asset';

const galpiImage = require('@/assets/mascot/bookmark_idle_small_light.png');

export async function renderReadingKeywordCard(keywords: readonly string[]): Promise<Blob> {
  const mascot = new Image();
  mascot.src = Asset.fromModule(galpiImage).uri;
  await Promise.all([mascot.decode(), document.fonts.load('56px "NotoSerifKR-Regular"', keywords.join(' '))]);

  const canvas = document.createElement('canvas');
  canvas.width = 1080;
  canvas.height = 1080;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is unavailable');

  ctx.fillStyle = '#f8f3e8';
  ctx.fillRect(0, 0, 1080, 1080);
  ctx.fillStyle = '#29251e';
  ctx.textBaseline = 'middle';
  ctx.font = 'italic 78px Georgia, serif';
  ctx.fillText('Read On Me', 86, 139);
  ctx.fillStyle = '#cfc4ae';
  ctx.fillRect(86, 207, 908, 2);
  ctx.fillStyle = '#29251e';
  ctx.font = '60px "NotoSerifKR-Regular", serif';
  ctx.fillText('나의 독서 키워드', 86, 302);

  ctx.font = '54px "NotoSerifKR-Regular", serif';
  keywords.forEach((keyword, index) => {
    const y = 463 + (3 - keywords.length) * 55 + index * 106;
    ctx.fillStyle = '#e9dfca';
    ctx.fillRect(86, y - 43, 908, 86);
    ctx.fillStyle = '#29251e';
    ctx.fillText(keyword, 123, y, 824);
  });

  ctx.drawImage(mascot, 814, 785, 160, 160);
  ctx.fillStyle = '#6a5a43';
  ctx.font = '30px "NotoSerifKR-Regular", serif';
  ctx.fillText('읽는 중이거나 완독한 책에서 발견했어요.', 86, 970, 800);

  return new Promise((resolve, reject) => {
    canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('PNG export failed')), 'image/png');
  });
}

export function saveReadingKeywordCard(url: string) {
  const link = document.createElement('a');
  link.href = url;
  link.download = 'read-on-me-reading-keywords.png';
  link.click();
}
