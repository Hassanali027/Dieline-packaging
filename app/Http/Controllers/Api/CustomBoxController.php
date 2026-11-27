<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Http\Requests\Api\StoreCustomBoxRequest;
use App\Jobs\ConvertDielineToSvg;
use App\Jobs\ValidateGlbModel;
use App\Models\CustomBoxUpload;
use App\Support\GuestKey;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Gate;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;

/**
 * Customers' own boxes (plan section 7): dieline files are converted to SVG, 3D models are
 * validated, photos are used as they are. The editor polls show() until the status is ready.
 */
class CustomBoxController extends Controller
{
    public function index(Request $request): JsonResponse
    {
        $uploads = CustomBoxUpload::query()
            ->where('owner', GuestKey::for($request))
            ->latest('id')
            ->limit(50)
            ->get();

        return response()->json(['data' => $uploads->map->toEditorArray()->values()]);
    }

    public function store(StoreCustomBoxRequest $request): JsonResponse
    {
        $file = $request->file('file');
        $extension = $request->uploadExtension();
        $kind = CustomBoxUpload::EXTENSIONS[$extension];

        // Private disk, random name: the original name is only kept as data.
        $path = $file->storeAs('custom-boxes/'.now()->format('Y/m'), Str::uuid().'.'.$extension, 'local');

        $upload = CustomBoxUpload::create([
            'kind' => $kind,
            'file' => $path,
            'original_name' => Str::limit($file->getClientOriginalName(), 250, ''),
            'mime' => $file->getMimeType(),
            'size' => $file->getSize(),
            'owner' => GuestKey::for($request),
            // DXF is parsed in the browser (dxf-parser) and photos need no processing.
            'status' => in_array($extension, ['dxf', 'jpg', 'jpeg', 'png'], true) ? CustomBoxUpload::STATUS_READY : CustomBoxUpload::STATUS_PENDING,
        ]);

        match (true) {
            in_array($extension, ['pdf', 'ai', 'svg'], true) => ConvertDielineToSvg::dispatch($upload),
            $extension === 'glb' => ValidateGlbModel::dispatch($upload),
            default => null,
        };

        return response()->json(['data' => $upload->refresh()->toEditorArray()], 201);
    }

    public function show(CustomBoxUpload $customBox): JsonResponse
    {
        Gate::authorize('view', $customBox);

        return response()->json(['data' => $customBox->toEditorArray()]);
    }

    /** The file the editor loads (converted SVG, GLB, DXF or photo), for its owner or staff. */
    public function file(CustomBoxUpload $customBox): StreamedResponse
    {
        Gate::authorize('view', $customBox);
        $path = $customBox->editorFile();
        abort_unless($path && Storage::disk('local')->exists($path), 404);

        $type = match (strtolower(pathinfo($path, PATHINFO_EXTENSION))) {
            'svg' => 'image/svg+xml',
            'glb' => 'model/gltf-binary',
            'dxf' => 'application/dxf',
            'png' => 'image/png',
            default => 'image/jpeg',
        };

        return Storage::disk('local')->response($path, null, [
            'Content-Type' => $type,
            // Even a sanitized SVG must never run as a page on our origin.
            'Content-Security-Policy' => "default-src 'none'; style-src 'unsafe-inline'; img-src data:",
            'X-Content-Type-Options' => 'nosniff',
            'Cache-Control' => 'private, max-age=300',
        ]);
    }
}
