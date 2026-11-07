// Every tile in the media grid used to point straight at the uploaded file.
// A phone photo is 8-12 MP, so a grid of 60 of them asks the renderer to hold
// hundreds of megabytes of decoded bitmaps at once; past Chromium's decoded
// image budget the tiles simply stop painting (which is why a long library
// looked empty while a short one looked fine). The main process now keeps a
// 480px JPEG beside the original and serves it at /thumbs/, so a tile costs a
// thumbnail's worth of memory instead of a print master's.
//
// Only library uploads have thumbnails: Bible-folder art (/bf/), countdown
// uploads (/cd/) and remote URLs keep their own URL.

const IMAGE_EXT = /\.(jpe?g|png|webp|gif|bmp|avif|jfif)$/i;

const isLibraryMedia = (url) =>
  typeof url === 'string' && url.startsWith('media://kog-media/');

export const thumbUrl = (url, kind) => {
  if (!isLibraryMedia(url)) return url;
  if (kind === 'video' || kind === 'audio') return url;
  // Already a derived URL (thumbnail, Bible folder, countdown upload).
  if (/\/(thumbs|cd|bf)\//.test(url)) return url;
  const cut = url.lastIndexOf('/');
  if (cut < 0) return url;
  const name = url.slice(cut + 1);
  if (!IMAGE_EXT.test(name.split('?')[0])) return url;
  return `${url.slice(0, cut)}/thumbs/${name}`;
};
