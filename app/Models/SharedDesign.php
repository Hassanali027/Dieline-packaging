<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class SharedDesign extends Model
{
    protected $fillable = [
        'token',
        'design_data',
        'customer_name',
        'customer_email',
        'customer_phone',
        'expires_at',
    ];

    protected function casts(): array
    {
        return [
            'design_data' => 'array',
            'expires_at' => 'datetime',
        ];
    }

    public function isExpired(): bool
    {
        return $this->expires_at->isPast();
    }
}
