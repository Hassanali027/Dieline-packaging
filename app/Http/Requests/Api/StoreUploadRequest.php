<?php

namespace App\Http\Requests\Api;

use Illuminate\Foundation\Http\FormRequest;

class StoreUploadRequest extends FormRequest
{
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
            // 10 MB, images only. SVGs are sanitized in the controller before they are stored.
            'file' => ['required', 'file', 'mimes:jpg,jpeg,png,svg', 'max:10240'],
        ];
    }
}
