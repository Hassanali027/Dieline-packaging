<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;

/**
 * A file a customer uploaded into the editor (image or SVG).
 *
 * `url` is stored relative ("/storage/...") so the editor loads it from its own origin:
 * cross-origin images would taint the canvas the 3D preview uses as a texture.
 */
class Asset extends Model
{
    protected $fillable = [
        'disk',
        'path',
        'thumbnail_path',
        'original_name',
        'mime',
        'size',
        'width',
        'height',
        'url',
        'type',
        'owner_session',
    ];

    protected function casts(): array
    {
        return [
            'size' => 'integer',
            'width' => 'integer',
            'height' => 'integer',
        ];
    }

    public static function publicUrl(string $path): string
    {
        return '/storage/'.ltrim($path, '/');
    }

    public function thumbnailUrl(): ?string
    {
        return $this->thumbnail_path ? self::publicUrl($this->thumbnail_path) : null;
    }

    public function absolutePath(): string
    {
        return Storage::disk($this->disk)->path($this->path);
    }

    /** Shape the editor expects (see resources/js/lib/api.ts). */
    public function toEditorArray(): array
    {
        return [
            'id' => $this->id,
            'url' => $this->url,
            'thumbnail_url' => $this->thumbnailUrl(),
            'type' => $this->type,
            'name' => $this->original_name,
            'mime' => $this->mime,
            'size' => $this->size,
            'width' => $this->width,
            'height' => $this->height,
        ];
    }
}
