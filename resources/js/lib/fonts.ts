/**
 * Fonts for the 2D editor. System fonts need nothing; Google Fonts are loaded on demand from
 * fonts.googleapis.com (one stylesheet per family) and awaited before Fabric measures text,
 * otherwise text would be laid out with the fallback font.
 *
 * Printing note: the PDF export (Sprint 2) must embed these fonts (plan: pdf-lib + fontkit).
 */

export type FontInfo = { family: string; category: 'sans' | 'serif' | 'display' | 'script'; bold: boolean; google: boolean };

export const SYSTEM_FONTS: FontInfo[] = [
    { family: 'Arial', category: 'sans', bold: true, google: false },
    { family: 'Georgia', category: 'serif', bold: true, google: false },
    { family: 'Courier New', category: 'sans', bold: true, google: false },
    { family: 'Impact', category: 'display', bold: false, google: false },
];

/** 19 Google Fonts (the reference editor offers 19). `bold` = a real 700 weight exists. */
export const GOOGLE_FONTS: FontInfo[] = [
    { family: 'Roboto', category: 'sans', bold: true, google: true },
    { family: 'Open Sans', category: 'sans', bold: true, google: true },
    { family: 'Lato', category: 'sans', bold: true, google: true },
    { family: 'Montserrat', category: 'sans', bold: true, google: true },
    { family: 'Poppins', category: 'sans', bold: true, google: true },
    { family: 'Raleway', category: 'sans', bold: true, google: true },
    { family: 'Nunito', category: 'sans', bold: true, google: true },
    { family: 'Josefin Sans', category: 'sans', bold: true, google: true },
    { family: 'Oswald', category: 'display', bold: true, google: true },
    { family: 'Bebas Neue', category: 'display', bold: false, google: true },
    { family: 'Archivo Black', category: 'display', bold: false, google: true },
    { family: 'Righteous', category: 'display', bold: false, google: true },
    { family: 'Abril Fatface', category: 'display', bold: false, google: true },
    { family: 'Playfair Display', category: 'serif', bold: true, google: true },
    { family: 'Merriweather', category: 'serif', bold: true, google: true },
    { family: 'Lobster', category: 'script', bold: false, google: true },
    { family: 'Pacifico', category: 'script', bold: false, google: true },
    { family: 'Dancing Script', category: 'script', bold: true, google: true },
    { family: 'Caveat', category: 'script', bold: true, google: true },
];

export const ALL_FONTS: FontInfo[] = [...SYSTEM_FONTS, ...GOOGLE_FONTS];

const GOOGLE = new Map(GOOGLE_FONTS.map((f) => [f.family, f]));

export function isGoogleFont(family: string): boolean {
    return GOOGLE.has(family);
}

/** Stylesheet URL for one family (regular, plus bold when the family has it). */
export function googleFontUrl(family: string): string {
    const info = GOOGLE.get(family);
    const name = family.replace(/ /g, '+');
    const spec = info?.bold ? `${name}:wght@400;700` : name;
    return `https://fonts.googleapis.com/css2?family=${spec}&display=swap`;
}

const loading = new Map<string, Promise<void>>();

/** How long to wait for a font before giving up and using the fallback, ms. */
const FONT_TIMEOUT_MS = 4000;

/**
 * Makes sure a font can be drawn on a canvas. Resolves (never rejects) once it is ready,
 * or after a timeout, so a slow network never blocks the editor.
 */
export function ensureFont(family: string, weight: string | number = 400): Promise<void> {
    if (typeof document === 'undefined' || !isGoogleFont(family)) return Promise.resolve();
    const key = `${family}:${weight}`;
    const cached = loading.get(key);
    if (cached) return cached;

    const id = `gf-${family.replace(/\s+/g, '-').toLowerCase()}`;
    if (!document.getElementById(id)) {
        const link = document.createElement('link');
        link.id = id;
        link.rel = 'stylesheet';
        link.href = googleFontUrl(family);
        document.head.appendChild(link);
    }

    const w = weight === 'bold' ? 700 : weight === 'normal' ? 400 : weight;
    const promise = Promise.race([
        // The stylesheet has to arrive before document.fonts knows the face, so retry briefly.
        (async () => {
            for (let i = 0; i < 20; i++) {
                const faces = await document.fonts.load(`${w} 24px "${family}"`).catch(() => []);
                if (faces.length) return;
                await new Promise((r) => setTimeout(r, 150));
            }
        })(),
        new Promise<void>((r) => setTimeout(r, FONT_TIMEOUT_MS)),
    ]).then(() => undefined);
    loading.set(key, promise);
    return promise;
}

/* ------------------------------------------------------------------ */
/* Text presets                                                        */
/* ------------------------------------------------------------------ */

/** Ready-made packaging phrases ("quick text"). */
export const QUICK_TEXTS = [
    'Thank you!',
    'Handle with care',
    'Fragile',
    'This side up',
    'Open here',
    'Made with love',
    '100% recyclable',
    'Eco-friendly packaging',
];

/** Heading + subline pairs that look good together ("font combinations"). */
export const FONT_COMBOS: { heading: string; body: string; headingText: string; bodyText: string }[] = [
    { heading: 'Playfair Display', body: 'Lato', headingText: 'Artisan Goods', bodyText: 'Handmade with care since 2026' },
    { heading: 'Bebas Neue', body: 'Montserrat', headingText: 'BOLD BRAND', bodyText: 'Premium quality products' },
    { heading: 'Pacifico', body: 'Nunito', headingText: 'Sweet Treats', bodyText: 'Baked fresh every morning' },
    { heading: 'Oswald', body: 'Open Sans', headingText: 'URBAN WEAR', bodyText: 'Designed for the city' },
];
