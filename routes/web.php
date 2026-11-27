<?php

use App\Http\Controllers\Admin\QuoteFileController;
use App\Http\Controllers\Api\DesignController;
use App\Http\Controllers\Api\QuoteController;
use App\Http\Controllers\Api\ShareController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\EditorController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::get('/editor/{product:slug?}', [EditorController::class, 'index'])->name('editor');
// Read-only shared design (expires; see config/dieline.php).
Route::get('/s/{token}', [EditorController::class, 'shared'])->where('token', '[A-Za-z0-9]{32}')->name('share.show');

// JSON endpoints for the editor. They live in the web group on purpose: guests are
// identified by their session and requests are CSRF-protected (X-XSRF-TOKEN header).
Route::prefix('api')->name('api.')->middleware('throttle:120,1')->group(function () {
    Route::get('uploads', [UploadController::class, 'index'])->name('uploads.index');
    Route::post('uploads', [UploadController::class, 'store'])->middleware('throttle:30,1')->name('uploads.store');

    Route::apiResource('designs', DesignController::class);

    Route::post('share', [ShareController::class, 'store'])->middleware('throttle:shares')->name('share.store');
    Route::post('quotes', [QuoteController::class, 'store'])->middleware('throttle:quotes')->name('quotes.store');
});

Route::middleware(['auth'])->group(function () {
    Route::get('admin-files/quotes/{quote}/{field}', QuoteFileController::class)->name('admin.quote-file');

    Route::get('dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
