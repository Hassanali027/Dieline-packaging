<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class Material extends Model
{
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
}
