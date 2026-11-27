<?php

namespace App\Policies;

use App\Models\Design;
use App\Models\User;
use App\Support\GuestKey;

/**
 * Owner = the logged-in user who saved it, or the guest whose session key saved it.
 * Others get a 403 (shared read-only links come later via /s/{token}).
 */
class DesignPolicy
{
    public function view(?User $user, Design $design): bool
    {
        return $this->owns($user, $design);
    }

    public function update(?User $user, Design $design): bool
    {
        return $this->owns($user, $design);
    }

    public function delete(?User $user, Design $design): bool
    {
        return $this->owns($user, $design);
    }

    private function owns(?User $user, Design $design): bool
    {
        if ($user && $design->user_id === $user->id) {
            return true;
        }

        return $design->session_id !== null && $design->session_id === GuestKey::for(request());
    }
}
