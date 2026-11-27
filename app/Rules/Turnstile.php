<?php

namespace App\Rules;

use Closure;
use Illuminate\Contracts\Validation\ValidationRule;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * Cloudflare Turnstile check for the public forms (Share, Quote). The browser widget hands the
 * form a one-time token; Cloudflare confirms it was solved by a person on this site.
 * When no secret is configured (local development) the rule lets everything through.
 */
class Turnstile implements ValidationRule
{
    /** Run even when the token is missing (Laravel skips non-implicit rules for absent fields). */
    public bool $implicit = true;

    public function __construct(private readonly ?string $ip = null) {}

    public static function enabled(): bool
    {
        return filled(config('dieline.turnstile.secret'));
    }

    public function validate(string $attribute, mixed $value, Closure $fail): void
    {
        if (! self::enabled()) {
            return;
        }
        if (! is_string($value) || $value === '' || strlen($value) > 2048) {
            $fail('Please complete the security check.');

            return;
        }

        try {
            $response = Http::asForm()
                ->timeout(8)
                ->post(config('dieline.turnstile.verify_url'), array_filter([
                    'secret' => config('dieline.turnstile.secret'),
                    'response' => $value,
                    'remoteip' => $this->ip,
                ]));
        } catch (Throwable $e) {
            Log::warning('Turnstile verification failed to run', ['error' => $e->getMessage()]);
            $fail('The security check could not be verified. Please try again.');

            return;
        }

        if (! $response->ok() || $response->json('success') !== true) {
            $fail('The security check failed. Please try again.');
        }
    }
}
