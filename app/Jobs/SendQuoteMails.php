<?php

namespace App\Jobs;

use App\Mail\NewQuoteRequest;
use App\Mail\QuoteReceived;
use App\Models\Quote;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Mail;

/** Confirmation to the customer and the full request (with previews) to the admin. */
class SendQuoteMails implements ShouldQueue
{
    use Queueable;

    public int $tries = 3;

    public array $backoff = [30, 120];

    public function __construct(public Quote $quote) {}

    public function handle(): void
    {
        Mail::to($this->quote->customer_email, $this->quote->customer_name)->send(new QuoteReceived($this->quote));

        $admin = config('dieline.quote_admin_email');
        if ($admin) {
            Mail::to($admin)->send(new NewQuoteRequest($this->quote));
        }
    }
}
