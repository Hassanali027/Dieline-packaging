<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
    /** Box styles, matching BoxStyle in resources/js/types/design.ts. */
    public const STYLES = [
        'mailer' => 'Mailer',
        'reverse-tuck' => 'Reverse Tuck',
        'straight-tuck' => 'Straight Tuck',
        'burger' => 'Burger',
        'tray' => 'Tray',
        'sleeve' => 'Sleeve',
        'rigid-lid-base' => 'Rigid Lid & Base',
        'rigid-magnetic' => 'Rigid Magnetic',
        'rigid-drawer' => 'Rigid Drawer',
        'rigid-shoulder' => 'Rigid Shoulder',
        'rigid-book' => 'Rigid Book',
    ];

    protected $fillable = [
        'name',
        'slug',
        'style',
        'construction',
        'default_params',
        'glb_url',
        'thumbnail',
        'active',
    ];

    protected function casts(): array
    {
        return [
            'default_params' => 'array',
            'active' => 'boolean',
        ];
    }

    public static function constructionFor(string $style): string
    {
        return match (true) {
            str_starts_with($style, 'rigid-') => 'rigid',
            $style === 'mailer' => 'corrugated',
            default => 'folding',
        };
    }

    protected static function booted(): void
    {
        // The editor reads style/construction from default_params (BoxParams), so keep them in sync.
        static::saving(function (Product $product) {
            $params = $product->default_params ?? [];
            $params['style'] = $product->style;
            $params['construction'] = $product->construction;
            foreach (['length', 'width', 'depth', 'thickness'] as $key) {
                if (isset($params[$key]) && is_numeric($params[$key])) {
                    $params[$key] = (float) $params[$key];
                }
            }
            if ($product->construction !== 'rigid') {
                unset($params['rigid']);
            } elseif (isset($params['rigid']) && is_array($params['rigid'])) {
                $params['rigid'] = array_map(
                    fn ($v) => is_numeric($v) ? (float) $v : $v,
                    array_filter($params['rigid'], fn ($v) => $v !== null && $v !== ''),
                );
            }
            $product->default_params = $params;
        });
    }
}
