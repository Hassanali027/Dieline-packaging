export type Pt = {
    x: number;
    y: number;
};

export type UvFace = {
    id: string;
    name: string;
    uvPolygon: Pt[];
};

export type BoxStyle =
    | 'mailer'
    | 'reverse-tuck'
    | 'straight-tuck'
    | 'burger'
    | 'tray'
    | 'sleeve'
    | 'rigid-lid-base'
    | 'rigid-magnetic'
    | 'rigid-drawer'
    | 'rigid-shoulder'
    | 'rigid-book';

export type BoxParams = {
    style: BoxStyle;
    length: number;
    width: number;
    depth: number;
    thickness: number;
    unit: 'mm' | 'in';
    construction: 'folding' | 'rigid' | 'corrugated';
    rigid?: {
        boardThickness: number;
        turnIn: number;
        lidDepth?: number;
        lidClearance?: number;
        shoulderHeight?: number;
        magnet?: boolean;
        ribbonPull?: boolean;
    };
};

export type Panel = {
    id: string;
    name: string;
    polygon: Pt[];
    hinge?: { a: Pt; b: Pt };
    parentId?: string;
    foldAngle: number;
    side: 'outside' | 'inside';
    part?: 'lid' | 'base' | 'drawer' | 'sleeve' | 'tray' | 'liner';
};

export type DielineResult = {
    panels: Panel[];
    cutPath: string;
    creasePaths: string[];
    bleedPath: string;
    safePath: string;
    overallSize: { width: number; height: number };
    /** Rigid boxes: the printed parts in this result (panels carry `part`), e.g. ['lid', 'base', 'liner']. */
    parts?: string[];
    /** Rigid boxes: chipboard blanks to cut (mm), the cutting list for the factory. */
    chipboard?: ChipboardPiece[];
};

export type ChipboardPiece = {
    part: 'lid' | 'base' | 'drawer' | 'sleeve' | 'tray';
    name: string;
    width: number;
    height: number;
    quantity: number;
};

export type BoxSource =
    | { kind: 'parametric'; params: BoxParams }
    | {
          kind: 'uploaded-dieline';
          fileId: string;
          panels: Panel[];
          foldMapped: boolean;
          lines?: UploadedDielineLine[];
          /** SVG artboard dimensions after applying the user's physical scale. */
          widthMm?: number;
          heightMm?: number;
          /** Pixel-based SVGs need an explicit physical-size confirmation. */
          unit?: string;
          scaleConfirmed?: boolean;
      }
    | { kind: 'uploaded-model'; glbUrl: string; uvLayout: UvFace[] }
    | { kind: 'photo-mockup'; photoUrl: string; quad: [Pt, Pt, Pt, Pt] };

export type UploadedDielineLine = { id: string; a: Pt; b: Pt; kind: 'cut' | 'crease' | 'unknown' };

export type CanvasObject = {
    id: string;
    type: 'image' | 'text' | 'shape' | 'icon' | 'qr' | 'barcode' | 'pattern' | 'group';
    side: 'outside' | 'inside';
    panelId?: string;
    props: Record<string, unknown>;
    locked?: boolean;
    effect?: 'none' | 'emboss' | 'deboss';
};

export type DesignPartKey = 'lid' | 'base' | 'drawer' | 'sleeve' | 'tray' | 'liner';

export type Design = {
    source: BoxSource;
    outside: CanvasObject[];
    inside: CanvasObject[];
    parts?: Partial<Record<DesignPartKey, { outside: CanvasObject[]; inside: CanvasObject[] }>>;
    faceColors: Record<string, string>;
    material: 'white' | 'kraft' | 'transparent' | 'wrap-paper' | 'linen' | 'leatherette' | string;
    finish?: {
        lamination?: 'matte' | 'gloss' | 'soft-touch';
        foil?: 'gold' | 'silver' | 'none';
        spotUv?: boolean;
    };
};
