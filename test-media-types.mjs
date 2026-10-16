// Shared media-type gates: one list for uploads, folder browse, serving.
import fs from 'fs';
import { MEDIA_IMAGE_EXT, MEDIA_VIDEO_EXT, MEDIA_AUDIO_EXT, BIBLE_MEDIA_EXT, SUPPORTED_LABEL, extOf } from './electron/mediaTypes.js';

const fails = [];
const check = (label, cond, detail) => {
  if (cond) console.log('  PASS  ' + label);
  else { fails.push(label); console.log('  FAIL  ' + label + (detail ? '  -> ' + detail : '')); }
};

console.log('--- media type lists ---');
for (const ext of ['.png', '.jpg', '.jpeg', '.jfif', '.gif', '.webp', '.bmp', '.svg', '.avif']) {
  check(`image ${ext} listed`, MEDIA_IMAGE_EXT.includes(ext));
}
for (const ext of ['.mp4', '.webm', '.mov', '.mkv']) {
  check(`video ${ext} listed`, MEDIA_VIDEO_EXT.includes(ext));
}
check('HEIC excluded (unrenderable)', !BIBLE_MEDIA_EXT.includes('.heic') && !BIBLE_MEDIA_EXT.includes('.heif'));
check('BIBLE list is images+videos', BIBLE_MEDIA_EXT.length === MEDIA_IMAGE_EXT.length + MEDIA_VIDEO_EXT.length);
check('extOf lowercases + strips query', extOf('Photo.JPG?x=1') === '.jpg' && extOf('noext') === '' && extOf('a.HEIC') === '.heic');
check('label names formats', SUPPORTED_LABEL.includes('BMP') && SUPPORTED_LABEL.includes('MKV'));

console.log('--- single source wiring ---');
const mainSrc = fs.readFileSync('./electron/main.js', 'utf8');
check('main imports mediaTypes', mainSrc.includes("from './mediaTypes.js'"));
check('no local BIBLE_MEDIA_EXT redefinition', !mainSrc.includes('const BIBLE_MEDIA_EXT = ['));
check('upload gate uses shared lists', mainSrc.includes('[...MEDIA_IMAGE_EXT, ...MEDIA_VIDEO_EXT, ...MEDIA_AUDIO_EXT]'));
check('kind detection uses shared lists', mainSrc.includes('MEDIA_IMAGE_EXT.includes(ext)'));
check('mime covers svg/avif/jfif/mkv', mainSrc.includes("'.svg'") && mainSrc.includes("'.avif'") && mainSrc.includes("'.jfif'") && mainSrc.includes("'.mkv'"));
const lanSrc = fs.readFileSync('./electron/lanServer.js', 'utf8');
check('lan imports mediaTypes', lanSrc.includes("from './mediaTypes.js'"));
check('no local list in lan', !lanSrc.includes('const BIBLE_MEDIA_EXT = ['));
check('lan mime covers new types', lanSrc.includes("'.avif'") && lanSrc.includes("'.svg'") && lanSrc.includes("'.mkv'"));
const linkSrc = fs.readFileSync('./src/mobile/link.js', 'utf8');
check('phone blocks mkv streams', linkSrc.includes('mkv'));
const picker = fs.readFileSync('./src/components/ScriptureMediaPicker.jsx', 'utf8');
check('picker validates extension', picker.includes('BIBLE_MEDIA_EXT.includes(ext)'));
check('picker explains HEIC', picker.includes('HEIC'));
check('picker shows inline error', picker.includes('uploadError'));

console.log(fails.length ? `\nRESULT: ${fails.length} FAILED` : '\nRESULT: all passed');
process.exit(fails.length ? 1 : 0);
