<?php

namespace App\Http\Controllers;

use App\Models\Design;
use App\Models\Product;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Inertia\Inertia;
use Inertia\Response;

class EditorController extends Controller
{
    public function index(Request $request, ?Product $product = null): Response
    {
        $products = Product::query()
            ->where('active', true)
            ->orderBy('id')
            ->get(['id', 'name', 'slug', 'style', 'construction', 'default_params', 'glb_url', 'thumbnail']);

        $activeProduct = $product ?? $products->first();

        return Inertia::render('editor', [
            'products' => $products,
            'activeProduct' => $activeProduct,
            'savedDesign' => $this->savedDesign($request),
        ]);
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
