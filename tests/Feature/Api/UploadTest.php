<?php

namespace Tests\Feature\Api;

use App\Jobs\GenerateAssetThumbnail;
use App\Models\Asset;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\TestCase;

class UploadTest extends TestCase
{
    use RefreshDatabase;

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('public');
        Queue::fake();
    }

    public function test_it_stores_an_uploaded_png_and_queues_a_thumbnail(): void
    {
        $this->postJson('/api/uploads', ['file' => UploadedFile::fake()->image('logo.png', 800, 600)])
            ->assertCreated()
            ->assertJsonPath('data.type', 'image')
            ->assertJsonPath('data.name', 'logo.png')
            ->assertJsonPath('data.width', 800)
            ->assertJsonPath('data.height', 600);

        $asset = Asset::firstOrFail();
        $this->assertStringStartsWith('/storage/uploads/', $asset->url);
        Storage::disk('public')->assertExists($asset->path);
        Queue::assertPushed(GenerateAssetThumbnail::class);
    }

    public function test_it_makes_a_webp_thumbnail(): void
    {
        $this->postJson('/api/uploads', ['file' => UploadedFile::fake()->image('big.jpg', 1600, 1200)])->assertCreated();

        $asset = Asset::firstOrFail();
        (new GenerateAssetThumbnail($asset))->handle();

        $asset->refresh();
        $this->assertStringEndsWith('-thumb.webp', $asset->thumbnail_path);
        Storage::disk('public')->assertExists($asset->thumbnail_path);
    }

    public function test_it_sanitizes_svg_uploads(): void
    {
        $svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script>'
            .'<rect width="10" height="10" onclick="alert(2)" fill="red"/></svg>';

        $this->postJson('/api/uploads', ['file' => UploadedFile::fake()->createWithContent('art.svg', $svg)])
            ->assertCreated()
            ->assertJsonPath('data.mime', 'image/svg+xml');

        $stored = Storage::disk('public')->get(Asset::firstOrFail()->path);
        $this->assertStringContainsString('<rect', $stored);
        $this->assertStringNotContainsString('<script', $stored);
        $this->assertStringNotContainsString('onclick', $stored);
    }

    public function test_it_rejects_files_that_are_not_images(): void
    {
        $this->postJson('/api/uploads', ['file' => UploadedFile::fake()->create('notes.pdf', 10, 'application/pdf')])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('file');

        $this->assertSame(0, Asset::count());
    }

    public function test_it_rejects_files_over_10_mb(): void
    {
        $this->postJson('/api/uploads', ['file' => UploadedFile::fake()->image('huge.png')->size(10241)])
            ->assertUnprocessable()
            ->assertJsonValidationErrors('file');
    }

    public function test_it_lists_only_the_visitors_own_uploads(): void
    {
        Asset::create(['url' => '/storage/x.png', 'type' => 'image', 'owner_session' => 'someone-else']);
        $this->postJson('/api/uploads', ['file' => UploadedFile::fake()->image('mine.png')])->assertCreated();

        $this->getJson('/api/uploads')
            ->assertOk()
            ->assertJsonCount(1, 'data')
            ->assertJsonPath('data.0.name', 'mine.png');
    }
}
