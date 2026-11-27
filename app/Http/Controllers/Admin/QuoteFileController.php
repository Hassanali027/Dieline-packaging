<?php

namespace App\Http\Controllers\Admin;

use App\Http\Controllers\Controller;
use App\Models\Quote;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Symfony\Component\HttpFoundation\StreamedResponse;

/** Quote previews / PDFs live on the private disk; only staff can download them. */
class QuoteFileController extends Controller
{
    public const FIELDS = ['outside_png', 'inside_png', 'print_pdf'];

    public function __invoke(Request $request, Quote $quote, string $field): StreamedResponse
    {
        abort_unless((bool) $request->user()?->is_admin, 403);
        abort_unless(in_array($field, self::FIELDS, true), 404);

        $path = $quote->{$field};
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        return Storage::disk('local')->download($path, "quote-{$quote->id}-".basename($path));
    }
}
