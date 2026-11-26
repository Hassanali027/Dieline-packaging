<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('patterns', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->longText('svg');
            $table->string('image')->nullable();
            $table->string('category')->nullable()->index();
            $table->boolean('active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('icons', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->longText('svg');
            $table->string('category')->nullable()->index();
            $table->boolean('active')->default(true)->index();
            $table->timestamps();
        });

        Schema::create('materials', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('image')->nullable();
            $table->string('category')->nullable()->index();
            $table->json('properties')->nullable();
            $table->boolean('active')->default(true)->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('materials');
        Schema::dropIfExists('icons');
        Schema::dropIfExists('patterns');
    }
};
