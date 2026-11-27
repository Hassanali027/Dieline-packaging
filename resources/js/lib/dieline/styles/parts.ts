import type { BoxParams, Pt } from '../../../types/design';
import { add, distance, pt, scale, sub, toMm } from '../geometry';

/** Box params converted to mm. */
export function dims(params: BoxParams) {
    return {
        L: toMm(params.length, params.unit),
        W: toMm(params.width, params.unit),
        D: toMm(params.depth, params.unit),
        t: toMm(params.thickness, params.unit),
    };
}

export function clamp(value: number, min: number, max: number): number {
    return Math.min(max, Math.max(min, value));
}

/**
 * A flap hinged on segment a→b, sticking out by `height` towards `out` (a unit vector,
 * perpendicular to the hinge). The free edge is pulled in by `taperA` at the a end and
 * `taperB` at the b end, so neighbouring flaps only touch at the hinge corners.
 */
export function flap(a: Pt, b: Pt, out: Pt, height: number, taperA = 0, taperB = taperA): Pt[] {
    const u = scale(sub(b, a), 1 / distance(a, b));
    const n = scale(out, height);
    return [a, add(add(a, n), scale(u, taperA)), sub(add(b, n), scale(u, taperB)), b];
}

/** A flap whose two free corners are cut at 45° by `chamfer` (tuck flaps, lid lips). */
export function chamferFlap(a: Pt, b: Pt, out: Pt, height: number, chamfer: number): Pt[] {
    const u = scale(sub(b, a), 1 / distance(a, b));
    const c = Math.min(chamfer, height, distance(a, b) / 2);
    return [
        a,
        add(a, scale(out, height - c)),
        add(add(a, scale(out, height)), scale(u, c)),
        sub(add(b, scale(out, height)), scale(u, c)),
        add(b, scale(out, height - c)),
        b,
    ];
}

export const UP = pt(0, -1);
export const DOWN = pt(0, 1);
export const LEFT = pt(-1, 0);
export const RIGHT = pt(1, 0);

export const hinge = (a: Pt, b: Pt) => ({ a, b });
