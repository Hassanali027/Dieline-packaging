<?php

namespace App\Jobs;

use App\Models\CustomBoxUpload;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

/**
 * Checks an uploaded 3D model before the editor uses it (plan: GLB, 20 MB, UV map required):
 * - the Khronos glTF-Validator (scripts/validate-glb.mjs, run with node, with a timeout)
 * - every mesh primitive must have UVs (TEXCOORD_0), or the design cannot be mapped onto it
 *
 * Problems send the model to the admin review queue, which can approve it as a product later.
 */
class ValidateGlbModel implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(public CustomBoxUpload $upload) {}

    public function handle(): void
    {
        $upload = $this->upload;
        $path = Storage::disk('local')->path($upload->file);

        try {
            $gltf = self::readGlbJson((string) file_get_contents($path));
            $uv = self::uvCoverage($gltf);
            $report = $this->runValidator($path);

            $problems = [];
            if (($report['numErrors'] ?? 0) > 0) {
                $problems[] = "{$report['numErrors']} glTF validation error(s)";
            }
            if ($uv['primitives'] === 0) {
                $problems[] = 'the model has no meshes';
            } elseif ($uv['with_uv'] < $uv['primitives']) {
                $problems[] = 'UV map missing on '.($uv['primitives'] - $uv['with_uv']).' of '.$uv['primitives'].' mesh part(s)';
            }

            $upload->update([
                'meta' => ['validator' => $report, 'uv' => $uv],
                'status' => $problems ? CustomBoxUpload::STATUS_NEEDS_REVIEW : CustomBoxUpload::STATUS_READY,
                'error' => $problems ? ucfirst(implode('; ', $problems)).'.' : null,
            ]);
        } catch (Throwable $e) {
            $upload->update(['status' => CustomBoxUpload::STATUS_NEEDS_REVIEW, 'error' => $e->getMessage()]);
        }
    }

    private function runValidator(string $path): array
    {
        try {
            $result = Process::timeout(config('dieline.custom_boxes.timeout'))
                ->path(base_path())
                ->run([config('dieline.custom_boxes.node'), base_path('scripts/validate-glb.mjs'), $path]);
        } catch (Throwable $e) {
            throw new RuntimeException('The 3D model checker (node) is not available on the server: '.$e->getMessage());
        }
        $report = json_decode(trim($result->output()), true);
        if (! $result->successful() || ! is_array($report)) {
            throw new RuntimeException('The 3D model could not be checked: '.mb_substr(trim($result->errorOutput()), 0, 300));
        }

        return $report;
    }

    /**
     * The JSON chunk of a binary glTF (12-byte header, then chunks of length + type + data).
     *
     * @return array<string, mixed>
     */
    public static function readGlbJson(string $bytes): array
    {
        if (strlen($bytes) < 20 || substr($bytes, 0, 4) !== 'glTF') {
            throw new RuntimeException('This is not a GLB file.');
        }
        $header = unpack('Vmagic/Vversion/Vlength', substr($bytes, 0, 12));
        if ($header['version'] !== 2) {
            throw new RuntimeException("Only glTF 2.0 is supported (file is version {$header['version']}).");
        }
        $chunk = unpack('Vlength/Vtype', substr($bytes, 12, 8));
        if ($chunk['type'] !== 0x4E4F534A) { // "JSON"
            throw new RuntimeException('The GLB has no JSON chunk.');
        }
        $json = json_decode(substr($bytes, 20, $chunk['length']), true);
        if (! is_array($json)) {
            throw new RuntimeException('The GLB scene description is not valid JSON.');
        }

        return $json;
    }

    /** @return array{primitives: int, with_uv: int} */
    public static function uvCoverage(array $gltf): array
    {
        $primitives = 0;
        $withUv = 0;
        foreach ($gltf['meshes'] ?? [] as $mesh) {
            foreach ($mesh['primitives'] ?? [] as $primitive) {
                $primitives++;
                if (isset($primitive['attributes']['TEXCOORD_0'])) {
                    $withUv++;
                }
            }
        }

        return ['primitives' => $primitives, 'with_uv' => $withUv];
    }
}
