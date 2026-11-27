<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/**
 * Board and wrap-paper materials. `properties` holds what the editor needs to draw them:
 * outside / inside colour, roughness and bump strength for the 3D view, and which
 * constructions may use the material.
 */
class Material extends Model
{
    public const CATEGORIES = [
        'board' => 'Board (folding / corrugated)',
        'wrap' => 'Wrap paper (rigid)',
    ];

    public const CONSTRUCTIONS = [
        'folding' => 'Folding',
        'corrugated' => 'Corrugated',
        'rigid' => 'Rigid',
    ];

    protected $fillable = [
        'name',
        'slug',
        'image',
        'category',
        'properties',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'properties' => 'array',
            'active' => 'boolean',
        ];
    }

    /** @param  Builder<Material>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }

    /**
     * Same shape as the editor's MATERIAL_COLORS entries (resources/js/lib/three/materials.ts).
     *
     * @return array<string, mixed>
     */
    public function toLibraryArray(): array
    {
        $p = $this->properties ?? [];

        return [
            'id' => $this->id,
            'slug' => $this->slug,
            'name' => $this->name,
            'category' => $this->category,
            'outside' => $p['outside'] ?? '#f8fafc',
            'inside' => $p['inside'] ?? ($p['outside'] ?? '#eef1f4'),
            'roughness' => (float) ($p['roughness'] ?? 0.8),
            'bumpScale' => (float) ($p['bumpScale'] ?? 0),
            'constructions' => array_values($p['constructions'] ?? array_keys(self::CONSTRUCTIONS)),
            'image_url' => filled($this->image) ? Storage::disk('public')->url($this->image) : null,
        ];
    }
}
