<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->string('disk', 32)->default('public')->after('id');
            $table->string('path')->nullable()->after('disk');
            $table->string('thumbnail_path')->nullable()->after('path');
            $table->string('original_name')->nullable()->after('thumbnail_path');
            $table->string('mime', 100)->nullable()->after('original_name');
            $table->unsignedBigInteger('size')->nullable()->after('mime');
            $table->unsignedInteger('width')->nullable()->after('size');
            $table->unsignedInteger('height')->nullable()->after('width');
        });
    }

    public function down(): void
    {
        Schema::table('assets', function (Blueprint $table) {
            $table->dropColumn(['disk', 'path', 'thumbnail_path', 'original_name', 'mime', 'size', 'width', 'height']);
        });
    }
};
