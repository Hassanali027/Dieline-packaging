<?php

namespace App\Models;

use App\Support\SvgMarkup;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Storage;
use InvalidArgumentException;

/**
 * Editor pattern library: a repeating tile, as SVG and/or a raster image on the public disk.
 * The editor tiles it over one panel or the whole box.
 */
class Pattern extends Model
{
    protected $fillable = [
        'name',
        'svg',
        'image',
        'category',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'active' => 'boolean',
        ];
    }

    protected static function booted(): void
    {
        static::saving(function (Pattern $pattern) {
            if ($pattern->isDirty('svg') && filled($pattern->svg)) {
                $pattern->svg = SvgMarkup::clean($pattern->svg) ?? throw new InvalidArgumentException('The pattern tile is not a valid SVG.');
            }
            // The column is NOT NULL: an image-only pattern stores an empty SVG.
            $pattern->svg ??= '';
            if (blank($pattern->svg) && blank($pattern->image)) {
                throw new InvalidArgumentException('A pattern needs an SVG tile or an image.');
            }
        });
    }

    /** @param  Builder<Pattern>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }

    /** Public URL of the tile the editor should use (the image wins when both exist). */
    public function tileUrl(): ?string
    {
        if (filled($this->image)) {
            return Storage::disk('public')->url($this->image);
        }

        return SvgMarkup::dataUri($this->svg);
    }

    /** @return array{id: int, name: string, category: ?string, svg: ?string, src: ?string} */
    public function toLibraryArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'category' => $this->category,
            'svg' => filled($this->svg) ? $this->svg : null,
            'src' => $this->tileUrl(),
        ];
    }
}
