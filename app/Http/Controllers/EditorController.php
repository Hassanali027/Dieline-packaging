<?php

namespace App\Http\Controllers;

use App\Models\Product;
use Inertia\Inertia;
use Inertia\Response;

class EditorController extends Controller
{
    public function index(?Product $product = null): Response
    {
        $products = Product::query()
            ->where('active', true)
            ->orderBy('id')
            ->get(['id', 'name', 'slug', 'style', 'construction', 'default_params', 'glb_url', 'thumbnail']);

        $activeProduct = $product ?? $products->first();

        return Inertia::render('editor', [
            'products' => $products,
            'activeProduct' => $activeProduct,
        ]);
    }
}
