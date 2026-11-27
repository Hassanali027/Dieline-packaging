<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\Icon;
use App\Models\Material;
use App\Models\Pattern;
use Illuminate\Http\JsonResponse;

/**
 * GET /api/library: the active icons, patterns and materials admins manage in Filament
 * (Library group), for the editor's Elements panel and material picker.
 */
class LibraryController extends Controller
{
    public function __invoke(): JsonResponse
    {
        return response()
            ->json([
                'data' => [
                    'icons' => Icon::query()->active()->orderBy('category')->orderBy('name')->get()->map->toLibraryArray()->values(),
                    'patterns' => Pattern::query()->active()->orderBy('category')->orderBy('name')->get()->map->toLibraryArray()->values(),
                    'materials' => Material::query()->active()->orderBy('category')->orderBy('name')->get()->map->toLibraryArray()->values(),
                ],
            ])
            // Changes rarely: the browser may reuse it for a few minutes. Private, not public: the
            // web group attaches the session cookie, which a shared cache must never keep.
            ->setPrivate()
            ->setMaxAge(300);
    }
}
