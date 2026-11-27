<?php

namespace App\Mail;

use App\Models\Quote;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

class QuoteReceived extends Mailable
{
    use Queueable;

    public function __construct(public Quote $quote) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: "We received your quote request #{$this->quote->id}");
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.quotes.received');
    }
}
