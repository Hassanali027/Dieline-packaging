<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Custom box uploads (Sprint 3): keep the original file's details, the converted file the
 * editor uses (SVG / GLB), what the checks found, and the admin's review.
 *
 * status: pending (processing) → ready (customer can design) | needs-review (automatic
 * processing failed, admin queue) → approved | rejected.
 *
 * Written to be safe to re-run: MySQL does not roll back DDL, so a half-applied run must not
 * block the next one.
 */
return new class extends Migration
{
    private const COLUMNS = ['original_name', 'mime', 'size', 'converted_file', 'meta', 'error', 'review_notes', 'reviewed_at'];

    public function up(): void
    {
        // The enum had no "ready"; a string keeps future statuses migration-free. (The index already exists.)
        Schema::table('custom_box_uploads', function (Blueprint $table) {
            $table->string('status', 20)->default('pending')->change();
        });

        $add = fn (string $column) => ! Schema::hasColumn('custom_box_uploads', $column);

        Schema::table('custom_box_uploads', function (Blueprint $table) use ($add) {
            if ($add('original_name')) {
                $table->string('original_name')->nullable()->after('file');
            }
            if ($add('mime')) {
                $table->string('mime', 100)->nullable()->after('original_name');
            }
            if ($add('size')) {
                $table->unsignedBigInteger('size')->nullable()->after('mime');
            }
            if ($add('converted_file')) {
                $table->string('converted_file')->nullable()->after('size');
            }
            if ($add('meta')) {
                $table->json('meta')->nullable()->after('fold_mapping');
            }
            if ($add('error')) {
                $table->text('error')->nullable()->after('meta');
            }
            if ($add('review_notes')) {
                $table->text('review_notes')->nullable()->after('reviewed_by');
            }
            if ($add('reviewed_at')) {
                $table->timestamp('reviewed_at')->nullable()->after('review_notes');
            }
        });
    }

    public function down(): void
    {
        $existing = array_values(array_filter(self::COLUMNS, fn ($c) => Schema::hasColumn('custom_box_uploads', $c)));
        Schema::table('custom_box_uploads', function (Blueprint $table) use ($existing) {
            $table->dropColumn($existing);
        });
    }
};
