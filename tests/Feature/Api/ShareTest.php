<?php

namespace Tests\Feature\Api;

use App\Models\SharedDesign;
use Database\Seeders\ProductSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Inertia\Testing\AssertableInertia;
use Tests\TestCase;

class ShareTest extends TestCase
{
    use RefreshDatabase;

    private function payload(): array
    {
        return [
            'customer_name' => 'Ayesha',
            'customer_email' => 'ayesha@example.com',
            'customer_phone' => '+92 300 0000000',
            'design' => [
                'source' => ['kind' => 'parametric', 'params' => ['style' => 'tray', 'length' => 180, 'width' => 120, 'depth' => 45, 'thickness' => 0.5, 'unit' => 'mm', 'construction' => 'folding']],
                'outside' => [['id' => 'o1', 'type' => 'text', 'side' => 'outside', 'props' => ['text' => 'Hi']]],
                'inside' => [],
                'faceColors' => [],
                'material' => 'kraft',
            ],
        ];
    }

    public function test_it_creates_an_expiring_share_link_that_opens_read_only(): void
    {
        $this->seed(ProductSeeder::class);

        $response = $this->postJson('/api/share', $this->payload())->assertCreated();
        $token = $response->json('data.token');
        $this->assertSame(32, strlen($token));
        $this->assertStringEndsWith("/s/{$token}", $response->json('data.url'));

        $share = SharedDesign::firstOrFail();
        $this->assertTrue($share->expires_at->between(now()->addDays(29), now()->addDays(31)));

        $this->get("/s/{$token}")
            ->assertOk()
            ->assertInertia(fn (AssertableInertia $page) => $page
                ->component('editor')
                ->where('sharedDesign.token', $token)
                ->where('sharedDesign.data.outside.0.props.text', 'Hi')
                ->where('activeProduct.style', 'tray'));
    }

    public function test_expired_and_unknown_links_do_not_open(): void
    {
        $share = SharedDesign::create([
            'token' => str_repeat('a', 32),
            'design_data' => $this->payload()['design'],
            'customer_name' => 'x', 'customer_email' => 'x@example.com', 'customer_phone' => '1',
            'expires_at' => now()->subDay(),
        ]);

        $this->get("/s/{$share->token}")->assertStatus(410);
        $this->get('/s/'.str_repeat('b', 32))->assertNotFound();
    }

    public function test_it_requires_contact_details(): void
    {
        $this->postJson('/api/share', ['design' => $this->payload()['design']])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['customer_name', 'customer_email', 'customer_phone']);
    }

    public function test_prune_deletes_only_expired_links(): void
    {
        $base = ['design_data' => [], 'customer_name' => 'x', 'customer_email' => 'x@example.com', 'customer_phone' => '1'];
        SharedDesign::create($base + ['token' => str_repeat('a', 32), 'expires_at' => now()->subMinute()]);
        SharedDesign::create($base + ['token' => str_repeat('b', 32), 'expires_at' => now()->addDay()]);

        $this->artisan('share:prune')->expectsOutput('Deleted 1 expired share link(s).')->assertSuccessful();
        $this->assertSame([str_repeat('b', 32)], SharedDesign::pluck('token')->all());
    }
}
