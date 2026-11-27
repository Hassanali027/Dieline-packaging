import type { BoxParams } from '@/types/design';

/** Product row as sent by EditorController (Inertia props). */
export type ProductItem = {
    id: number;
    name: string;
    slug: string;
    style: string;
    construction: 'folding' | 'rigid' | 'corrugated';
    default_params: BoxParams;
    glb_url: string | null;
    thumbnail: string | null;
};
