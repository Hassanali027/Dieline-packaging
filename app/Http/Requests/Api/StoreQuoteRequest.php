<?php

namespace App\Http\Requests\Api;

use App\Models\Design;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Support\Facades\Gate;
use Illuminate\Validation\Validator;

class StoreQuoteRequest extends FormRequest
{
    /** Largest accepted preview image (base64 data URL), bytes. */
    public const MAX_IMAGE_BYTES = 6 * 1024 * 1024;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        return [
            'customer_name' => ['required', 'string', 'max:120'],
            'customer_email' => ['required', 'email', 'max:190'],
            'customer_phone' => ['required', 'string', 'max:40'],
            'company_name' => ['nullable', 'string', 'max:120'],
            'length' => ['required', 'numeric', 'gt:0', 'max:5000'],
            'width' => ['required', 'numeric', 'gt:0', 'max:5000'],
            'depth' => ['required', 'numeric', 'gt:0', 'max:5000'],
            'unit' => ['required', 'in:mm,in'],
            'quantity' => ['required', 'integer', 'min:1', 'max:10000000'],
            'construction' => ['nullable', 'in:folding,corrugated,rigid'],
            'board_thickness' => ['nullable', 'string', 'max:40'],
            'paper' => ['nullable', 'string', 'max:60'],
            'finishes' => ['nullable', 'array', 'max:10'],
            'finishes.*' => ['string', 'max:40'],
            'insert_type' => ['nullable', 'string', 'max:60'],
            'notes' => ['nullable', 'string', 'max:2000'],
            'design_id' => ['nullable', 'integer'],
            // Previews from the editor (3D / sheet renders) as PNG data URLs.
            'outside_png' => ['nullable', 'string', 'starts_with:data:image/png;base64,'],
            'inside_png' => ['nullable', 'string', 'starts_with:data:image/png;base64,'],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                foreach (['outside_png', 'inside_png'] as $field) {
                    if (strlen((string) $this->input($field)) > self::MAX_IMAGE_BYTES) {
                        $validator->errors()->add($field, 'The preview image is too large.');
                    }
                }
                // A quote may point at a saved design only if the visitor owns it.
                if ($this->filled('design_id')) {
                    $design = Design::find($this->integer('design_id'));
                    if (! $design || Gate::denies('view', $design)) {
                        $validator->errors()->add('design_id', 'This design cannot be attached.');
                    }
                }
            },
        ];
    }
}
