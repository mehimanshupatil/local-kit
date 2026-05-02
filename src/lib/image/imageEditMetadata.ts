import piexif from 'piexifjs';

export interface GPSCoords {
  lat: number;
  lng: number;
}

export interface ImageMetadataInput {
  // EXIF fields
  description?: string;      // ImageDescription (0x010E)
  artist?: string;           // Artist (0x013B)
  copyright?: string;        // Copyright (0x8298)
  software?: string;         // Software (0x0131)
  dateTime?: string;         // DateTime (0x0132) format: "YYYY:MM:DD HH:MM:SS"
  // GPS
  gps?: GPSCoords;
}

function toDMSRational(deg: number): [[number, number], [number, number], [number, number]] {
  const d = Math.floor(Math.abs(deg));
  const mFloat = (Math.abs(deg) - d) * 60;
  const m = Math.floor(mFloat);
  const s = Math.round((mFloat - m) * 60 * 100);
  return [[d, 1], [m, 1], [s, 100]];
}

export async function embedMetadata(
  file: File,
  meta: ImageMetadataInput,
  onProgress?: (pct: number) => void
): Promise<Blob> {
  if (file.type !== 'image/jpeg' && !file.name.toLowerCase().endsWith('.jpg') && !file.name.toLowerCase().endsWith('.jpeg')) {
    throw new Error('Metadata embedding only supported for JPEG files.');
  }
  onProgress?.(10);
  const buf = await file.arrayBuffer();
  const b64 = btoa(String.fromCharCode(...new Uint8Array(buf)));
  const dataUrl = `data:image/jpeg;base64,${b64}`;

  onProgress?.(30);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let exifObj: any = { '0th': {}, 'Exif': {}, 'GPS': {}, '1st': {} };
  try { exifObj = piexif.load(dataUrl); } catch {}

  if (meta.description) exifObj['0th'][piexif.ImageIFD.ImageDescription] = meta.description;
  if (meta.artist)      exifObj['0th'][piexif.ImageIFD.Artist] = meta.artist;
  if (meta.copyright)   exifObj['0th'][piexif.ImageIFD.Copyright] = meta.copyright;
  if (meta.software)    exifObj['0th'][piexif.ImageIFD.Software] = meta.software;
  if (meta.dateTime)    exifObj['0th'][piexif.ImageIFD.DateTime] = meta.dateTime;

  if (meta.gps) {
    const { lat, lng } = meta.gps;
    exifObj['GPS'][piexif.GPSIFD.GPSLatitudeRef]  = lat >= 0 ? 'N' : 'S';
    exifObj['GPS'][piexif.GPSIFD.GPSLatitude]     = toDMSRational(lat);
    exifObj['GPS'][piexif.GPSIFD.GPSLongitudeRef] = lng >= 0 ? 'E' : 'W';
    exifObj['GPS'][piexif.GPSIFD.GPSLongitude]    = toDMSRational(lng);
  }

  onProgress?.(60);
  const exifBytes = piexif.dump(exifObj);
  const newDataUrl = piexif.insert(exifBytes, dataUrl);

  onProgress?.(85);
  const newB64 = newDataUrl.split(',')[1];
  const binary = atob(newB64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  onProgress?.(100);
  return new Blob([bytes], { type: 'image/jpeg' });
}
