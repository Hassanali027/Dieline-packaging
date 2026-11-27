import type { Pt } from '../../types/design';

/**
 * SVG geometry for uploaded dielines: path data and transforms turned into absolute polylines.
 *
 * Every SVG path command is supported: absolute and relative (M/m L/l H/h V/v C/c S/s Q/q
 * T/t A/a Z/z), implicit repeats ("M0 0 10 0 10 10"), packed numbers ("1.5.5", "-1-2") and
 * packed arc flags ("a5 5 0 0110 0"). Curves and arcs are flattened into short straight
 * segments: the dieline engine works with straight lines only (M/L/Z).
 */

export type Polyline = { pts: Pt[]; closed: boolean };

/** 2D affine matrix [a, b, c, d, e, f], as in SVG: x' = a·x + c·y + e, y' = b·x + d·y + f. */
export type Matrix = [number, number, number, number, number, number];

export const IDENTITY: Matrix = [1, 0, 0, 1, 0, 0];

/** Segments per full turn of a curve (a quarter circle gets a quarter of these). */
const CURVE_SEGMENTS = 32;

export function multiply(m: Matrix, n: Matrix): Matrix {
    return [
        m[0] * n[0] + m[2] * n[1],
        m[1] * n[0] + m[3] * n[1],
        m[0] * n[2] + m[2] * n[3],
        m[1] * n[2] + m[3] * n[3],
        m[0] * n[4] + m[2] * n[5] + m[4],
        m[1] * n[4] + m[3] * n[5] + m[5],
    ];
}

export function applyMatrix(m: Matrix, p: Pt): Pt {
    return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] };
}

const NUMBER = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/g;

function numbers(raw: string): number[] {
    return (raw.match(NUMBER) ?? []).map(Number);
}

/** Parses an SVG `transform` attribute (matrix, translate, scale, rotate, skewX, skewY). */
export function parseTransform(raw: string | null | undefined): Matrix {
    let m = IDENTITY;
    if (!raw) return m;
    for (const [, fn, args] of raw.matchAll(/(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g)) {
        const v = numbers(args);
        const rad = ((v[0] ?? 0) * Math.PI) / 180;
        let t: Matrix = IDENTITY;
        if (fn === 'matrix' && v.length === 6) t = v as Matrix;
        else if (fn === 'translate') t = [1, 0, 0, 1, v[0] ?? 0, v[1] ?? 0];
        else if (fn === 'scale') t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
        else if (fn === 'rotate') {
            const r: Matrix = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
            t = v.length >= 3 ? multiply(multiply([1, 0, 0, 1, v[1], v[2]], r), [1, 0, 0, 1, -v[1], -v[2]]) : r;
        } else if (fn === 'skewX') t = [1, 0, Math.tan(rad), 1, 0, 0];
        else if (fn === 'skewY') t = [1, Math.tan(rad), 0, 1, 0, 0];
        m = multiply(m, t);
    }
    return m;
}

/** Reads path data one token at a time (numbers can be packed without separators). */
class PathScanner {
    private i = 0;
    private readonly number = /[-+]?(?:\d+\.?\d*|\.\d+)(?:[eE][-+]?\d+)?/y;

    constructor(private readonly d: string) {}

    private skip(): void {
        while (this.i < this.d.length && /[\s,]/.test(this.d[this.i])) this.i++;
    }

    done(): boolean {
        this.skip();
        return this.i >= this.d.length;
    }

    command(): string | null {
        this.skip();
        const c = this.d[this.i];
        if (c && /[MmLlHhVvCcSsQqTtAaZz]/.test(c)) {
            this.i++;
            return c;
        }
        return null;
    }

    hasNumber(): boolean {
        this.skip();
        return this.i < this.d.length && /[-+.\d]/.test(this.d[this.i]);
    }

    num(): number {
        this.skip();
        this.number.lastIndex = this.i;
        const m = this.number.exec(this.d);
        if (!m) throw new Error(`Bad number in path data at ${this.i}`);
        this.i += m[0].length;
        return Number(m[0]);
    }

    /** Arc flags are a single 0 or 1 and may touch the next number ("0110 0"). */
    flag(): number {
        this.skip();
        const c = this.d[this.i];
        if (c !== '0' && c !== '1') throw new Error(`Bad arc flag in path data at ${this.i}`);
        this.i++;
        return Number(c);
    }
}

function cubic(p0: Pt, c1: Pt, c2: Pt, p: Pt): Pt[] {
    const n = CURVE_SEGMENTS / 4;
    const out: Pt[] = [];
    for (let k = 1; k <= n; k++) {
        const t = k / n;
        const u = 1 - t;
        out.push({
            x: u * u * u * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t * t * t * p.x,
            y: u * u * u * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t * t * t * p.y,
        });
    }
    return out;
}

function quadratic(p0: Pt, c: Pt, p: Pt): Pt[] {
    const n = CURVE_SEGMENTS / 4;
    const out: Pt[] = [];
    for (let k = 1; k <= n; k++) {
        const t = k / n;
        const u = 1 - t;
        out.push({ x: u * u * p0.x + 2 * u * t * c.x + t * t * p.x, y: u * u * p0.y + 2 * u * t * c.y + t * t * p.y });
    }
    return out;
}

/** Elliptical arc (SVG endpoint parameterisation, spec appendix B.2.4) as points after p0. */
function arc(p0: Pt, rxIn: number, ryIn: number, rotationDeg: number, large: number, sweep: number, p: Pt): Pt[] {
    let rx = Math.abs(rxIn);
    let ry = Math.abs(ryIn);
    if (!rx || !ry || (p0.x === p.x && p0.y === p.y)) return [p];
    const phi = (rotationDeg * Math.PI) / 180;
    const cos = Math.cos(phi);
    const sin = Math.sin(phi);
    const dx = (p0.x - p.x) / 2;
    const dy = (p0.y - p.y) / 2;
    const x1 = cos * dx + sin * dy;
    const y1 = -sin * dx + cos * dy;
    const lambda = (x1 * x1) / (rx * rx) + (y1 * y1) / (ry * ry);
    if (lambda > 1) {
        rx *= Math.sqrt(lambda);
        ry *= Math.sqrt(lambda);
    }
    const num = rx * rx * ry * ry - rx * rx * y1 * y1 - ry * ry * x1 * x1;
    const den = rx * rx * y1 * y1 + ry * ry * x1 * x1;
    let k = Math.sqrt(Math.max(0, num / den));
    if (large === sweep) k = -k;
    const cxp = (k * rx * y1) / ry;
    const cyp = (-k * ry * x1) / rx;
    const cx = cos * cxp - sin * cyp + (p0.x + p.x) / 2;
    const cy = sin * cxp + cos * cyp + (p0.y + p.y) / 2;
    const angle = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const ux = (x1 - cxp) / rx;
    const uy = (y1 - cyp) / ry;
    const vx = (-x1 - cxp) / rx;
    const vy = (-y1 - cyp) / ry;
    const start = angle(1, 0, ux, uy);
    let delta = angle(ux, uy, vx, vy);
    if (!sweep && delta > 0) delta -= 2 * Math.PI;
    else if (sweep && delta < 0) delta += 2 * Math.PI;

    const n = Math.max(2, Math.ceil((Math.abs(delta) / (2 * Math.PI)) * CURVE_SEGMENTS));
    const out: Pt[] = [];
    for (let i = 1; i < n; i++) {
        const t = start + (delta * i) / n;
        out.push({
            x: cx + rx * Math.cos(t) * cos - ry * Math.sin(t) * sin,
            y: cy + rx * Math.cos(t) * sin + ry * Math.sin(t) * cos,
        });
    }
    out.push(p);
    return out;
}

/** Turns SVG path data into absolute polylines, one per subpath. */
export function svgPathToPolylines(d: string): Polyline[] {
    const scan = new PathScanner(d);
    const out: Polyline[] = [];
    let current: Polyline | null = null;
    let cur: Pt = { x: 0, y: 0 };
    let start: Pt = cur;
    let cmd: string | null = null;
    let lastCubic: Pt | null = null;
    let lastQuad: Pt | null = null;

    const lineTo = (pts: Pt[]) => {
        if (!current) {
            current = { pts: [cur], closed: false };
            out.push(current);
        }
        current.pts.push(...pts);
        cur = pts[pts.length - 1];
    };

    while (!scan.done()) {
        const next = scan.command();
        if (next) cmd = next;
        else if (!cmd || !scan.hasNumber() || cmd === 'Z' || cmd === 'z') break; // malformed: keep what we have

        const upper = cmd.toUpperCase();
        const base: Pt = cmd === upper ? { x: 0, y: 0 } : cur;
        const point = (): Pt => {
            const x = scan.num();
            const y = scan.num();
            return { x: base.x + x, y: base.y + y };
        };
        let cubicCtrl: Pt | null = null;
        let quadCtrl: Pt | null = null;

        switch (upper) {
            case 'M': {
                const p = point();
                current = { pts: [p], closed: false };
                out.push(current);
                cur = start = p;
                cmd = cmd === 'M' ? 'L' : 'l'; // extra pairs after a moveto are linetos
                break;
            }
            case 'L':
                lineTo([point()]);
                break;
            case 'H': {
                const x = scan.num();
                lineTo([{ x: base.x + x, y: cur.y }]);
                break;
            }
            case 'V': {
                const y = scan.num();
                lineTo([{ x: cur.x, y: base.y + y }]);
                break;
            }
            case 'C': {
                const c1 = point();
                const c2 = point();
                const p = point();
                lineTo(cubic(cur, c1, c2, p));
                cubicCtrl = c2;
                break;
            }
            case 'S': {
                const c1: Pt = lastCubic ? { x: 2 * cur.x - lastCubic.x, y: 2 * cur.y - lastCubic.y } : cur;
                const c2 = point();
                const p = point();
                lineTo(cubic(cur, c1, c2, p));
                cubicCtrl = c2;
                break;
            }
            case 'Q': {
                const c = point();
                const p = point();
                lineTo(quadratic(cur, c, p));
                quadCtrl = c;
                break;
            }
            case 'T': {
                const c: Pt = lastQuad ? { x: 2 * cur.x - lastQuad.x, y: 2 * cur.y - lastQuad.y } : cur;
                const p = point();
                lineTo(quadratic(cur, c, p));
                quadCtrl = c;
                break;
            }
            case 'A': {
                const rx = scan.num();
                const ry = scan.num();
                const rotation = scan.num();
                const large = scan.flag();
                const sweep = scan.flag();
                const p = point();
                lineTo(arc(cur, rx, ry, rotation, large, sweep, p));
                break;
            }
            case 'Z': {
                if (current) current.closed = true;
                current = null;
                cur = start;
                break;
            }
        }
        lastCubic = cubicCtrl;
        lastQuad = quadCtrl;
    }

    return out.filter((l) => l.pts.length >= 2);
}

/** Points of a circle or ellipse, as a closed polyline. */
export function ellipsePoints(cx: number, cy: number, rx: number, ry: number): Pt[] {
    const pts: Pt[] = [];
    for (let i = 0; i < CURVE_SEGMENTS; i++) {
        const t = (i / CURVE_SEGMENTS) * 2 * Math.PI;
        pts.push({ x: cx + rx * Math.cos(t), y: cy + ry * Math.sin(t) });
    }
    return pts;
}
