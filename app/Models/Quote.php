<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class Quote extends Model
{
    protected $fillable = [
        'customer_name',
        'customer_email',
        'customer_phone',
        'company_name',
        'length',
        'width',
        'depth',
        'unit',
        'quantity',
        'construction',
        'board_thickness',
        'paper',
        'finishes',
        'insert_type',
        'notes',
        'design_id',
        'outside_png',
        'inside_png',
        'print_pdf',
        'status',
    ];

    protected function casts(): array
    {
        return [
            'length' => 'float',
            'width' => 'float',
            'depth' => 'float',
            'quantity' => 'integer',
            'finishes' => 'array',
        ];
    }

    public function design(): BelongsTo
    {
        return $this->belongsTo(Design::class);
    }
}
