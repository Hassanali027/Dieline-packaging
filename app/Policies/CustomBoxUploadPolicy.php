<?php

namespace App\Policies;

use App\Models\CustomBoxUpload;
use App\Models\User;
use App\Support\GuestKey;

/** The uploader (by session guest key) and staff can see an upload; only staff review it. */
class CustomBoxUploadPolicy
{
    public function viewAny(?User $user): bool
    {
        return (bool) $user?->is_admin;
    }

    public function view(?User $user, CustomBoxUpload $upload): bool
    {
        return (bool) $user?->is_admin || ($upload->owner !== null && $upload->owner === GuestKey::for(request()));
    }

    public function update(?User $user, CustomBoxUpload $upload): bool
    {
        return (bool) $user?->is_admin;
    }

    public function delete(?User $user, CustomBoxUpload $upload): bool
    {
        return (bool) $user?->is_admin;
    }

    public function deleteAny(?User $user): bool
    {
        return (bool) $user?->is_admin;
    }

    public function create(?User $user): bool
    {
        // Uploads come from customers through the API, not from the admin panel.
        return false;
    }
}
