<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\StoreQuoteRequest;
use App\Jobs\SendQuoteMails;
use App\Models\Quote;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\Storage;

/**
 * "Submit & get a quote": stores the request, keeps the preview images privately
 * (local disk, downloadable from the admin) and emails the customer and the admin.
 */
class QuoteController extends Controller
{
    public function store(StoreQuoteRequest $request): JsonResponse
    {
        $quote = Quote::create([
            ...$request->safe()->except(['outside_png', 'inside_png', 'design_id']),
            'design_id' => $request->filled('design_id') ? $request->integer('design_id') : null,
            'status' => 'new',
        ]);

        $files = [];
        foreach (['outside_png', 'inside_png'] as $field) {
            $dataUrl = $request->input($field);
            if (! $dataUrl) {
                continue;
            }
            $binary = base64_decode(substr($dataUrl, strlen('data:image/png;base64,')), true);
            // Only keep real PNGs (magic bytes), never whatever else was posted.
            if ($binary === false || ! str_starts_with($binary, "\x89PNG\r\n\x1a\n")) {
                continue;
            }
            $path = "quotes/{$quote->id}/".str_replace('_png', '', $field).'.png';
            Storage::disk('local')->put($path, $binary);
            $files[$field] = $path;
        }
        if ($files) {
            $quote->update($files);
        }

        SendQuoteMails::dispatch($quote);

        return response()->json(['data' => ['id' => $quote->id, 'status' => $quote->status]], 201);
    }
}
