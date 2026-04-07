export interface Tool {
  name: string;
  href: string;
  icon: string;
  desc: string;
  /** <title> tag for the tool page */
  pageTitle: string;
  /** Meta description for the tool page */
  pageDesc: string;
}

export interface Category {
  id: string;
  title: string;
  icon: string;
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
    icon: '📄',
    href: '/pdf',
    color: 'red',
    pageTitle: 'PDF Tools — Free Online PDF Editor | LocalKit',
    pageDesc: 'Free PDF tools that work in your browser. Merge, split, compress, rotate, and convert PDFs — no uploads required.',
    heading: 'PDF Tools',
    subheading: 'All PDF tools run locally in your browser. No uploads, no servers — your files stay private.',
    tools: [
      {
        name: 'Merge PDFs', href: '/pdf/merge', icon: '🔗',
        desc: 'Combine multiple PDFs into one',
        pageTitle: 'Merge PDFs Online — Free, No Upload | LocalKit',
        pageDesc: 'Combine multiple PDF files into one. Drag, drop, reorder and merge — 100% in your browser.',
      },
      {
        name: 'Split PDF', href: '/pdf/split', icon: '✂️',
        desc: 'Extract pages or split into parts',
        pageTitle: 'Split PDF Online — Free, No Upload | LocalKit',
        pageDesc: 'Split a PDF into individual pages or custom page ranges. Runs entirely in your browser.',
      },
      {
        name: 'Compress PDF', href: '/pdf/compress', icon: '🗜️',
        desc: 'Reduce PDF file size',
        pageTitle: 'Compress PDF Online — Reduce PDF Size | LocalKit',
        pageDesc: 'Reduce PDF file size without quality loss. Uses pdf-lib to optimize object streams in your browser.',
      },
      {
        name: 'Rotate PDF', href: '/pdf/rotate', icon: '🔄',
        desc: 'Rotate pages in a PDF',
        pageTitle: 'Rotate PDF Pages Online | LocalKit',
        pageDesc: 'Rotate all or specific pages in a PDF. Choose 90°, 180°, or 270° rotation. 100% browser-based.',
      },
      {
        name: 'Reorder Pages', href: '/pdf/reorder', icon: '🔀',
        desc: 'Drag pages into any order',
        pageTitle: 'Reorder PDF Pages — Free, No Upload | LocalKit',
        pageDesc: 'Drag and drop pages to rearrange them in any order. Save your reordered PDF instantly — 100% in your browser.',
      },
      {
        name: 'Add Watermark', href: '/pdf/watermark', icon: '🔏',
        desc: 'Stamp text on every page',
        pageTitle: 'Add Watermark to PDF — Free, No Upload | LocalKit',
        pageDesc: 'Stamp text watermarks on every page of your PDF. Choose text, opacity, color and angle — 100% in your browser.',
      },
      {
        name: 'Unlock PDF', href: '/pdf/unlock', icon: '🔓',
        desc: 'Remove password protection',
        pageTitle: 'Unlock PDF — Remove Password Protection | LocalKit',
        pageDesc: 'Remove the password from a protected PDF. Enter the password once and download the unlocked file — 100% in your browser.',
      },
      {
        name: 'Extract Images', href: '/pdf/extract-images', icon: '🖼️',
        desc: 'Pull embedded images out',
        pageTitle: 'Extract Images from PDF — Free, No Upload | LocalKit',
        pageDesc: 'Pull out all embedded images from any PDF file. Download individually or as a ZIP — 100% in your browser.',
      },
      {
        name: 'PDF to Images', href: '/pdf/to-images', icon: '📷',
        desc: 'Export each page as PNG',
        pageTitle: 'PDF to Images — Export PDF Pages as PNG | LocalKit',
        pageDesc: 'Convert each page of a PDF to a high-quality PNG image. Powered by PDF.js, runs in your browser.',
      },
      {
        name: 'Images to PDF', href: '/pdf/from-images', icon: '📷',
        desc: 'Create PDF from images',
        pageTitle: 'Images to PDF — Create PDF from Photos | LocalKit',
        pageDesc: 'Combine JPG, PNG images into a single PDF document. All processing in your browser.',
      },
    ],
  },
  {
    id: 'image',
    title: 'Image Tools',
    icon: '🖼️',
    href: '/image',
    color: 'blue',
    pageTitle: 'Image Tools — Free Online Image Editor | LocalKit',
    pageDesc: 'Free online image tools. Compress, resize, and convert images in your browser — no uploads.',
    heading: 'Image Tools',
    subheading: 'Compress, resize, and convert images using the Canvas API — entirely in your browser.',
    tools: [
      {
        name: 'Compress Image', href: '/image/compress', icon: '🗜️',
        desc: 'Reduce image file size',
        pageTitle: 'Compress Images Online — Free, No Upload | LocalKit',
        pageDesc: 'Compress JPEG, PNG, and WebP images without quality loss. Runs 100% in your browser.',
      },
      {
        name: 'Resize Image', href: '/image/resize', icon: '📐',
        desc: 'Change image dimensions',
        pageTitle: 'Resize Images Online — Free, No Upload | LocalKit',
        pageDesc: 'Resize images to exact dimensions, fit, or fill. Batch resize multiple images in your browser.',
      },
      {
        name: 'Convert Format', href: '/image/convert', icon: '🔄',
        desc: 'Convert between JPG, PNG, WebP, AVIF',
        pageTitle: 'Convert Image Format — JPG, PNG, WebP, AVIF | LocalKit',
        pageDesc: 'Convert images between JPEG, PNG, WebP, and AVIF formats. Fast, free, and private.',
      },
      {
        name: 'Crop / Rotate / Flip', href: '/image/crop-rotate-flip', icon: '✂️',
        desc: 'Crop, rotate and flip images',
        pageTitle: 'Crop, Rotate & Flip Images — Free, No Upload | LocalKit',
        pageDesc: 'Crop, rotate and flip any image in your browser. No uploads, no servers — instant download.',
      },
      {
        name: 'Background Remover', href: '/image/background-remover', icon: '🪄',
        desc: 'Remove background with AI',
        pageTitle: 'Remove Image Background — Free, No Upload | LocalKit',
        pageDesc: 'Remove the background from any photo using AI — runs entirely in your browser. No uploads, no servers.',
      },
    ],
  },
  {
    id: 'video',
    title: 'Video Tools',
    icon: '🎬',
    href: '/video',
    color: 'purple',
    pageTitle: 'Video Tools — Free Online Video Editor | LocalKit',
    pageDesc: 'Free video tools powered by FFmpeg WASM. Compress, convert, trim, and extract audio — 100% in your browser.',
    heading: 'Video Tools',
    subheading: 'Powered by FFmpeg WASM — the full FFmpeg encoder running in your browser. No server, no uploads.',
    note: '⚠️ First load downloads ~30MB FFmpeg WASM core',
    tools: [
      {
        name: 'Compress Video', href: '/video/compress', icon: '🗜️',
        desc: 'Reduce video file size with H.264',
        pageTitle: 'Compress Video Online — FFmpeg WASM | LocalKit',
        pageDesc: 'Compress MP4 and other video files using FFmpeg H.264 encoding. Runs in your browser — no upload.',
      },
      {
        name: 'Convert Video', href: '/video/convert', icon: '🔄',
        desc: 'MP4, WebM, AVI, MOV, GIF',
        pageTitle: 'Convert Video Format Online — MP4, WebM, GIF | LocalKit',
        pageDesc: 'Convert videos between MP4, WebM, AVI, MOV, and GIF. Powered by FFmpeg WASM in your browser.',
      },
      {
        name: 'Trim Video', href: '/video/trim', icon: '✂️',
        desc: 'Cut start/end of a video',
        pageTitle: 'Trim Video Online — Cut Start & End | LocalKit',
        pageDesc: 'Trim a video by setting start and end points. Uses FFmpeg WASM for lossless stream copy.',
      },
      {
        name: 'Extract Audio', href: '/video/extract-audio', icon: '🎵',
        desc: 'Save audio as MP3, AAC, WAV',
        pageTitle: 'Extract Audio from Video — MP3, AAC, WAV | LocalKit',
        pageDesc: 'Extract the audio track from any video file as MP3, AAC, WAV or OGG. Powered by FFmpeg WASM.',
      },
    ],
  },
  {
    id: 'audio',
    title: 'Audio Tools',
    icon: '🎵',
    href: '/audio',
    color: 'green',
    pageTitle: 'Audio Tools — Free Online Audio Editor | LocalKit',
    pageDesc: 'Free audio tools powered by FFmpeg WASM. Convert, trim, and compress audio files — 100% in your browser.',
    heading: 'Audio Tools',
    subheading: 'Powered by FFmpeg WASM — convert, trim and compress audio files entirely in your browser. No uploads, no servers.',
    note: '⚠️ First load downloads ~30MB FFmpeg WASM core',
    tools: [
      {
        name: 'Convert Audio', href: '/audio/convert', icon: '🔄',
        desc: 'Convert between MP3, AAC, WAV, OGG, FLAC',
        pageTitle: 'Convert Audio Format — MP3, AAC, WAV, OGG, FLAC | LocalKit',
        pageDesc: 'Convert audio files between MP3, AAC, WAV, OGG, and FLAC formats. Powered by FFmpeg WASM in your browser.',
      },
      {
        name: 'Trim Audio', href: '/audio/trim', icon: '✂️',
        desc: 'Cut start/end of an audio file',
        pageTitle: 'Trim Audio Online — Cut Start & End | LocalKit',
        pageDesc: 'Trim an audio file by setting start and end points. Uses FFmpeg WASM for lossless stream copy.',
      },
      {
        name: 'Compress Audio', href: '/audio/compress', icon: '🗜️',
        desc: 'Reduce audio file size with bitrate control',
        pageTitle: 'Compress Audio Online — Reduce File Size | LocalKit',
        pageDesc: 'Compress audio files by adjusting bitrate. Powered by FFmpeg WASM — runs entirely in your browser.',
      },
    ],
  },
  {
    id: 'dev',
    title: 'Developer Tools',
    icon: '🛠️',
    href: '/dev',
    color: 'green',
    pageTitle: 'Developer Tools — LocalKit',
    pageDesc: 'Browser-based developer utilities. CSS converters, formatters, and more — no uploads, completely private.',
    heading: 'Developer Tools',
    subheading: 'Handy dev utilities that run entirely in your browser — no installs, no uploads.',
    tools: [
      {
        name: 'CSS → Tailwind', href: '/dev/css-to-tailwind', icon: '🎨',
        desc: 'Convert CSS properties to Tailwind utility classes',
        pageTitle: 'CSS to Tailwind Converter — LocalKit',
        pageDesc: 'Paste any CSS and instantly get the equivalent Tailwind utility classes. Supports prefix config.',
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
