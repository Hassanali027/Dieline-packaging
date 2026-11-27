<?php

namespace App\Http\Requests\Api;

use App\Rules\Turnstile;
use Illuminate\Foundation\Http\FormRequest;

class StoreShareRequest extends FormRequest
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
            'customer_name' => ['required', 'string', 'max:120'],
            'customer_email' => ['required', 'email', 'max:190'],
            'customer_phone' => ['required', 'string', 'max:40'],
            // Cloudflare Turnstile token (only checked when the site has Turnstile keys).
            'turnstile_token' => [new Turnstile($this->ip())],
            'design' => ['required', 'array'],
            'design.source' => ['required', 'array'],
            'design.source.kind' => ['required', 'in:parametric,uploaded-dieline,uploaded-model,photo-mockup'],
            'design.outside' => ['present', 'array'],
            'design.inside' => ['present', 'array'],
            'design.material' => ['required', 'string', 'max:40'],
        ];
    }

    public function after(): array
    {
        return [
            function ($validator) {
                if (strlen((string) json_encode($this->input('design'))) > SaveDesignRequest::MAX_JSON_BYTES) {
                    $validator->errors()->add('design', 'The design is too large.');
                }
            },
        ];
    }
}
