<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\CustomBoxUpload;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Staff download of a custom box upload: the original file or the converted SVG. */
class CustomBoxFileController extends Controller
{
    public function __invoke(Request $request, CustomBoxUpload $upload, string $variant): StreamedResponse
    {
        abort_unless((bool) $request->user()?->is_admin, 403);
        $path = match ($variant) {
            'original' => $upload->file,
            'converted' => $upload->converted_file,
            default => abort(404),
        };
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        $base = pathinfo($upload->original_name ?: 'upload', PATHINFO_FILENAME);
        $name = $variant === 'original' ? ($upload->original_name ?: basename($path)) : "{$base}-converted.svg";

        // Download only (attachment): customer files are never rendered on our origin.
        return Storage::disk('local')->download($path, $name);
    }
}
