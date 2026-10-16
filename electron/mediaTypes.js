// Shared media-type gates — ONE list every uploader, folder browser and
// protocol branch reads, so a picture the grid shows can always be uploaded
// (and vice versa). Pure module: safe to import from Electron main AND from
// Vite-bundled renderer code.
//
// Renderable-only: every extension here must display in Chromium (<img> /
// CSS background / <video>). Notably EXCLUDED: HEIC/HEIF (iPhone default —
// Chromium cannot decode it, so accepting it would upload into a broken
// tile). The picker names it explicitly instead of failing silently.
export const MEDIA_IMAGE_EXT = ['.png', '.jpg', '.jpeg', '.jfif', '.gif', '.webp', '.bmp', '.svg', '.avif'];
export const MEDIA_VIDEO_EXT = ['.mp4', '.webm', '.mov', '.mkv'];
export const MEDIA_AUDIO_EXT = ['.mp3', '.m4a', '.wav', '.ogg', '.aac'];

// Everything the scripture/folder surfaces accept (pictures + video).
export const BIBLE_MEDIA_EXT = [...MEDIA_IMAGE_EXT, ...MEDIA_VIDEO_EXT];

// Human list for rejection messages ("JPG, PNG, …").
export const SUPPORTED_LABEL = 'JPG, PNG, GIF, WebP, BMP, SVG, AVIF, MP4, WebM, MOV or MKV';

export const extOf = (name) => {
  const base = String(name || '').split(/[?#]/)[0];
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot).toLowerCase() : '';
};
