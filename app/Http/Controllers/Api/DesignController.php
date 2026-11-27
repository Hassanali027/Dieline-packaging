<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\SaveDesignRequest;
use App\Models\Design;
use App\Support\GuestKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;

/**
 * Design JSON CRUD. A design belongs to the logged-in user, or to the guest's session key.
 */
class DesignController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $designs = Design::query()
            ->where(fn ($q) => $request->user()
                ? $q->where('user_id', $request->user()->id)->orWhere('session_id', GuestKey::for($request))
                : $q->where('session_id', GuestKey::for($request)))
            ->latest('updated_at')
            ->limit(50)
            ->get(['id', 'name', 'thumbnail', 'created_at', 'updated_at']);

        return response()->json(['data' => $designs]);
    }

    public function store(SaveDesignRequest $request): JsonResponse
    {
        $design = Design::create([
            ...$request->designAttributes(),
            'user_id' => $request->user()?->id,
            'session_id' => GuestKey::for($request),
        ]);

        return response()->json(['data' => $this->present($design)], 201);
    }

    public function show(Design $design): JsonResponse
    {
        Gate::authorize('view', $design);

        return response()->json(['data' => $this->present($design)]);
    }

    public function update(SaveDesignRequest $request, Design $design): JsonResponse
    {
        Gate::authorize('update', $design);
        $design->update($request->designAttributes());

        return response()->json(['data' => $this->present($design->refresh())]);
    }

    public function destroy(Design $design): JsonResponse
    {
        Gate::authorize('delete', $design);
        $design->delete();

        return response()->json(null, 204);
    }

    private function present(Design $design): array
    {
        return $design->only(['id', 'name', 'data', 'thumbnail', 'created_at', 'updated_at']);
    }
}
