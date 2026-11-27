<?php

namespace App\Http\Requests\Api;

use App\Models\CustomBoxUpload;
use Illuminate\Foundation\Http\FormRequest;
use Illuminate\Http\UploadedFile;
use Illuminate\Validation\Validator;

/**
 * "Upload your own box": svg, pdf, ai, dxf, glb, jpg, png up to 20 MB.
 *
 * Browsers and fileinfo report GLB / DXF / AI types inconsistently, so the extension decides
 * the kind and the file's first bytes must match it (a renamed .exe never gets through).
 */
class StoreCustomBoxRequest extends FormRequest
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
            'file' => ['required', 'file', 'extensions:'.implode(',', array_keys(CustomBoxUpload::EXTENSIONS)), 'max:'.config('dieline.custom_boxes.max_kb')],
        ];
    }

    public function after(): array
    {
        return [
            function (Validator $validator) {
                $file = $this->file('file');
                if (! $file instanceof UploadedFile || $validator->errors()->has('file')) {
                    return;
                }
                if (! self::contentMatches($file)) {
                    $validator->errors()->add('file', 'The file content does not match its type.');
                }
            },
        ];
    }

    public function uploadExtension(): string
    {
        return strtolower($this->file('file')->getClientOriginalExtension());
    }

    public static function contentMatches(UploadedFile $file): bool
    {
        $head = (string) file_get_contents($file->getRealPath(), false, null, 0, 2048);

        return match (strtolower($file->getClientOriginalExtension())) {
            // Illustrator files saved with PDF compatibility (the usual default) are PDFs inside.
            'pdf', 'ai' => str_contains(substr($head, 0, 1024), '%PDF-'),
            'svg' => (bool) preg_match('/<svg[\s>]/i', $head),
            'glb' => str_starts_with($head, 'glTF'),
            'dxf' => (bool) preg_match('/^\s*0\s*\R\s*SECTION/m', $head),
            'png' => str_starts_with($head, "\x89PNG\r\n\x1a\n"),
            'jpg', 'jpeg' => str_starts_with($head, "\xFF\xD8\xFF"),
            default => false,
        };
    }
}
