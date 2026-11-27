<?php

namespace App\Support;

use Illuminate\Http\Request;
use Illuminate\Support\Str;

/**
 * A stable id for a visitor who is not logged in, kept in their session.
 *
 * The session id itself is regenerated on login, so it cannot be used to own designs
 * and uploads; this value is session *data*, which survives that regeneration.
 */
class GuestKey
{
    public const SESSION_KEY = 'guest_key';

    public static function for(Request $request): string
    {
        $session = $request->session();
        $key = $session->get(self::SESSION_KEY);
        if (! is_string($key) || $key === '') {
            $key = (string) Str::uuid();
            $session->put(self::SESSION_KEY, $key);
        }

        return $key;
    }
}
