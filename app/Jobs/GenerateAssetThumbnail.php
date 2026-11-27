<?php

namespace App\Jobs;

use App\Models\Asset;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Storage;
use Intervention\Image\Drivers\Gd\Driver;
use Intervention\Image\Encoders\WebpEncoder;
use Intervention\Image\ImageManager;

/** Makes a small WebP preview for the Uploads panel. SVGs use the original file instead. */
class GenerateAssetThumbnail implements ShouldQueue
{
    use Queueable;

    public const SIZE = 400;

    public int $tries = 2;

    public function __construct(public Asset $asset) {}

    public function handle(): void
    {
        $asset = $this->asset;
        if ($asset->mime === 'image/svg+xml' || ! $asset->path) {
            return;
        }

        $image = ImageManager::usingDriver(Driver::class)
            ->decodePath($asset->absolutePath())
            ->scaleDown(self::SIZE, self::SIZE);

        $thumbPath = preg_replace('/\.[^.\/]+$/', '', $asset->path).'-thumb.webp';
        Storage::disk($asset->disk)->put($thumbPath, $image->encode(new WebpEncoder(quality: 80))->toString());

        $asset->update(['thumbnail_path' => $thumbPath]);
    }
}
