<?php

namespace Tests\Feature\Api;

use App\Jobs\SendQuoteMails;
use App\Mail\NewQuoteRequest;
use App\Mail\QuoteReceived;
use App\Models\Design;
use App\Models\Quote;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class QuoteTest extends TestCase
{
    use RefreshDatabase;

    /** A real 1×1 PNG. */
    private const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

    private function payload(array $extra = []): array
    {
        return [
            'customer_name' => 'Bilal',
            'customer_email' => 'bilal@example.com',
            'customer_phone' => '+92 300 1111111',
            'company_name' => 'Bilal Sweets',
            'length' => 220, 'width' => 160, 'depth' => 70, 'unit' => 'mm',
            'quantity' => 500,
            'construction' => 'corrugated',
            'finishes' => ['matte'],
            'notes' => 'Gold logo on the lid',
            ...$extra,
        ];
    }

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    public function test_it_stores_the_quote_with_previews_and_queues_the_mails(): void
    {
        Queue::fake();

        $id = $this->postJson('/api/quotes', $this->payload(['outside_png' => self::PNG]))
            ->assertCreated()
            ->assertJsonPath('data.status', 'new')
            ->json('data.id');

        $quote = Quote::findOrFail($id);
        $this->assertSame(500, $quote->quantity);
        $this->assertSame(['matte'], $quote->finishes);
        $this->assertSame("quotes/{$id}/outside.png", $quote->outside_png);
        Storage::disk('local')->assertExists($quote->outside_png);
        Queue::assertPushed(SendQuoteMails::class);
    }

    public function test_the_job_mails_the_customer_and_the_admin(): void
    {
        Mail::fake();
        config(['dieline.quote_admin_email' => 'sales@example.com']);
        $quote = Quote::create($this->payload(['status' => 'new']));

        (new SendQuoteMails($quote))->handle();

        Mail::assertSent(QuoteReceived::class, fn ($m) => $m->hasTo('bilal@example.com'));
        Mail::assertSent(NewQuoteRequest::class, fn ($m) => $m->hasTo('sales@example.com') && $m->hasReplyTo('bilal@example.com'));
    }

    public function test_the_mails_render(): void
    {
        $quote = Quote::create($this->payload(['status' => 'new']));
        $this->assertStringContainsString('220', (new QuoteReceived($quote))->render());
        $this->assertStringContainsString('Gold logo on the lid', (new NewQuoteRequest($quote))->render());
    }

    public function test_it_ignores_previews_that_are_not_png(): void
    {
        Queue::fake();
        $fake = 'data:image/png;base64,'.base64_encode('<?php echo 1; ?>');

        $id = $this->postJson('/api/quotes', $this->payload(['outside_png' => $fake]))->assertCreated()->json('data.id');

        $this->assertNull(Quote::find($id)->outside_png);
    }

    public function test_it_validates_and_protects_other_peoples_designs(): void
    {
        $this->postJson('/api/quotes', ['quantity' => 0])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['customer_name', 'customer_email', 'length', 'quantity', 'unit']);

        $other = Design::create(['name' => 'x', 'data' => [], 'session_id' => 'someone-else']);
        $this->postJson('/api/quotes', $this->payload(['design_id' => $other->id]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('design_id');
    }

    public function test_it_rate_limits_quote_requests(): void
    {
        Queue::fake();
        config(['dieline.quote_rate_per_minute' => 2]);

        $this->postJson('/api/quotes', $this->payload())->assertCreated();
        $this->postJson('/api/quotes', $this->payload())->assertCreated();
        $this->postJson('/api/quotes', $this->payload())->assertTooManyRequests();
    }
}
