<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\StoreShareRequest;
use App\Models\SharedDesign;
use Illuminate\Http\JsonResponse;
use Illuminate\Support\Str;

/**
 * "Share design": freezes a copy of the design behind a random link that expires.
 * The link opens the editor read-only (/s/{token}) with an "Edit a copy" button.
 */
class ShareController extends Controller
{
    public function store(StoreShareRequest $request): JsonResponse
    {
        $share = SharedDesign::create([
            // 32 random characters: unguessable, and unique by index.
            'token' => Str::random(32),
            'design_data' => $request->input('design'),
            'customer_name' => $request->input('customer_name'),
            'customer_email' => $request->input('customer_email'),
            'customer_phone' => $request->input('customer_phone'),
            'expires_at' => now()->addDays(config('dieline.share_days')),
        ]);

        return response()->json([
            'data' => [
                'token' => $share->token,
                'url' => url("/s/{$share->token}"),
                'expires_at' => $share->expires_at->toIso8601String(),
            ],
        ], 201);
    }
}
