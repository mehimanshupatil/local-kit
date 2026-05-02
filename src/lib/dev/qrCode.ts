import QRCode from 'qrcode';

export type ErrorCorrectionLevel = 'L' | 'M' | 'Q' | 'H';
export type QROutputFormat = 'png' | 'svg';

export interface QROptions {
  errorCorrection: ErrorCorrectionLevel;
  size: number;          // canvas pixel size
  margin: number;        // quiet zone modules (0-10)
  darkColor: string;     // hex e.g. '#000000'
  lightColor: string;    // hex e.g. '#ffffff'
}

export async function generateQRDataURL(
  text: string,
  opts: QROptions
): Promise<string> {
  return QRCode.toDataURL(text, {
    errorCorrectionLevel: opts.errorCorrection,
    width: opts.size,
    margin: opts.margin,
    color: { dark: opts.darkColor, light: opts.lightColor },
  });
}

export async function generateQRSVG(text: string, opts: QROptions): Promise<string> {
  return QRCode.toString(text, {
    type: 'svg',
    errorCorrectionLevel: opts.errorCorrection,
    width: opts.size,
    margin: opts.margin,
    color: { dark: opts.darkColor, light: opts.lightColor },
  });
}
