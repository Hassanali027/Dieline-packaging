<?php

use App\Http\Controllers\Api\DesignController;
use App\Http\Controllers\Api\UploadController;
use App\Http\Controllers\EditorController;
use Illuminate\Support\Facades\Route;
use Inertia\Inertia;

Route::get('/', function () {
    return Inertia::render('welcome');
})->name('home');

Route::get('/editor/{product:slug?}', [EditorController::class, 'index'])->name('editor');

// JSON endpoints for the editor. They live in the web group on purpose: guests are
// identified by their session and requests are CSRF-protected (X-XSRF-TOKEN header).
Route::prefix('api')->name('api.')->middleware('throttle:120,1')->group(function () {
    Route::get('uploads', [UploadController::class, 'index'])->name('uploads.index');
    Route::post('uploads', [UploadController::class, 'store'])->middleware('throttle:30,1')->name('uploads.store');

    Route::apiResource('designs', DesignController::class);
});

Route::middleware(['auth'])->group(function () {
    Route::get('dashboard', function () {
        return Inertia::render('dashboard');
    })->name('dashboard');
});

require __DIR__.'/settings.php';
require __DIR__.'/auth.php';
