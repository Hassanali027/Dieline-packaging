<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('custom_box_uploads', function (Blueprint $table) {
            $table->id();
            $table->enum('kind', ['dieline', 'model', 'photo'])->index();
            $table->string('file');
            $table->json('parsed_panels')->nullable();
            $table->json('fold_mapping')->nullable();
            $table->enum('status', ['pending', 'needs-review', 'approved', 'rejected'])->default('pending')->index();
            $table->string('owner', 120)->nullable()->index();
            $table->foreignId('reviewed_by')->nullable()->constrained('users')->nullOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('custom_box_uploads');
    }
};
