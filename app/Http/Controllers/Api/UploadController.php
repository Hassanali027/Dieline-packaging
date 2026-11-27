<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\StoreUploadRequest;
use App\Jobs\GenerateAssetThumbnail;
use App\Models\Asset;
use App\Support\GuestKey;
use enshrined\svgSanitize\Sanitizer;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;

class UploadController extends Controller
{
    /** The visitor's own uploads, newest first (Uploads panel). */
    public function index(Request $request): JsonResponse
    {
        $assets = Asset::query()
            ->where('owner_session', GuestKey::for($request))
            ->where('type', 'image')
            ->latest('id')
            ->limit(100)
            ->get();

        return response()->json(['data' => $assets->map->toEditorArray()->values()]);
    }

    public function store(StoreUploadRequest $request): JsonResponse
    {
        $file = $request->file('file');
        $owner = GuestKey::for($request);
        $isSvg = in_array($file->getMimeType(), ['image/svg+xml', 'image/svg'], true)
            || strtolower($file->getClientOriginalExtension()) === 'svg';

        $dir = 'uploads/'.now()->format('Y/m');
        $name = Str::uuid()->toString();
        $width = null;
        $height = null;

        if ($isSvg) {
            // Strip scripts, event handlers and external references before anything can render it.
            $clean = (new Sanitizer)->sanitize((string) file_get_contents($file->getRealPath()));
            if (! $clean) {
                return response()->json(['message' => 'This SVG could not be read safely.', 'errors' => ['file' => ['Invalid SVG file.']]], 422);
            }
            $path = "{$dir}/{$name}.svg";
            Storage::disk('public')->put($path, $clean);
            $mime = 'image/svg+xml';
        } else {
            $extension = $file->guessExtension() === 'png' ? 'png' : 'jpg';
            $path = $file->storeAs($dir, "{$name}.{$extension}", 'public');
            $mime = $file->getMimeType();
            [$width, $height] = getimagesize($file->getRealPath()) ?: [null, null];
        }

        $asset = Asset::create([
            'disk' => 'public',
            'path' => $path,
            'url' => Asset::publicUrl($path),
            'type' => 'image',
            'original_name' => Str::limit($file->getClientOriginalName(), 250, ''),
            'mime' => $mime,
            'size' => Storage::disk('public')->size($path),
            'width' => $width,
            'height' => $height,
            'owner_session' => $owner,
        ]);

        GenerateAssetThumbnail::dispatch($asset);

        return response()->json(['data' => $asset->toEditorArray()], 201);
    }
}
