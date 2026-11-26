<?php

namespace Tests\Feature;

use Database\Seeders\ProductSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
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
}
