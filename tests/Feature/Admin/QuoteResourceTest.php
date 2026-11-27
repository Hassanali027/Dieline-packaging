<?php

namespace Tests\Feature\Admin;

use App\Models\Design;
use App\Models\Quote;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class QuoteResourceTest extends TestCase
{
    use RefreshDatabase;

    private function quote(array $extra = []): Quote
    {
        return Quote::create([
            'customer_name' => 'Bilal', 'customer_email' => 'bilal@example.com', 'customer_phone' => '1',
            'length' => 220, 'width' => 160, 'depth' => 70, 'unit' => 'mm', 'quantity' => 500, 'status' => 'new',
            ...$extra,
        ]);
    }

    public function test_admin_sees_quotes_and_designs(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $quote = $this->quote();
        Design::create(['name' => 'Guest box', 'data' => ['source' => ['params' => ['style' => 'tray']]], 'session_id' => 's']);

        $this->actingAs($admin)->get('/admin/quotes')->assertOk()->assertSee('Bilal');
        $this->actingAs($admin)->get("/admin/quotes/{$quote->id}/edit")->assertOk()->assertSee('220 × 160 × 70 mm');
        $this->actingAs($admin)->get('/admin/designs')->assertOk()->assertSee('Guest box');
        $this->actingAs($admin)->get('/admin/quotes/create')->assertNotFound();
    }

    public function test_only_admins_download_quote_files(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('quotes/1/outside.png', 'png-bytes');
        $quote = $this->quote(['outside_png' => 'quotes/1/outside.png']);
        $url = "/admin-files/quotes/{$quote->id}/outside_png";

        $this->get($url)->assertRedirect('/login');
        $this->actingAs(User::factory()->create())->get($url)->assertForbidden();
        $this->actingAs(User::factory()->create(['is_admin' => true]))->get($url)->assertOk()->assertDownload("quote-{$quote->id}-outside.png");
        $this->actingAs(User::factory()->create(['is_admin' => true]))->get("/admin-files/quotes/{$quote->id}/notes")->assertNotFound();
    }

    public function test_admins_can_open_any_saved_design(): void
    {
        $design = Design::create(['name' => 'x', 'data' => ['source' => ['kind' => 'parametric'], 'outside' => [], 'inside' => [], 'faceColors' => [], 'material' => 'white'], 'session_id' => 'someone']);
        $this->actingAs(User::factory()->create(['is_admin' => true]))->getJson("/api/designs/{$design->id}")->assertOk();
        $this->actingAs(User::factory()->create())->getJson("/api/designs/{$design->id}")->assertForbidden();
    }
}
