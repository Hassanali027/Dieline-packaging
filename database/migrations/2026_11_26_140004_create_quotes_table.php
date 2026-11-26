<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('quotes', function (Blueprint $table) {
            $table->id();
            $table->string('customer_name');
            $table->string('customer_email');
            $table->string('customer_phone');
            $table->string('company_name')->nullable();
            $table->decimal('length', 10, 2);
            $table->decimal('width', 10, 2);
            $table->decimal('depth', 10, 2);
            $table->string('unit', 8)->default('in');
            $table->unsignedInteger('quantity');
            $table->string('construction')->nullable();
            $table->string('board_thickness')->nullable();
            $table->string('paper')->nullable();
            $table->json('finishes')->nullable();
            $table->string('insert_type')->nullable();
            $table->text('notes')->nullable();
            $table->foreignId('design_id')->nullable()->constrained('designs')->nullOnDelete();
            $table->string('outside_png')->nullable();
            $table->string('inside_png')->nullable();
            $table->string('print_pdf')->nullable();
            $table->enum('status', ['new', 'contacted', 'quoted', 'won', 'lost'])->default('new')->index();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('quotes');
    }
};
