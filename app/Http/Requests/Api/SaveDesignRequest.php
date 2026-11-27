<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Validation\Validator;

/**
 * Validates the Design JSON from resources/js/types/design.ts.
 * Used for create (POST) and update (PUT/PATCH; fields become optional).
 */
class SaveDesignRequest extends FormRequest
{
    /** Largest accepted design document, in bytes of JSON. */
    public const MAX_JSON_BYTES = 2 * 1024 * 1024;

    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, mixed>
     */
    public function rules(): array
    {
        $required = $this->isMethod('POST') ? 'required' : 'sometimes';

        return [
            'name' => [$required, 'string', 'max:120'],
            'data' => [$required, 'array'],
            'data.source' => ['required_with:data', 'array'],
            'data.source.kind' => ['required_with:data', 'in:parametric,uploaded-dieline,uploaded-model,photo-mockup'],
            'data.source.params' => ['required_if:data.source.kind,parametric', 'array'],
            'data.source.params.style' => ['required_if:data.source.kind,parametric', 'string', 'max:40'],
            'data.source.params.length' => ['required_if:data.source.kind,parametric', 'numeric', 'gt:0'],
            'data.source.params.width' => ['required_if:data.source.kind,parametric', 'numeric', 'gt:0'],
            'data.source.params.depth' => ['required_if:data.source.kind,parametric', 'numeric', 'gt:0'],
            'data.source.params.thickness' => ['required_if:data.source.kind,parametric', 'numeric', 'gt:0'],
            'data.source.params.unit' => ['required_if:data.source.kind,parametric', 'in:mm,in'],
            'data.outside' => ['present_with:data', 'array'],
            'data.inside' => ['present_with:data', 'array'],
            'data.outside.*.id' => ['required', 'string', 'max:64'],
            'data.outside.*.type' => ['required', 'in:image,text,shape,icon,qr,barcode,pattern,group'],
            'data.inside.*.id' => ['required', 'string', 'max:64'],
            'data.inside.*.type' => ['required', 'in:image,text,shape,icon,qr,barcode,pattern,group'],
            'data.faceColors' => ['present_with:data', 'array'],
            'data.material' => ['required_with:data', 'string', 'max:40'],
            'thumbnail' => ['nullable', 'string', 'max:255'],
        ];
    }

    /**
     * The fields to save. Uses the raw input once it has passed validation: validated()
     * would drop every nested key without its own rule (object props, extra params...).
     *
     * @return array<string, mixed>
     */
    public function designAttributes(): array
    {
        $this->validated();

        return $this->only(array_values(array_filter(['name', 'data', 'thumbnail'], fn ($key) => $this->has($key))));
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                if ($this->has('data') && strlen((string) json_encode($this->input('data'))) > self::MAX_JSON_BYTES) {
                    $validator->errors()->add('data', 'The design is too large.');
                }
            },
        ];
    }
}
