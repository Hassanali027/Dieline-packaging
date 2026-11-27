import type { Design } from '../../types/design';

/** Base board colours, shared by the 2D canvas (panel fill) and the 3D preview. */
export const MATERIAL_COLORS: Record<string, { label: string; outside: string; inside: string }> = {
    white: { label: 'White', outside: '#f8fafc', inside: '#eef1f4' },
    kraft: { label: 'Kraft', outside: '#c8a27a', inside: '#b98f63' },
    transparent: { label: 'Transparent', outside: '#e6f0f7', inside: '#e6f0f7' },
};

export const MATERIAL_OPTIONS = Object.entries(MATERIAL_COLORS).map(([value, m]) => ({ value, label: m.label }));

export function materialColor(material: Design['material'], side: 'outside' | 'inside'): string {
    const known = MATERIAL_COLORS[material];
    if (known) return known[side];
    // A custom material is stored as a CSS colour (e.g. "#ff8800").
    return material;
}
