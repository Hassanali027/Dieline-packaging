<?php

return [
    // Share links (/s/{token}) stop working after this many days; share:prune deletes them.
    'share_days' => (int) env('DIELINE_SHARE_DAYS', 30),

    // Who gets the "new quote request" email. Falls back to the mail "from" address.
    'quote_admin_email' => env('QUOTE_ADMIN_EMAIL', env('MAIL_FROM_ADDRESS')),

    // Quote requests per minute per IP (plan: 5/min).
    'quote_rate_per_minute' => (int) env('QUOTE_RATE_PER_MINUTE', 5),

    // Cloudflare Turnstile on the public Share and Quote forms (plan: RateLimiter + Turnstile).
    // Off while the secret is empty (local development); set both keys on the live site.
    // Cloudflare's test keys: site 1x00000000000000000000AA, secret 1x0000000000000000000000000000000AA.
    'turnstile' => [
        'site_key' => env('TURNSTILE_SITE_KEY'),
        'secret' => env('TURNSTILE_SECRET_KEY'),
        'verify_url' => 'https://challenges.cloudflare.com/turnstile/v0/siteverify',
    ],

    // Custom box uploads (Sprint 3).
    'custom_boxes' => [
        // poppler's pdftocairo, used to turn PDF / AI dielines into SVG. A full path on Windows,
        // e.g. C:\poppler\Library\bin\pdftocairo.exe. Missing tool = upload goes to admin review.
        'pdftocairo' => env('POPPLER_PDFTOCAIRO', 'pdftocairo'),
        // Node runs scripts/validate-glb.mjs (gltf-validator) for 3D models.
        'node' => env('NODE_BINARY', 'node'),
        // Conversions run in a separate process and are stopped after this many seconds.
        'timeout' => (int) env('CUSTOM_BOX_TIMEOUT', 60),
        // Upload limit in kilobytes (plan: 20 MB).
        'max_kb' => 20480,
    ],
];
