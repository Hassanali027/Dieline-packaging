import type { BoxParams, BoxStyle, DielineResult } from '../../types/design';
import { toMm } from './geometry';
import { buildDielineResult } from './result';
import { generateRigidMagnetic } from './styles/magnetic';
import { generateMailer } from './styles/mailer';
import { generateRigidLidBase } from './styles/rigid';
import { generateBurger, generateSleeve, generateTray } from './styles/trays';
import { generateReverseTuck, generateStraightTuck } from './styles/tuck';

export * from './geometry';
export { BLEED_MM, buildDielineResult, SAFE_MM } from './result';
export { magneticSizes, type MagneticSizes } from './styles/magnetic';
export { rigidSizes, WRAP_MM, type RigidSizes } from './styles/rigid';

type Generator = (params: BoxParams) => DielineResult;

/** Styles the engine can generate today. The rest land in Sprint 1–3 (see the implementation plan). */
const GENERATORS: Partial<Record<BoxStyle, Generator>> = {
    mailer: generateMailer,
    'reverse-tuck': generateReverseTuck,
    'straight-tuck': generateStraightTuck,
    burger: generateBurger,
    tray: generateTray,
    sleeve: generateSleeve,
    'rigid-lid-base': generateRigidLidBase,
    'rigid-magnetic': generateRigidMagnetic,
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
    if (params.construction === 'rigid' && params.rigid) {
        const r = params.rigid;
        const depth = toMm(params.depth, params.unit);
        if (r.turnIn !== undefined && (toMm(r.turnIn, params.unit) < 5 || toMm(r.turnIn, params.unit) >= depth)) {
            errors.push('Turn-in must be at least 5 mm and less than the depth.');
        }
        if (r.lidDepth !== undefined && toMm(r.lidDepth, params.unit) < 5) {
            errors.push('Lid depth must be at least 5 mm.');
        }
        if (r.boardThickness !== undefined && (r.boardThickness <= 0 || toMm(r.boardThickness, params.unit) > 6)) {
            errors.push('Chipboard must be thicker than 0 and at most 6 mm.');
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

/**
 * One part of a multi-part (rigid) result as its own dieline, starting at (0, 0).
 * The editor shows one part per tab and the 3D view textures each part separately.
 * Folding styles have no parts: the result is returned unchanged.
 */
export function extractPart(result: DielineResult, part: string | null): DielineResult {
    if (!part || !result.parts?.length) return result;
    const panels = result.panels.filter((p) => p.part === part);
    if (!panels.length) return result;
    return { ...buildDielineResult(panels), chipboard: result.chipboard?.filter((c) => c.part === part) };
}
