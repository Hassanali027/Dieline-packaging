import JsBarcode from 'jsbarcode';
import QRCode from 'qrcode';

export type BarcodeFormat = 'CODE128' | 'EAN13' | 'EAN8' | 'UPC' | 'CODE39' | 'ITF14' | 'MSI' | 'pharmacode' | 'codabar';
export type QrErrorCorrection = 'L' | 'M' | 'Q' | 'H';

export type BarcodeFormatInfo = {
    id: BarcodeFormat;
    label: string;
    placeholder: string;
    hint: string;
};

export const BARCODE_FORMATS: BarcodeFormatInfo[] = [
    { id: 'CODE128', label: 'CODE 128', placeholder: 'PKG-2026-001', hint: 'Any ASCII text or numbers' },
    { id: 'EAN13', label: 'EAN-13', placeholder: '5901234123457', hint: '12 or 13 digits (GS1 check digit validated)' },
    { id: 'EAN8', label: 'EAN-8', placeholder: '96385074', hint: '7 or 8 digits (GS1 check digit validated)' },
    { id: 'UPC', label: 'UPC-A', placeholder: '036000291452', hint: '11 or 12 digits (GS1 check digit validated)' },
    { id: 'CODE39', label: 'CODE 39', placeholder: 'BOX-1234', hint: 'A-Z, 0-9, space, and - . $ / + %' },
    { id: 'ITF14', label: 'ITF-14', placeholder: '10012345678902', hint: '13 or 14 digits (GS1 check digit validated)' },
    { id: 'MSI', label: 'MSI', placeholder: '12345678', hint: 'Digits only (0-9)' },
    { id: 'pharmacode', label: 'Pharmacode', placeholder: '1234', hint: 'Integer between 3 and 131070' },
    { id: 'codabar', label: 'Codabar', placeholder: 'A123456A', hint: '0-9 and - $ : / . + (optional A-D start/stop)' },
];

/** Standard GS1 Modulo-10 check digit calculation (works for EAN-13, EAN-8, UPC-A, ITF-14). */
export function gs1CheckDigit(digitsWithoutCheck: string): number {
    let sum = 0;
    for (let i = 0; i < digitsWithoutCheck.length; i++) {
        const posFromRight = digitsWithoutCheck.length - i;
        const weight = posFromRight % 2 === 1 ? 3 : 1;
        sum += Number(digitsWithoutCheck[i]) * weight;
    }
    return (10 - (sum % 10)) % 10;
}

export function validateQrInput(value: string): string | null {
    const trimmed = value.trim();
    if (!trimmed) return 'Please enter text or a URL for the QR code.';
    if (trimmed.length > 2953) return 'QR code content must be 2,953 characters or fewer.';
    return null;
}

export function validateBarcodeInput(format: BarcodeFormat, rawValue: string): string | null {
    const value = rawValue.trim();
    if (!value) return 'Please enter a value for the barcode.';

    switch (format) {
        case 'CODE128': {
            for (let i = 0; i < value.length; i++) {
                if (value.charCodeAt(i) > 127) {
                    return 'CODE 128 only supports standard ASCII characters (0–127).';
                }
            }
            return null;
        }
        case 'EAN13': {
            if (!/^\d{12,13}$/.test(value)) return 'EAN-13 must be 12 or 13 digits.';
            if (value.length === 13) {
                const expected = gs1CheckDigit(value.slice(0, 12));
                if (Number(value[12]) !== expected) {
                    return `Invalid EAN-13 check digit (expected ${expected}, got ${value[12]}).`;
                }
            }
            return null;
        }
        case 'EAN8': {
            if (!/^\d{7,8}$/.test(value)) return 'EAN-8 must be 7 or 8 digits.';
            if (value.length === 8) {
                const expected = gs1CheckDigit(value.slice(0, 7));
                if (Number(value[7]) !== expected) {
                    return `Invalid EAN-8 check digit (expected ${expected}, got ${value[7]}).`;
                }
            }
            return null;
        }
        case 'UPC': {
            if (!/^\d{11,12}$/.test(value)) return 'UPC-A must be 11 or 12 digits.';
            if (value.length === 12) {
                const expected = gs1CheckDigit(value.slice(0, 11));
                if (Number(value[11]) !== expected) {
                    return `Invalid UPC-A check digit (expected ${expected}, got ${value[11]}).`;
                }
            }
            return null;
        }
        case 'ITF14': {
            if (!/^\d{13,14}$/.test(value)) return 'ITF-14 must be 13 or 14 digits.';
            if (value.length === 14) {
                const expected = gs1CheckDigit(value.slice(0, 13));
                if (Number(value[13]) !== expected) {
                    return `Invalid ITF-14 check digit (expected ${expected}, got ${value[13]}).`;
                }
            }
            return null;
        }
        case 'CODE39': {
            if (!/^[0-9A-Z\-. $/+%]+$/.test(value)) {
                return 'CODE 39 only allows uppercase A–Z, 0–9, space, and - . $ / + %.';
            }
            return null;
        }
        case 'MSI': {
            if (!/^\d+$/.test(value)) return 'MSI only supports numeric digits (0–9).';
            return null;
        }
        case 'pharmacode': {
            if (!/^\d+$/.test(value)) return 'Pharmacode must be a whole number.';
            const n = Number(value);
            if (!Number.isInteger(n) || n < 3 || n > 131070) {
                return 'Pharmacode must be an integer between 3 and 131070.';
            }
            return null;
        }
        case 'codabar': {
            if (!/^[A-Da-d]?[0-9\-$:/.+]+[A-Da-d]?$/.test(value)) {
                return 'Codabar only allows 0–9, - $ : / . +, with optional A–D start/stop characters.';
            }
            return null;
        }
    }
}

export async function generateQrDataUrl(value: string, opts?: { color?: string; background?: string; ecc?: QrErrorCorrection }): Promise<string> {
    return QRCode.toDataURL(value.trim(), {
        errorCorrectionLevel: opts?.ecc ?? 'M',
        margin: 2,
        width: 512,
        color: {
            dark: opts?.color ?? '#0f172a',
            light: opts?.background ?? '#ffffff',
        },
    });
}

export function generateBarcodeDataUrl(
    format: BarcodeFormat,
    value: string,
    opts?: { lineColor?: string; background?: string; displayValue?: boolean },
): { src: string; width: number; height: number } {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    JsBarcode(svg, value.trim(), {
        format,
        lineColor: opts?.lineColor ?? '#0f172a',
        background: opts?.background ?? '#ffffff',
        displayValue: opts?.displayValue ?? true,
        width: 2,
        height: 80,
        margin: 10,
        fontSize: 14,
    });
    const w = Number(svg.getAttribute('width')?.replace(/[^\d.]/g, '')) || 240;
    const h = Number(svg.getAttribute('height')?.replace(/[^\d.]/g, '')) || 110;
    const xml = new XMLSerializer().serializeToString(svg);
    return {
        src: `data:image/svg+xml;charset=utf-8,${encodeURIComponent(xml)}`,
        width: w,
        height: h,
    };
}
