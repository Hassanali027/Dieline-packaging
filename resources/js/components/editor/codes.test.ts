import { describe, expect, it } from 'vitest';
import { BARCODE_FORMATS, gs1CheckDigit, validateBarcodeInput, validateQrInput } from './codes';

describe('QR & Barcode validation', () => {
    it('supports all 9 barcode formats', () => {
        expect(BARCODE_FORMATS.map((f) => f.id)).toEqual(['CODE128', 'EAN13', 'EAN8', 'UPC', 'CODE39', 'ITF14', 'MSI', 'pharmacode', 'codabar']);
    });

    it('validates QR input', () => {
        expect(validateQrInput('')).not.toBeNull();
        expect(validateQrInput('   ')).not.toBeNull();
        expect(validateQrInput('https://example.com')).toBeNull();
    });

    it('validates EAN-13 length and GS1 check digit', () => {
        expect(gs1CheckDigit('590123412345')).toBe(7);
        expect(validateBarcodeInput('EAN13', '5901234123457')).toBeNull();
        expect(validateBarcodeInput('EAN13', '5901234123450')).toContain('check digit');
        expect(validateBarcodeInput('EAN13', '12345')).not.toBeNull();
    });

    it('validates EAN-8, UPC-A, and ITF-14 check digits', () => {
        expect(validateBarcodeInput('EAN8', '96385074')).toBeNull();
        expect(validateBarcodeInput('EAN8', '96385070')).toContain('check digit');
        expect(validateBarcodeInput('UPC', '036000291452')).toBeNull();
        expect(validateBarcodeInput('UPC', '036000291459')).toContain('check digit');
        expect(validateBarcodeInput('ITF14', '10012345678902')).toBeNull();
        expect(validateBarcodeInput('ITF14', '10012345678900')).toContain('check digit');
    });

    it('validates CODE39, MSI, pharmacode, codabar, and CODE128', () => {
        expect(validateBarcodeInput('CODE39', 'BOX-1234')).toBeNull();
        expect(validateBarcodeInput('CODE39', 'box-1234')).not.toBeNull();
        expect(validateBarcodeInput('MSI', '123456')).toBeNull();
        expect(validateBarcodeInput('MSI', '12A4')).not.toBeNull();
        expect(validateBarcodeInput('pharmacode', '1234')).toBeNull();
        expect(validateBarcodeInput('pharmacode', '2')).not.toBeNull();
        expect(validateBarcodeInput('pharmacode', '131071')).not.toBeNull();
        expect(validateBarcodeInput('codabar', 'A123456A')).toBeNull();
        expect(validateBarcodeInput('codabar', 'Z123')).not.toBeNull();
        expect(validateBarcodeInput('CODE128', 'PKG-2026-001')).toBeNull();
        expect(validateBarcodeInput('CODE128', 'PKG-€')).not.toBeNull();
    });
});
