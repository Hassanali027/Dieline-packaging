<?php

return [
    // Share links (/s/{token}) stop working after this many days; share:prune deletes them.
    'share_days' => (int) env('DIELINE_SHARE_DAYS', 30),

    // Who gets the "new quote request" email. Falls back to the mail "from" address.
    'quote_admin_email' => env('QUOTE_ADMIN_EMAIL', env('MAIL_FROM_ADDRESS')),

    // Quote requests per minute per IP (plan: 5/min).
    'quote_rate_per_minute' => (int) env('QUOTE_RATE_PER_MINUTE', 5),
];
