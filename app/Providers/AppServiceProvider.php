<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Quote requests send two emails each, so they are limited per IP (plan: 5 per minute).
        RateLimiter::for('quotes', fn (Request $request) => Limit::perMinute(config('dieline.quote_rate_per_minute'))->by($request->ip()));
        RateLimiter::for('shares', fn (Request $request) => Limit::perMinute(10)->by($request->ip()));
    }
}
