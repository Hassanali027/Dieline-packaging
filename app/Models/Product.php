<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Product extends Model
{
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
}
