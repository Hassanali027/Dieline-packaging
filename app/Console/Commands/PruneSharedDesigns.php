<?php

namespace App\Console\Commands;

use App\Models\SharedDesign;
use Illuminate\Console\Command;

class PruneSharedDesigns extends Command
{
    protected $signature = 'share:prune';

    protected $description = 'Delete share links that have expired';

    public function handle(): int
    {
        $deleted = SharedDesign::query()->where('expires_at', '<', now())->delete();
        $this->info("Deleted {$deleted} expired share link(s).");

        return self::SUCCESS;
    }
}
