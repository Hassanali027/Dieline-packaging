<?php

namespace App\Models;

use App\Support\SvgMarkup;
use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use InvalidArgumentException;

/** Editor icon library (managed in Filament, served by /api/library). */
class Icon extends Model
{
    protected $fillable = [
        'name',
        'svg',
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
        // Whatever path the SVG came in by (admin form, seeder, tinker), only clean markup is stored.
        static::saving(function (Icon $icon) {
            if ($icon->isDirty('svg')) {
                $icon->svg = SvgMarkup::clean($icon->svg) ?? throw new InvalidArgumentException('The icon is not a valid SVG.');
            }
        });
    }

    /** @param  Builder<Icon>  $query */
    public function scopeActive(Builder $query): void
    {
        $query->where('active', true);
    }

    /** @return array{id: int, name: string, category: ?string, svg: string, src: ?string} */
    public function toLibraryArray(): array
    {
        return [
            'id' => $this->id,
            'name' => $this->name,
            'category' => $this->category,
            'svg' => $this->svg,
            'src' => SvgMarkup::dataUri($this->svg),
        ];
    }
}
