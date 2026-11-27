<?php

namespace Tests\Feature\Api;

use App\Models\Icon;
use App\Models\Material;
use App\Models\Pattern;
use Database\Seeders\LibrarySeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class LibraryTest extends TestCase
{
    use RefreshDatabase;

    public function test_it_lists_the_active_library_for_the_editor(): void
    {
        $this->seed(LibrarySeeder::class);
        Icon::where('name', 'Truck')->update(['active' => false]);

        $response = $this->getJson('/api/library')->assertOk();

        $response->assertJsonCount(9, 'data.icons')
            ->assertJsonCount(5, 'data.patterns')
            ->assertJsonCount(6, 'data.materials')
            ->assertJsonMissing(['name' => 'Truck'])
            ->assertJsonStructure([
                'data' => [
                    'icons' => [['id', 'name', 'category', 'svg', 'src']],
                    'patterns' => [['id', 'name', 'category', 'svg', 'src']],
                    'materials' => [['id', 'slug', 'name', 'category', 'outside', 'inside', 'roughness', 'bumpScale', 'constructions', 'image_url']],
                ],
            ]);

        $icon = collect($response->json('data.icons'))->firstWhere('name', 'Heart');
        $this->assertStringStartsWith('data:image/svg+xml;base64,', $icon['src']);
        $this->assertSame($icon['svg'], base64_decode(substr($icon['src'], strlen('data:image/svg+xml;base64,'))));

        $linen = collect($response->json('data.materials'))->firstWhere('slug', 'linen');
        $this->assertSame(['rigid'], $linen['constructions']);
        $this->assertEquals(0.35, $linen['bumpScale']);
    }

    public function test_the_response_may_be_cached_by_the_browser_only(): void
    {
        $cache = $this->getJson('/api/library')->assertOk()->headers->get('Cache-Control');

        $this->assertStringContainsString('private', $cache);
        $this->assertStringContainsString('max-age=300', $cache);
    }

    public function test_image_patterns_point_to_the_public_file(): void
    {
        Pattern::create(['name' => 'Photo tile', 'image' => 'library/patterns/tile.png', 'active' => true]);
        Material::create(['name' => 'Plain', 'slug' => 'plain', 'category' => 'board', 'properties' => ['outside' => '#ffffff'], 'active' => true]);

        $data = $this->getJson('/api/library')->assertOk()->json('data');

        $this->assertStringEndsWith('/storage/library/patterns/tile.png', $data['patterns'][0]['src']);
        $this->assertNull($data['patterns'][0]['svg']);
        // Missing properties fall back to sensible defaults.
        $this->assertSame('#ffffff', $data['materials'][0]['inside']);
        $this->assertSame(['folding', 'corrugated', 'rigid'], $data['materials'][0]['constructions']);
    }
}
