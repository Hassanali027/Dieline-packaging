<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/**
 * A customer's own box: a dieline (SVG / PDF / AI / DXF), a 3D model (GLB) or a photo.
 * Files live on the private "local" disk and are served only to their owner and staff.
 */
class CustomBoxUpload extends Model
{
    public const STATUS_PENDING = 'pending';

    public const STATUS_READY = 'ready';

    public const STATUS_NEEDS_REVIEW = 'needs-review';

    public const STATUS_APPROVED = 'approved';

    public const STATUS_REJECTED = 'rejected';

    public const STATUSES = [
        self::STATUS_PENDING => 'Processing',
        self::STATUS_READY => 'Ready',
        self::STATUS_NEEDS_REVIEW => 'Needs review',
        self::STATUS_APPROVED => 'Approved',
        self::STATUS_REJECTED => 'Rejected',
    ];

    public const KINDS = ['dieline' => 'Dieline', 'model' => '3D model', 'photo' => 'Photo'];

    /** File extension → upload kind. */
    public const EXTENSIONS = [
        'svg' => 'dieline',
        'pdf' => 'dieline',
        'ai' => 'dieline',
        'dxf' => 'dieline',
        'glb' => 'model',
        'jpg' => 'photo',
        'jpeg' => 'photo',
        'png' => 'photo',
    ];

    protected $fillable = [
        'kind',
        'file',
        'original_name',
        'mime',
        'size',
        'converted_file',
        'parsed_panels',
        'fold_mapping',
        'meta',
        'error',
        'status',
        'owner',
        'reviewed_by',
        'review_notes',
        'reviewed_at',
    ];

    protected function casts(): array
    {
        return [
            'parsed_panels' => 'array',
            'fold_mapping' => 'array',
            'meta' => 'array',
            'size' => 'integer',
            'reviewed_at' => 'datetime',
        ];
    }

    public function reviewer(): BelongsTo
    {
        return $this->belongsTo(User::class, 'reviewed_by');
    }

    public function extension(): string
    {
        return strtolower(pathinfo($this->file, PATHINFO_EXTENSION));
    }

    /** The file the editor should use: the converted one when there is one, else the original. */
    public function editorFile(): ?string
    {
        return $this->converted_file ?: ($this->kind === 'photo' || $this->extension() === 'dxf' || $this->extension() === 'glb' ? $this->file : null);
    }

    /** Shape the editor reads (see resources/js/lib/api.ts). */
    public function toEditorArray(): array
    {
        return [
            'id' => $this->id,
            'kind' => $this->kind,
            'status' => $this->status,
            'name' => $this->original_name,
            'size' => $this->size,
            'format' => $this->extension(),
            'file_url' => $this->editorFile() ? url("/api/custom-boxes/{$this->id}/file") : null,
            'meta' => $this->meta,
            'error' => $this->error,
            'created_at' => $this->created_at?->toIso8601String(),
        ];
    }
}
