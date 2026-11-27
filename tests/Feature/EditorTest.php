<?php

namespace Tests\Feature;

use App\Models\Design;
use Database\Seeders\ProductSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class EditorTest extends TestCase
{
    use RefreshDatabase;

    public function test_editor_page_loads_with_seeded_products(): void
    {
        $this->seed(ProductSeeder::class);

        $response = $this->get('/editor');

        $response->assertOk();
    }

    public function test_editor_page_loads_specific_product_by_slug(): void
    {
        $this->seed(ProductSeeder::class);

        $response = $this->get('/editor/rigid-lid-base');

        $response->assertOk();
    }

    public function test_editor_reopens_the_visitors_own_saved_design(): void
    {
        $this->seed(ProductSeeder::class);
        $id = $this->postJson('/api/designs', [
            'name' => 'Saved box',
            'data' => [
                'source' => ['kind' => 'parametric', 'params' => ['style' => 'tray', 'length' => 180, 'width' => 120, 'depth' => 45, 'thickness' => 0.5, 'unit' => 'mm', 'construction' => 'folding']],
                'outside' => [], 'inside' => [], 'faceColors' => [], 'material' => 'kraft',
            ],
        ])->json('data.id');

        $this->get("/editor?design={$id}")
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('editor')
                ->where('savedDesign.id', $id)
                ->where('savedDesign.name', 'Saved box')
                ->where('savedDesign.data.material', 'kraft'));
    }

    public function test_editor_ignores_someone_elses_design(): void
    {
        $this->seed(ProductSeeder::class);
        $design = Design::create([
            'name' => 'Not yours',
            'data' => ['source' => ['kind' => 'parametric'], 'outside' => [], 'inside' => [], 'faceColors' => [], 'material' => 'white'],
            'session_id' => 'someone-else',
        ]);

        $this->get("/editor?design={$design->id}")
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page->where('savedDesign', null));

        $this->get('/editor?design=abc')->assertOk()->assertInertia(fn (AssertableInertia $page) => $page->where('savedDesign', null));
    }
}
