<?php

namespace Database\Seeders;

use App\Models\Icon;
use App\Models\Material;
use App\Models\Pattern;
use Illuminate\Database\Seeder;

/**
 * Starter content for the editor library (icons, patterns, materials). Safe to run again:
 * rows are matched by name / slug and updated, never duplicated. Admins add more in Filament.
 */
class LibrarySeeder extends Seeder
{
    private const INK = '#0f172a';

    public function run(): void
    {
        foreach ($this->materials() as $slug => [$name, $category, $properties]) {
            Material::updateOrCreate(['slug' => $slug], ['name' => $name, 'category' => $category, 'properties' => $properties, 'active' => true]);
        }

        foreach ($this->icons() as $name => [$category, $body]) {
            Icon::updateOrCreate(['name' => $name], ['category' => $category, 'svg' => $this->svg('0 0 24 24', $body), 'active' => true]);
        }

        foreach ($this->patterns() as $name => [$category, $viewBox, $body]) {
            Pattern::updateOrCreate(['name' => $name], ['category' => $category, 'svg' => $this->svg($viewBox, $body), 'active' => true]);
        }
    }

    private function svg(string $viewBox, string $body): string
    {
        return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="'.$viewBox.'">'.$body.'</svg>';
    }

    /**
     * The editor's built-in materials (resources/js/lib/three/materials.ts), so admin and editor start in sync.
     *
     * @return array<string, array{0: string, 1: string, 2: array<string, mixed>}>
     */
    private function materials(): array
    {
        $boards = ['folding', 'corrugated'];

        return [
            'white' => ['White', 'board', ['outside' => '#f8fafc', 'inside' => '#eef1f4', 'roughness' => 0.78, 'bumpScale' => 0, 'constructions' => [...$boards, 'rigid']]],
            'kraft' => ['Kraft', 'board', ['outside' => '#c8a27a', 'inside' => '#b98f63', 'roughness' => 0.92, 'bumpScale' => 0.14, 'constructions' => [...$boards, 'rigid']]],
            'transparent' => ['Transparent', 'board', ['outside' => '#e6f0f7', 'inside' => '#e6f0f7', 'roughness' => 0.15, 'bumpScale' => 0, 'constructions' => ['folding']]],
            'wrap-paper' => ['Wrap Paper', 'wrap', ['outside' => '#f4f1ea', 'inside' => '#e9e4d8', 'roughness' => 0.68, 'bumpScale' => 0.08, 'constructions' => ['rigid']]],
            'linen' => ['Linen', 'wrap', ['outside' => '#ede7dc', 'inside' => '#e2dacb', 'roughness' => 0.88, 'bumpScale' => 0.35, 'constructions' => ['rigid']]],
            'leatherette' => ['Leatherette', 'wrap', ['outside' => '#2b2d34', 'inside' => '#3a3d45', 'roughness' => 0.56, 'bumpScale' => 0.45, 'constructions' => ['rigid']]],
        ];
    }

    /** @return array<string, array{0: string, 1: string}> */
    private function icons(): array
    {
        $ink = self::INK;
        $line = 'fill="none" stroke="'.$ink.'" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';

        return [
            'This side up' => ['Handling', '<path '.$line.' d="M7 20V5M4 8l3-3 3 3M17 20V5M14 8l3-3 3 3"/><path '.$line.' d="M3 21h18"/>'],
            'Fragile' => ['Handling', '<path '.$line.' d="M7 3h10l-1 6a4 4 0 0 1-8 0L7 3zM12 13v7M8 21h8"/><path '.$line.' d="M11 3l1.5 3-2 2"/>'],
            'Keep dry' => ['Handling', '<path '.$line.' d="M3 12a9 9 0 0 1 18 0H3zM12 12v6a2 2 0 0 0 4 0"/><path '.$line.' d="M6 4l-1 2M10 2.5l-.5 1.5M18 4l1 2"/>'],
            'Recyclable' => ['Eco', '<path '.$line.' d="M9 5.5l3-3 3 3M12 2.5v7M4.5 15l-1.5 4h4.5M3 19l5-8.5M19.5 15l1.5 4h-4.5M21 19l-5-8.5M8 21h8"/>'],
            'Leaf' => ['Eco', '<path '.$line.' d="M5 19c0-8 5-14 15-15-1 10-7 15-15 15zM5 19l8-8"/>'],
            'Heart' => ['Decorative', '<path fill="'.$ink.'" d="M12 20.5l-1.4-1.3C5.4 14.6 2 11.5 2 7.7 2 4.6 4.4 2.2 7.5 2.2c1.7 0 3.4.8 4.5 2.1 1.1-1.3 2.8-2.1 4.5-2.1 3.1 0 5.5 2.4 5.5 5.5 0 3.8-3.4 6.9-8.6 11.5L12 20.5z"/>'],
            'Star' => ['Decorative', '<path fill="'.$ink.'" d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5-4.8-4.6 6.6-.9z"/>'],
            'Badge check' => ['Decorative', '<circle '.$line.' cx="12" cy="12" r="9"/><path '.$line.' d="M8 12.5l2.5 2.5L16 9.5"/>'],
            'Box' => ['Shipping', '<path '.$line.' d="M3 7.5L12 3l9 4.5v9L12 21l-9-4.5v-9zM3 7.5l9 4.5 9-4.5M12 12v9"/>'],
            'Truck' => ['Shipping', '<path '.$line.' d="M2 6h11v10H2zM13 9h4l4 4v3h-8zM6 19a2 2 0 1 0 0-.01M17 19a2 2 0 1 0 0-.01"/>'],
        ];
    }

    /** @return array<string, array{0: string, 1: string, 2: string}> */
    private function patterns(): array
    {
        $ink = self::INK;

        return [
            'Polka dots' => ['Geometric', '0 0 20 20', '<circle cx="5" cy="5" r="2.2" fill="'.$ink.'"/><circle cx="15" cy="15" r="2.2" fill="'.$ink.'"/>'],
            'Diagonal stripes' => ['Geometric', '0 0 20 20', '<path d="M-5 5L5-5M0 20L20 0M15 25L25 15" stroke="'.$ink.'" stroke-width="3"/>'],
            'Grid' => ['Geometric', '0 0 20 20', '<path d="M0 10h20M10 0v20" stroke="'.$ink.'" stroke-width="1.2" fill="none"/>'],
            'Chevron' => ['Geometric', '0 0 24 12', '<path d="M0 10l6-6 6 6 6-6 6 6" stroke="'.$ink.'" stroke-width="2" fill="none"/>'],
            'Waves' => ['Organic', '0 0 40 12', '<path d="M0 6c5-6 10-6 20 0s15 6 20 0" stroke="'.$ink.'" stroke-width="1.6" fill="none"/>'],
        ];
    }
}
