<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class CustomBoxUpload extends Model
{
    protected $fillable = [
        'kind',
        'file',
        'parsed_panels',
        'fold_mapping',
        'status',
        'owner',
        'reviewed_by',
    ];

    protected function casts(): array
    {
        return [
            'parsed_panels' => 'array',
            'fold_mapping' => 'array',
        ];
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }
}
