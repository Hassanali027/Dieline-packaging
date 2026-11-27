import type { BoxParams, BoxStyle, DielineResult } from '../../types/design';
import { toMm } from './geometry';
import { generateMailer } from './styles/mailer';
import { generateBurger, generateSleeve, generateTray } from './styles/trays';
import { generateReverseTuck, generateStraightTuck } from './styles/tuck';

export * from './geometry';
export { BLEED_MM, buildDielineResult, SAFE_MM } from './result';

type Generator = (params: BoxParams) => DielineResult;

/** Styles the engine can generate today. The rest land in Sprint 1–3 (see the implementation plan). */
const GENERATORS: Partial<Record<BoxStyle, Generator>> = {
    mailer: generateMailer,
    'reverse-tuck': generateReverseTuck,
    'straight-tuck': generateStraightTuck,
    burger: generateBurger,
    tray: generateTray,
    sleeve: generateSleeve,
};

export const SUPPORTED_STYLES = Object.keys(GENERATORS) as BoxStyle[];

export function isStyleSupported(style: BoxStyle): boolean {
    return style in GENERATORS;
}

export class UnsupportedStyleError extends Error {
    constructor(public readonly style: BoxStyle) {
        super(`Dieline style "${style}" is not supported yet.`);
        this.name = 'UnsupportedStyleError';
    }
}

export class InvalidParamsError extends Error {
    constructor(public readonly errors: string[]) {
        super(`Invalid box parameters: ${errors.join('; ')}`);
        this.name = 'InvalidParamsError';
    }
}

/** Limits in mm. Admin-editable limits per product can replace these later. */
export const LIMITS = {
    dimension: { min: 20, max: 1200 },
    thickness: { min: 0.2, max: 10 },
} as const;

/** Returns a list of human-readable problems; an empty list means the params are usable. */
export function validateParams(params: BoxParams): string[] {
    const errors: string[] = [];
    const dims: [keyof Pick<BoxParams, 'length' | 'width' | 'depth'>, string][] = [
        ['length', 'Length'],
        ['width', 'Width'],
        ['depth', 'Depth'],
    ];
    for (const [key, label] of dims) {
        const value = params[key];
        if (!Number.isFinite(value)) {
            errors.push(`${label} must be a number.`);
            continue;
        }
        const mm = toMm(value, params.unit);
        if (mm < LIMITS.dimension.min || mm > LIMITS.dimension.max) {
            errors.push(`${label} must be between ${LIMITS.dimension.min} and ${LIMITS.dimension.max} mm.`);
        }
    }
    const t = toMm(params.thickness, params.unit);
    if (!Number.isFinite(t) || t < LIMITS.thickness.min || t > LIMITS.thickness.max) {
        errors.push(`Thickness must be between ${LIMITS.thickness.min} and ${LIMITS.thickness.max} mm.`);
    } else if (errors.length === 0 && t * 4 >= Math.min(toMm(params.width, params.unit), toMm(params.depth, params.unit))) {
        errors.push('Board is too thick for this box size.');
    }
    return errors;
}

/**
 * The single entry point used by the 2D editor, the 3D builder and the exporters.
 * Output coordinates are always millimetres with the cut outline starting at (0, 0);
 * the bleed outline extends into negative coordinates by BLEED_MM.
 */
export function generateDieline(params: BoxParams): DielineResult {
    const generator = GENERATORS[params.style];
    if (!generator) {
        throw new UnsupportedStyleError(params.style);
    }
    const errors = validateParams(params);
    if (errors.length) {
        throw new InvalidParamsError(errors);
    }
    return generator(params);
}
