<?php

namespace Database\Seeders;

use App\Models\Material;
use App\Models\Product;
use Illuminate\Database\Seeder;

class ProductSeeder extends Seeder
{
    public function run(): void
    {
        $products = [
            [
                'name' => 'Mailer Box',
                'slug' => 'mailer-box',
                'style' => 'mailer',
                'construction' => 'corrugated',
                'default_params' => ['style' => 'mailer', 'length' => 220, 'width' => 160, 'depth' => 70, 'thickness' => 1.5, 'unit' => 'mm', 'construction' => 'corrugated'],
            ],
            [
                'name' => 'Reverse Tuck Box',
                'slug' => 'reverse-tuck',
                'style' => 'reverse-tuck',
                'construction' => 'folding',
                'default_params' => ['style' => 'reverse-tuck', 'length' => 100, 'width' => 60, 'depth' => 140, 'thickness' => 0.4, 'unit' => 'mm', 'construction' => 'folding'],
            ],
            [
                'name' => 'Straight Tuck Box',
                'slug' => 'straight-tuck',
                'style' => 'straight-tuck',
                'construction' => 'folding',
                'default_params' => ['style' => 'straight-tuck', 'length' => 100, 'width' => 60, 'depth' => 140, 'thickness' => 0.4, 'unit' => 'mm', 'construction' => 'folding'],
            ],
            [
                'name' => 'Burger Box',
                'slug' => 'burger-box',
                'style' => 'burger',
                'construction' => 'folding',
                'default_params' => ['style' => 'burger', 'length' => 115, 'width' => 115, 'depth' => 85, 'thickness' => 0.4, 'unit' => 'mm', 'construction' => 'folding'],
            ],
            [
                'name' => 'Open Tray',
                'slug' => 'tray',
                'style' => 'tray',
                'construction' => 'folding',
                'default_params' => ['style' => 'tray', 'length' => 180, 'width' => 120, 'depth' => 45, 'thickness' => 0.5, 'unit' => 'mm', 'construction' => 'folding'],
            ],
            [
                'name' => 'Box Sleeve',
                'slug' => 'sleeve',
                'style' => 'sleeve',
                'construction' => 'folding',
                'default_params' => ['style' => 'sleeve', 'length' => 150, 'width' => 100, 'depth' => 40, 'thickness' => 0.35, 'unit' => 'mm', 'construction' => 'folding'],
            ],
            [
                'name' => 'Rigid Lid & Base',
                'slug' => 'rigid-lid-base',
                'style' => 'rigid-lid-base',
                'construction' => 'rigid',
                'default_params' => [
                    'style' => 'rigid-lid-base',
                    'length' => 200,
                    'width' => 150,
                    'depth' => 60,
                    'thickness' => 2.0,
                    'unit' => 'mm',
                    'construction' => 'rigid',
                    'rigid' => ['boardThickness' => 2.0, 'turnIn' => 18, 'lidDepth' => 30, 'lidClearance' => 1.5],
                ],
            ],
            [
                'name' => 'Rigid Magnetic Closure',
                'slug' => 'rigid-magnetic',
                'style' => 'rigid-magnetic',
                'construction' => 'rigid',
                'default_params' => [
                    'style' => 'rigid-magnetic',
                    'length' => 220,
                    'width' => 160,
                    'depth' => 70,
                    'thickness' => 2.0,
                    'unit' => 'mm',
                    'construction' => 'rigid',
                    'rigid' => ['boardThickness' => 2.0, 'turnIn' => 18, 'magnet' => true],
                ],
            ],
            [
                'name' => 'Rigid Drawer Box',
                'slug' => 'rigid-drawer',
                'style' => 'rigid-drawer',
                'construction' => 'rigid',
                'default_params' => [
                    'style' => 'rigid-drawer',
                    'length' => 180,
                    'width' => 120,
                    'depth' => 45,
                    'thickness' => 2.0,
                    'unit' => 'mm',
                    'construction' => 'rigid',
                    'rigid' => ['boardThickness' => 2.0, 'turnIn' => 16, 'lidClearance' => 1.5, 'ribbonPull' => true],
                ],
            ],
            [
                'name' => 'Rigid Shoulder & Neck',
                'slug' => 'rigid-shoulder',
                'style' => 'rigid-shoulder',
                'construction' => 'rigid',
                'default_params' => [
                    'style' => 'rigid-shoulder',
                    'length' => 180,
                    'width' => 130,
                    'depth' => 75,
                    'thickness' => 2.0,
                    'unit' => 'mm',
                    'construction' => 'rigid',
                    'rigid' => ['boardThickness' => 2.0, 'turnIn' => 18, 'lidDepth' => 35, 'lidClearance' => 1.5, 'shoulderHeight' => 20],
                ],
            ],
            [
                'name' => 'Rigid Book Style',
                'slug' => 'rigid-book',
                'style' => 'rigid-book',
                'construction' => 'rigid',
                'default_params' => [
                    'style' => 'rigid-book',
                    'length' => 210,
                    'width' => 150,
                    'depth' => 55,
                    'thickness' => 2.0,
                    'unit' => 'mm',
                    'construction' => 'rigid',
                    'rigid' => ['boardThickness' => 2.0, 'turnIn' => 18],
                ],
            ],
        ];

        foreach ($products as $product) {
            Product::updateOrCreate(['slug' => $product['slug']], $product + ['active' => true]);
        }

        $materials = [
            ['name' => 'White SBS / Coated', 'slug' => 'white', 'category' => 'standard', 'properties' => ['color' => '#ffffff', 'roughness' => 0.45]],
            ['name' => 'Natural Kraft', 'slug' => 'kraft', 'category' => 'standard', 'properties' => ['color' => '#c29b6f', 'roughness' => 0.85]],
            ['name' => 'Transparent / Clear', 'slug' => 'transparent', 'category' => 'specialty', 'properties' => ['transmission' => 0.9, 'roughness' => 0.15]],
            ['name' => 'Wrap Paper', 'slug' => 'wrap-paper', 'category' => 'rigid', 'properties' => ['color' => '#f8fafc', 'roughness' => 0.55]],
            ['name' => 'Linen Texture', 'slug' => 'linen', 'category' => 'rigid', 'properties' => ['color' => '#ebe6dd', 'roughness' => 0.8]],
            ['name' => 'Leatherette', 'slug' => 'leatherette', 'category' => 'rigid', 'properties' => ['color' => '#2b2b2b', 'roughness' => 0.65]],
        ];

        foreach ($materials as $material) {
            Material::updateOrCreate(['slug' => $material['slug']], $material + ['active' => true]);
        }
    }
}
