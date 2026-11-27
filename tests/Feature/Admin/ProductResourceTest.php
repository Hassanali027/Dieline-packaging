<?php

namespace Tests\Feature\Admin;

use App\Models\Product;
use App\Models\User;
use Database\Seeders\ProductSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class ProductResourceTest extends TestCase
{
    use RefreshDatabase;

    public function test_admin_can_open_the_product_list_and_edit_page(): void
    {
        $this->seed(ProductSeeder::class);
        $admin = User::factory()->create(['is_admin' => true]);
        $product = Product::where('slug', 'rigid-lid-base')->firstOrFail();

        $this->actingAs($admin)->get('/admin/products')->assertOk()->assertSee('Mailer Box');
        $this->actingAs($admin)->get("/admin/products/{$product->id}/edit")->assertOk()->assertSee('Rigid box settings');
        $this->actingAs($admin)->get('/admin/products/create')->assertOk();
    }

    public function test_customers_without_is_admin_get_a_403(): void
    {
        $this->actingAs(User::factory()->create())->get('/admin/products')->assertForbidden();
    }

    public function test_guests_are_sent_to_the_admin_login(): void
    {
        $this->get('/admin/products')->assertRedirect('/admin/login');
    }

    public function test_saving_keeps_default_params_in_sync_with_the_product(): void
    {
        $product = Product::create([
            'name' => 'Test Tray',
            'slug' => 'test-tray',
            'style' => 'tray',
            'construction' => 'folding',
            'default_params' => ['length' => '180', 'width' => '120', 'depth' => '45', 'thickness' => '0.5', 'unit' => 'mm', 'rigid' => ['turnIn' => 18]],
            'active' => true,
        ]);

        $params = $product->fresh()->default_params;
        $this->assertSame('tray', $params['style']);
        $this->assertSame('folding', $params['construction']);
        $this->assertEquals(180, $params['length']);
        $this->assertArrayNotHasKey('rigid', $params);
    }
}
