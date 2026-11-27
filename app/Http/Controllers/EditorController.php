<?php

namespace App\Http\Controllers;

use App\Models\Design;
use App\Models\Product;
use App\Models\SharedDesign;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class EditorController extends Controller
{
    public function index(Request $request, ?Product $product = null): Response
    {
        $products = $this->products();
        $activeProduct = $product ?? $products->first();

        return Inertia::render('editor', [
            'products' => $products,
            'activeProduct' => $activeProduct,
            'savedDesign' => $this->savedDesign($request),
            'sharedDesign' => null,
        ]);
    }

    /** /s/{token}: the shared design, read-only, until the link expires. */
    public function shared(string $token): Response
    {
        $share = SharedDesign::where('token', $token)->first();
        abort_if(! $share, 404);
        abort_if($share->isExpired(), 410, 'This share link has expired.');

        $products = $this->products();
        $style = data_get($share->design_data, 'source.params.style');

        return Inertia::render('editor', [
            'products' => $products,
            'activeProduct' => $products->firstWhere('style', $style) ?? $products->first(),
            'savedDesign' => null,
            'sharedDesign' => [
                'token' => $share->token,
                'data' => $share->design_data,
                'expires_at' => $share->expires_at->toIso8601String(),
            ],
        ]);
    }

    private function products()
    {
        return Product::query()
            ->where('active', true)
            ->orderBy('id')
            ->get(['id', 'name', 'slug', 'style', 'construction', 'default_params', 'glb_url', 'thumbnail']);
    }

    /**
     * ?design={id} reopens a saved design, but only for its owner (same rule as the API).
     * Anyone else just gets the empty editor rather than an error page.
     */
    private function savedDesign(Request $request): ?array
    {
        $id = $request->query('design');
        if (! is_numeric($id)) {
            return null;
        }

        $design = Design::find((int) $id);
        if (! $design || Gate::denies('view', $design)) {
            return null;
        }

        return $design->only(['id', 'name', 'data', 'updated_at']);
    }
}
