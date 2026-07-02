import type { IconType } from 'react-icons';
import {
  FcDocument, FcLink, FcRules, FcPackage, FcSynchronize, FcTreeStructure,
  FcLock, FcUnlock, FcGallery, FcCamera, FcPicture, FcRuler, FcFlashOn,
  FcVideoFile, FcMusic, FcSettings, FcTemplate, FcAudioFile, FcDeleteDatabase,
  FcReading, FcEditImage, FcPrivacy, FcGlobe, FcPortraitMode, FcInspection,
  FcFilm, FcSpeaker, FcFile, FcOpenedFolder,
  FcBinoculars, FcKey, FcDataSheet, FcMultipleInputs, FcClock,
} from 'react-icons/fc';

export interface Tool {
  name: string;
  href: string;
  icon: IconType;
  desc: string;
  /** <title> tag for the tool page */
  pageTitle: string;
  /** Meta description for the tool page */
  pageDesc: string;
}

export interface Category {
  id: string;
  title: string;
  icon: IconType;
  href: string;
  color: string;
  /** <title> tag for the category index page */
  pageTitle: string;
  /** Meta description for the category index page */
  pageDesc: string;
  /** h1 on the category index page */
  heading: string;
  /** Subheading paragraph on the category index page */
  subheading: string;
  /** Optional callout shown below the subheading */
  note?: string;
  tools: Tool[];
}

export const categories: Category[] = [
  {
    id: 'pdf',
    title: 'PDF Tools',
    icon: FcDocument,
    href: '/pdf',
    color: 'red',
    pageTitle: 'PDF Tools — Free Online PDF Editor | LocalKit',
    pageDesc: 'Free PDF tools that work in your browser. Merge, split, compress, rotate, and convert PDFs — no uploads required.',
    heading: 'PDF Tools',
    subheading: 'All PDF tools run locally in your browser. No uploads, no servers — your files stay private.',
    tools: [
      {
        name: 'Merge PDFs', href: '/pdf/merge', icon: FcLink,
        desc: 'Combine multiple PDFs into one',
        pageTitle: 'Merge PDFs Online — Free, No Upload | LocalKit',
        pageDesc: 'Combine multiple PDF files into one. Drag, drop, reorder and merge — 100% in your browser.',
      },
      {
        name: 'Split PDF', href: '/pdf/split', icon: FcRules,
        desc: 'Extract pages or split into parts',
        pageTitle: 'Split PDF Online — Free, No Upload | LocalKit',
        pageDesc: 'Split a PDF into individual pages or custom page ranges. Runs entirely in your browser.',
      },
      {
        name: 'Compress PDF', href: '/pdf/compress', icon: FcPackage,
        desc: 'Reduce PDF file size',
        pageTitle: 'Compress PDF Online — Reduce PDF Size | LocalKit',
        pageDesc: 'Reduce PDF file size without quality loss. Uses pdf-lib to optimize object streams in your browser.',
      },
      {
        name: 'Rotate PDF', href: '/pdf/rotate', icon: FcSynchronize,
        desc: 'Rotate pages in a PDF',
        pageTitle: 'Rotate PDF Pages Online | LocalKit',
        pageDesc: 'Rotate all or specific pages in a PDF. Choose 90°, 180°, or 270° rotation. 100% browser-based.',
      },
      {
        name: 'Reorder Pages', href: '/pdf/reorder', icon: FcTreeStructure,
        desc: 'Drag pages into any order',
        pageTitle: 'Reorder PDF Pages — Free, No Upload | LocalKit',
        pageDesc: 'Drag and drop pages to rearrange them in any order. Save your reordered PDF instantly — 100% in your browser.',
      },
      {
        name: 'Delete Pages', href: '/pdf/delete-pages', icon: FcDeleteDatabase,
        desc: 'Remove specific pages from a PDF',
        pageTitle: 'Delete PDF Pages — Free, No Upload | LocalKit',
        pageDesc: 'Select and remove specific pages from a PDF. Preview thumbnails, click to mark, save instantly — 100% in your browser.',
      },
      {
        name: 'Add Watermark', href: '/pdf/watermark', icon: FcLock,
        desc: 'Stamp text on every page',
        pageTitle: 'Add Watermark to PDF — Free, No Upload | LocalKit',
        pageDesc: 'Stamp text watermarks on every page of your PDF. Choose text, opacity, color and angle — 100% in your browser.',
      },
      {
        name: 'Unlock PDF', href: '/pdf/unlock', icon: FcUnlock,
        desc: 'Remove password protection',
        pageTitle: 'Unlock PDF — Remove Password Protection | LocalKit',
        pageDesc: 'Remove the password from a protected PDF. Enter the password once and download the unlocked file — 100% in your browser.',
      },
      {
        name: 'Extract Images', href: '/pdf/extract-images', icon: FcGallery,
        desc: 'Pull embedded images out',
        pageTitle: 'Extract Images from PDF — Free, No Upload | LocalKit',
        pageDesc: 'Pull out all embedded images from any PDF file. Download individually or as a ZIP — 100% in your browser.',
      },
      {
        name: 'PDF to Images', href: '/pdf/to-images', icon: FcCamera,
        desc: 'Export each page as PNG',
        pageTitle: 'PDF to Images — Export PDF Pages as PNG | LocalKit',
        pageDesc: 'Convert each page of a PDF to a high-quality PNG image. Powered by PDF.js, runs in your browser.',
      },
      {
        name: 'Images to PDF', href: '/pdf/from-images', icon: FcCamera,
        desc: 'Create PDF from images',
        pageTitle: 'Images to PDF — Create PDF from Photos | LocalKit',
        pageDesc: 'Combine JPG, PNG images into a single PDF document. All processing in your browser.',
      },
      {
        name: 'Fill Form', href: '/pdf/fill-form', icon: FcEditImage,
        desc: 'Fill PDF form fields and download',
        pageTitle: 'Fill PDF Form Online — Free, No Upload | LocalKit',
        pageDesc: 'Fill interactive PDF form fields (text, checkboxes, dropdowns) and download the completed PDF — 100% in your browser.',
      },
      {
        name: 'Edit Metadata', href: '/pdf/edit-metadata', icon: FcInspection,
        desc: 'Edit title, author, keywords and more',
        pageTitle: 'Edit PDF Metadata — Title, Author, Keywords | LocalKit',
        pageDesc: 'View and edit PDF metadata: title, author, subject, keywords, creator, producer and dates — 100% in your browser.',
      },
      {
        name: 'Annotate PDF', href: '/pdf/annotate', icon: FcEditImage,
        desc: 'Draw, add images and text on PDF pages',
        pageTitle: 'Annotate PDF — Draw & Add Images | LocalKit',
        pageDesc: 'Draw on PDF pages, insert images and add text overlays — freehand annotation tool, 100% in your browser.',
      },
      {
        name: 'Sign PDF', href: '/pdf/sign', icon: FcInspection,
        desc: 'Place your signature on any PDF page',
        pageTitle: 'Sign PDF — Free, No Upload | LocalKit',
        pageDesc: 'Draw, type or upload your signature and place it on any PDF page. 100% private, runs in your browser.',
      },
      {
        name: 'Word → PDF', href: '/pdf/word-to-pdf', icon: FcDocument,
        desc: 'Convert .docx Word files to PDF',
        pageTitle: 'Word to PDF — Free, No Upload | LocalKit',
        pageDesc: 'Convert Microsoft Word .docx files to PDF entirely in your browser. No uploads, no servers.',
      },
    ],
  },
  {
    id: 'image',
    title: 'Image Tools',
    icon: FcPicture,
    href: '/image',
    color: 'blue',
    pageTitle: 'Image Tools — Free Online Image Editor | LocalKit',
    pageDesc: 'Free online image tools. Compress, resize, and convert images in your browser — no uploads.',
    heading: 'Image Tools',
    subheading: 'Compress, resize, and convert images using the Canvas API — entirely in your browser.',
    tools: [
      {
        name: 'Compress Image', href: '/image/compress', icon: FcPackage,
        desc: 'Reduce image file size',
        pageTitle: 'Compress Images Online — Free, No Upload | LocalKit',
        pageDesc: 'Compress JPEG, PNG, and WebP images without quality loss. Runs 100% in your browser.',
      },
      {
        name: 'Resize Image', href: '/image/resize', icon: FcRuler,
        desc: 'Change image dimensions',
        pageTitle: 'Resize Images Online — Free, No Upload | LocalKit',
        pageDesc: 'Resize images to exact dimensions, fit, or fill. Batch resize multiple images in your browser.',
      },
      {
        name: 'Convert Format', href: '/image/convert', icon: FcSynchronize,
        desc: 'Convert between JPG, PNG, WebP, AVIF',
        pageTitle: 'Convert Image Format — JPG, PNG, WebP, AVIF | LocalKit',
        pageDesc: 'Convert images between JPEG, PNG, WebP, and AVIF formats. Fast, free, and private.',
      },
      {
        name: 'Crop / Rotate / Flip', href: '/image/crop-rotate-flip', icon: FcRules,
        desc: 'Crop, rotate and flip images',
        pageTitle: 'Crop, Rotate & Flip Images — Free, No Upload | LocalKit',
        pageDesc: 'Crop, rotate and flip any image in your browser. No uploads, no servers — instant download.',
      },
      {
        name: 'Background Remover', href: '/image/background-remover', icon: FcFlashOn,
        desc: 'Remove background with AI',
        pageTitle: 'Remove Image Background — Free, No Upload | LocalKit',
        pageDesc: 'Remove the background from any photo using AI — runs entirely in your browser. No uploads, no servers.',
      },
      {
        name: 'Remove Metadata', href: '/image/remove-metadata', icon: FcPrivacy,
        desc: 'Strip EXIF, GPS and all hidden metadata',
        pageTitle: 'Remove Image Metadata — Strip EXIF & GPS | LocalKit',
        pageDesc: 'Strip all EXIF data, GPS coordinates and hidden metadata from images. Runs 100% in your browser — nothing uploaded.',
      },
      {
        name: 'Edit Metadata', href: '/image/edit-metadata', icon: FcGlobe,
        desc: 'Add GPS, author, copyright to JPEG',
        pageTitle: 'Edit Image Metadata — Add GPS & EXIF | LocalKit',
        pageDesc: 'Embed GPS coordinates, author, copyright and date into JPEG images. All processing in your browser.',
      },
      {
        name: 'Dither Image', href: '/image/dither', icon: FcInspection,
        desc: 'Convert images with dithering algorithms',
        pageTitle: 'Image Dithering — Floyd-Steinberg, Atkinson, Bayer | LocalKit',
        pageDesc: 'Apply dithering algorithms to images: Floyd-Steinberg, Atkinson, Bayer ordered, and more. Runs 100% in your browser.',
      },
      {
        name: 'Passport Photo', href: '/image/passport-photo', icon: FcPortraitMode,
        desc: 'Crop any photo to passport size with face guide',
        pageTitle: 'Passport Photo Maker — Free, No Upload | LocalKit',
        pageDesc: 'Crop any photo to the correct passport size for 6 countries (ICAO, US, India, UK, Canada, China). Choose DPI, optional background removal — 100% in your browser.',
      },
      {
        name: 'Image Watermark', href: '/image/watermark', icon: FcEditImage,
        desc: 'Add text or image overlay to photos',
        pageTitle: 'Add Watermark to Images — Free, No Upload | LocalKit',
        pageDesc: 'Add text or image watermarks to your photos. Control position, opacity and style — 100% in your browser.',
      },
    ],
  },
  {
    id: 'video',
    title: 'Video Tools',
    icon: FcVideoFile,
    href: '/video',
    color: 'purple',
    pageTitle: 'Video Tools — Free Online Video Editor | LocalKit',
    pageDesc: 'Free video tools powered by FFmpeg WASM. Compress, convert, trim, and extract audio — 100% in your browser.',
    heading: 'Video Tools',
    subheading: 'Powered by FFmpeg WASM — the full FFmpeg encoder running in your browser. No server, no uploads.',
    note: '⚠️ First load downloads ~30MB FFmpeg WASM core',
    tools: [
      {
        name: 'Compress Video', href: '/video/compress', icon: FcPackage,
        desc: 'Reduce video file size with H.264',
        pageTitle: 'Compress Video Online — FFmpeg WASM | LocalKit',
        pageDesc: 'Compress MP4 and other video files using FFmpeg H.264 encoding. Runs in your browser — no upload.',
      },
      {
        name: 'Convert Video', href: '/video/convert', icon: FcSynchronize,
        desc: 'MP4, WebM, AVI, MOV, GIF',
        pageTitle: 'Convert Video Format Online — MP4, WebM, GIF | LocalKit',
        pageDesc: 'Convert videos between MP4, WebM, AVI, MOV, and GIF. Powered by FFmpeg WASM in your browser.',
      },
      {
        name: 'Trim Video', href: '/video/trim', icon: FcRules,
        desc: 'Cut start/end of a video',
        pageTitle: 'Trim Video Online — Cut Start & End | LocalKit',
        pageDesc: 'Trim a video by setting start and end points. Uses FFmpeg WASM for lossless stream copy.',
      },
      {
        name: 'Extract Audio', href: '/video/extract-audio', icon: FcAudioFile,
        desc: 'Save audio as MP3, AAC, WAV',
        pageTitle: 'Extract Audio from Video — MP3, AAC, WAV | LocalKit',
        pageDesc: 'Extract the audio track from any video file as MP3, AAC, WAV or OGG. Powered by FFmpeg WASM.',
      },
      {
        name: 'Video → GIF', href: '/video/to-gif', icon: FcFilm,
        desc: 'Convert a video clip to an animated GIF',
        pageTitle: 'Convert Video to GIF — Free, No Upload | LocalKit',
        pageDesc: 'Convert any video clip to an animated GIF. Control FPS and size — powered by FFmpeg WASM.',
      },
      {
        name: 'Remove Audio', href: '/video/remove-audio', icon: FcSpeaker,
        desc: 'Strip audio track from a video',
        pageTitle: 'Remove Audio from Video — Mute Video | LocalKit',
        pageDesc: 'Remove the audio track from any video file. Produces a silent video — powered by FFmpeg WASM.',
      },
    ],
  },
  {
    id: 'audio',
    title: 'Audio Tools',
    icon: FcMusic,
    href: '/audio',
    color: 'green',
    pageTitle: 'Audio Tools — Free Online Audio Editor | LocalKit',
    pageDesc: 'Free audio tools powered by FFmpeg WASM. Convert, trim, and compress audio files — 100% in your browser.',
    heading: 'Audio Tools',
    subheading: 'Powered by FFmpeg WASM — convert, trim and compress audio files entirely in your browser. No uploads, no servers.',
    note: '⚠️ First load downloads ~30MB FFmpeg WASM core',
    tools: [
      {
        name: 'Convert Audio', href: '/audio/convert', icon: FcSynchronize,
        desc: 'Convert between MP3, AAC, WAV, OGG, FLAC',
        pageTitle: 'Convert Audio Format — MP3, AAC, WAV, OGG, FLAC | LocalKit',
        pageDesc: 'Convert audio files between MP3, AAC, WAV, OGG, and FLAC formats. Powered by FFmpeg WASM in your browser.',
      },
      {
        name: 'Trim Audio', href: '/audio/trim', icon: FcRules,
        desc: 'Cut start/end of an audio file',
        pageTitle: 'Trim Audio Online — Cut Start & End | LocalKit',
        pageDesc: 'Trim an audio file by setting start and end points. Uses FFmpeg WASM for lossless stream copy.',
      },
      {
        name: 'Compress Audio', href: '/audio/compress', icon: FcPackage,
        desc: 'Reduce audio file size with bitrate control',
        pageTitle: 'Compress Audio Online — Reduce File Size | LocalKit',
        pageDesc: 'Compress audio files by adjusting bitrate. Powered by FFmpeg WASM — runs entirely in your browser.',
      },
      {
        name: 'Merge Audio', href: '/audio/merge', icon: FcLink,
        desc: 'Concatenate multiple audio files',
        pageTitle: 'Merge Audio Files — Free, No Upload | LocalKit',
        pageDesc: 'Concatenate multiple audio files into one. Reorder tracks — powered by FFmpeg WASM.',
      },
    ],
  },
  {
    id: 'ocr',
    title: 'OCR Tools',
    icon: FcReading,
    href: '/ocr',
    color: 'yellow',
    pageTitle: 'OCR Tools — Extract Text from Images & PDFs | LocalKit',
    pageDesc: 'Extract text from images and PDFs using Tesseract OCR — 12+ languages, 100% in your browser.',
    heading: 'OCR Tools',
    subheading: 'Extract text from images and PDFs using Tesseract OCR — runs entirely in your browser, no uploads.',
    note: '⚠️ First use downloads the language model (~10 MB). Cached after that.',
    tools: [
      {
        name: 'Extract Text', href: '/ocr/extract', icon: FcReading,
        desc: 'Extract text from images or PDFs',
        pageTitle: 'OCR — Extract Text from Images & PDFs | LocalKit',
        pageDesc: 'Extract text from any image or PDF using Tesseract OCR. Supports 12+ languages — runs 100% in your browser.',
      },
    ],
  },
  {
    id: 'dev',
    title: 'Developer Tools',
    icon: FcSettings,
    href: '/dev',
    color: 'green',
    pageTitle: 'Developer Tools — LocalKit',
    pageDesc: 'Browser-based developer utilities. CSS converters, formatters, and more — no uploads, completely private.',
    heading: 'Developer Tools',
    subheading: 'Handy dev utilities that run entirely in your browser — no installs, no uploads.',
    tools: [
      {
        name: 'CSS → Tailwind', href: '/dev/css-to-tailwind', icon: FcTemplate,
        desc: 'Convert CSS properties to Tailwind utility classes',
        pageTitle: 'CSS to Tailwind Converter — LocalKit',
        pageDesc: 'Paste any CSS and instantly get the equivalent Tailwind utility classes. Supports prefix config.',
      },
      {
        name: 'QR Code Generator', href: '/dev/qr-code', icon: FcPortraitMode,
        desc: 'Generate QR codes for text or URLs',
        pageTitle: 'QR Code Generator — Free, No Upload | LocalKit',
        pageDesc: 'Generate QR codes for any text or URL. Choose size, colors and error correction — 100% in your browser.',
      },
      {
        name: 'Base64 → Image', href: '/dev/base64-image', icon: FcPicture,
        desc: 'Decode a base64 string or data URL and preview the image',
        pageTitle: 'Base64 to Image Decoder — LocalKit',
        pageDesc: 'Paste a base64 string or data URL and instantly preview the decoded image. Download or copy — 100% in your browser.',
      },
      {
        name: 'JSON Formatter', href: '/dev/json-formatter', icon: FcDataSheet,
        desc: 'Format, validate and minify JSON',
        pageTitle: 'JSON Formatter & Validator — LocalKit',
        pageDesc: 'Format, validate, and minify JSON in your browser. Syntax highlighting, error detection — no uploads.',
      },
      {
        name: 'Hash Generator', href: '/dev/hash-generator', icon: FcKey,
        desc: 'Generate SHA-256, SHA-512, MD5 hashes',
        pageTitle: 'Hash Generator — SHA-256, SHA-512 | LocalKit',
        pageDesc: 'Generate cryptographic hashes (SHA-256, SHA-512) from text or files. Uses the native Web Crypto API.',
      },
      {
        name: 'URL Encoder', href: '/dev/url-encoder', icon: FcLink,
        desc: 'Encode and decode URLs and query strings',
        pageTitle: 'URL Encoder / Decoder — LocalKit',
        pageDesc: 'Encode and decode URLs and query string components. Supports percent-encoding and form encoding.',
      },
      {
        name: 'JWT Decoder', href: '/dev/jwt-decoder', icon: FcBinoculars,
        desc: 'Decode and inspect JWT tokens',
        pageTitle: 'JWT Decoder — Inspect JSON Web Tokens | LocalKit',
        pageDesc: 'Decode JWT tokens and inspect header, payload and signature. Works entirely in your browser — tokens never leave your device.',
      },
      {
        name: 'Color Converter', href: '/dev/color-converter', icon: FcMultipleInputs,
        desc: 'Convert between HEX, RGB, HSL, and OKLCH',
        pageTitle: 'Color Converter — HEX RGB HSL | LocalKit',
        pageDesc: 'Convert colors between HEX, RGB, HSL, and OKLCH formats instantly in your browser.',
      },
      {
        name: 'Markdown Preview', href: '/dev/markdown-preview', icon: FcReading,
        desc: 'Preview Markdown — paste, upload, or fetch a URL',
        pageTitle: 'Markdown Preview — LocalKit',
        pageDesc: 'Preview Markdown files in your browser. Paste text, upload a .md file, or fetch from a URL. No uploads.',
      },
      {
        name: 'Epoch Converter', href: '/dev/epoch-converter', icon: FcClock,
        desc: 'Convert Unix timestamps to dates and back',
        pageTitle: 'Epoch / Unix Timestamp Converter — LocalKit',
        pageDesc: 'Convert Unix epoch timestamps to human-readable dates (UTC, local, any timezone) and back. Auto-detects seconds, ms, µs, ns. 100% in your browser.',
      },
    ],
  },
  {
    id: 'archive',
    title: 'Archive Tools',
    icon: FcOpenedFolder,
    href: '/archive',
    color: 'yellow',
    pageTitle: 'Archive Tools — ZIP Files | LocalKit',
    pageDesc: 'Create and extract ZIP archives entirely in your browser. No uploads, no servers.',
    heading: 'Archive Tools',
    subheading: 'Create, inspect and extract ZIP archives — all processed locally in your browser.',
    tools: [
      {
        name: 'Create ZIP', href: '/archive/create', icon: FcPackage,
        desc: 'Compress files into a ZIP archive',
        pageTitle: 'Create ZIP Archive — Free, No Upload | LocalKit',
        pageDesc: 'Select multiple files and compress them into a ZIP archive. 100% in your browser using JSZip.',
      },
      {
        name: 'Extract ZIP', href: '/archive/extract', icon: FcFile,
        desc: 'Extract files from a ZIP archive',
        pageTitle: 'Extract ZIP Archive — Free, No Upload | LocalKit',
        pageDesc: 'Extract files from any ZIP archive and download them individually or all at once.',
      },
    ],
  },
];

/** Flat list of every tool with its parent category attached */
export const allTools: (Tool & { categoryId: string; categoryTitle: string; categoryHref: string })[] =
  categories.flatMap(cat =>
    cat.tools.map(tool => ({ ...tool, categoryId: cat.id, categoryTitle: cat.title, categoryHref: cat.href }))
  );

/** Returns all props needed by ToolLayout for the given tool href */
export function getToolMeta(href: string) {
  const tool = allTools.find(t => t.href === href);
  if (!tool) throw new Error(`No tool found for href: ${href}`);
  return {
    title: tool.pageTitle,
    description: tool.pageDesc,
    canonicalURL: tool.href,
    category: tool.categoryTitle,
    categoryHref: tool.categoryHref,
    toolName: tool.name,
    icon: tool.icon,
  };
}
