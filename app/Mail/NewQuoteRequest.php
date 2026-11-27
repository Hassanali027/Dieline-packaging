<?php

namespace App\Mail;

use App\Models\Quote;
use Illuminate\Bus\Queueable;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Address;
use Illuminate\Mail\Mailables\Attachment;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;
use Illuminate\Support\Facades\Storage;

class NewQuoteRequest extends Mailable
{
    use Queueable;

    public function __construct(public Quote $quote) {}

    public function envelope(): Envelope
    {
        return new Envelope(
            subject: "New quote request #{$this->quote->id} — {$this->quote->customer_name}",
            replyTo: [new Address($this->quote->customer_email, $this->quote->customer_name)],
        );
    }

    public function content(): Content
    {
        return new Content(markdown: 'mail.quotes.new');
    }

    /**
     * @return array<int, Attachment>
     */
    public function attachments(): array
    {
        $files = [];
        foreach (['outside_png' => 'outside.png', 'inside_png' => 'inside.png'] as $field => $name) {
            $path = $this->quote->{$field};
            if ($path && Storage::disk('local')->exists($path)) {
                $files[] = Attachment::fromStorageDisk('local', $path)->as("quote-{$this->quote->id}-{$name}")->withMime('image/png');
            }
        }

        return $files;
    }
}
