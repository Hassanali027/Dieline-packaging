<?php

namespace Tests\Feature\Api;

use Database\Seeders\ProductSeeder;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class TurnstileTest extends TestCase
{
    use RefreshDatabase;

    private const VERIFY = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';

    protected function setUp(): void
    {
        parent::setUp();
        Queue::fake();
        Storage::fake('local');
    }

    private function quote(array $extra = []): array
    {
        return [
            'customer_name' => 'Test User',
            'customer_email' => 'test@example.com',
            'customer_phone' => '+1 555 0100',
            'length' => 220, 'width' => 160, 'depth' => 70, 'unit' => 'mm',
            'quantity' => 100,
            ...$extra,
        ];
    }

    private function share(array $extra = []): array
    {
        return [
            'customer_name' => 'Test User',
            'customer_email' => 'test@example.com',
            'customer_phone' => '+1 555 0100',
            'design' => [
                'source' => ['kind' => 'parametric', 'params' => ['style' => 'mailer', 'length' => 220, 'width' => 160, 'depth' => 70, 'thickness' => 1.5, 'unit' => 'mm']],
                'outside' => [],
                'inside' => [],
                'faceColors' => [],
                'material' => 'kraft',
            ],
            ...$extra,
        ];
    }

    private function enable(): void
    {
        config(['dieline.turnstile.site_key' => 'site-key', 'dieline.turnstile.secret' => 'secret-key']);
    }

    public function test_forms_work_without_a_token_while_turnstile_is_off(): void
    {
        Http::fake();

        $this->postJson('/api/quotes', $this->quote())->assertCreated();
        $this->postJson('/api/share', $this->share())->assertCreated();
        Http::assertNothingSent();
    }

    public function test_a_token_is_required_once_turnstile_is_on(): void
    {
        $this->enable();
        Http::fake();

        $this->postJson('/api/quotes', $this->quote())->assertUnprocessable()->assertJsonValidationErrors('turnstile_token');
        $this->postJson('/api/share', $this->share())->assertUnprocessable()->assertJsonValidationErrors('turnstile_token');
    }

    public function test_cloudflare_confirms_the_token(): void
    {
        $this->enable();
        Http::fake([self::VERIFY => Http::response(['success' => true])]);

        $this->postJson('/api/quotes', $this->quote(['turnstile_token' => 'good-token']))->assertCreated();

        Http::assertSent(fn (Request $request) => $request->url() === self::VERIFY
            && $request['secret'] === 'secret-key'
            && $request['response'] === 'good-token');
    }

    public function test_a_rejected_or_unreachable_check_blocks_the_form(): void
    {
        $this->enable();
        Http::fake([self::VERIFY => Http::response(['success' => false, 'error-codes' => ['invalid-input-response']])]);
        $this->postJson('/api/share', $this->share(['turnstile_token' => 'bad']))->assertUnprocessable()->assertJsonValidationErrors('turnstile_token');

        Http::fake([self::VERIFY => Http::response('', 500)]);
        $this->postJson('/api/quotes', $this->quote(['turnstile_token' => 'any']))->assertUnprocessable();
    }

    public function test_the_site_key_reaches_the_editor_only_when_enabled(): void
    {
        $this->seed(ProductSeeder::class);
        $this->get('/editor')->assertInertia(fn ($page) => $page->where('turnstileSiteKey', null));

        $this->enable();
        $this->get('/editor')->assertInertia(fn ($page) => $page->where('turnstileSiteKey', 'site-key'));
    }
}
