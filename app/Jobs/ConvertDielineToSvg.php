<?php

namespace App\Jobs;

use App\Models\CustomBoxUpload;
use DOMDocument;
use DOMElement;
use enshrined\svgSanitize\Sanitizer;
use Illuminate\Contracts\Queue\ShouldQueue;
use Illuminate\Foundation\Queue\Queueable;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Storage;
use RuntimeException;
use Throwable;

/**
 * Turns an uploaded dieline into a clean SVG the editor can parse into panels:
 * - PDF / AI → SVG with poppler's pdftocairo (first page only), in its own process with a timeout
 * - SVG → sanitized (scripts, event handlers and external references removed)
 *
 * It also records what the drawing contains (size, line count, stroke colours, dashed lines) so
 * the browser parser (Dev 1) and the admin can tell cut from crease lines.
 * Anything that goes wrong sends the upload to the admin review queue instead of failing.
 */
class ConvertDielineToSvg implements ShouldQueue
{
    use Queueable;

    public int $tries = 1;

    public int $timeout = 120;

    public function __construct(public CustomBoxUpload $upload) {}

    public function handle(): void
    {
        $upload = $this->upload;
        $disk = Storage::disk('local');

        try {
            $svg = match ($upload->extension()) {
                'svg' => (string) $disk->get($upload->file),
                'pdf', 'ai' => $this->pdfToSvg($disk->path($upload->file)),
                default => throw new RuntimeException("Unsupported dieline format: {$upload->extension()}"),
            };

            $clean = (new Sanitizer)->sanitize($svg);
            if (! $clean) {
                throw new RuntimeException('The SVG could not be read safely.');
            }

            $meta = self::inspect($clean);
            $converted = preg_replace('/\.[^.\/]+$/', '', $upload->file).'-converted.svg';
            $disk->put($converted, $clean);

            $problem = $meta['line_count'] === 0 ? 'No lines were found in the drawing.' : null;
            $upload->update([
                'converted_file' => $converted,
                'meta' => $meta,
                'status' => $problem ? CustomBoxUpload::STATUS_NEEDS_REVIEW : CustomBoxUpload::STATUS_READY,
                'error' => $problem,
            ]);
        } catch (Throwable $e) {
            $upload->update(['status' => CustomBoxUpload::STATUS_NEEDS_REVIEW, 'error' => $e->getMessage()]);
        }
    }

    private function pdfToSvg(string $input): string
    {
        $output = storage_path('app/private/custom-boxes/tmp/'.$this->upload->id.'-'.bin2hex(random_bytes(4)).'.svg');
        File::ensureDirectoryExists(dirname($output));

        try {
            $result = Process::timeout(config('dieline.custom_boxes.timeout'))
                ->run([config('dieline.custom_boxes.pdftocairo'), '-svg', '-f', '1', '-l', '1', $input, $output]);
        } catch (Throwable $e) {
            throw new RuntimeException('PDF converter (pdftocairo) is not available on the server: '.$e->getMessage());
        }

        if (! $result->successful() || ! is_file($output)) {
            $detail = trim($result->errorOutput() ?: $result->output());
            // Windows: "is not recognized as an internal or external command"; POSIX shells: exit 127.
            if ($result->exitCode() === 127 || str_contains($detail, 'is not recognized') || str_contains($detail, 'not found')) {
                throw new RuntimeException('PDF converter (pdftocairo) is not installed on the server. Install poppler and set POPPLER_PDFTOCAIRO.');
            }
            throw new RuntimeException('PDF conversion failed'.($detail !== '' ? ': '.mb_substr($detail, 0, 300) : '.'));
        }

        $svg = (string) file_get_contents($output);
        @unlink($output);

        return $svg;
    }

    /**
     * Size and line statistics of an SVG (no rendering).
     *
     * @return array{width_mm: float|null, height_mm: float|null, view_box: array<int, float>|null, line_count: int, dashed_count: int, stroke_colors: array<string, int>}
     */
    public static function inspect(string $svg): array
    {
        $doc = new DOMDocument;
        $previous = libxml_use_internal_errors(true);
        // LIBXML_NONET: never fetch anything while parsing customer files.
        $doc->loadXML($svg, LIBXML_NONET);
        libxml_use_internal_errors($previous);

        $root = $doc->documentElement;
        $viewBox = $root?->getAttribute('viewBox') ? array_map('floatval', preg_split('/[\s,]+/', trim($root->getAttribute('viewBox')))) : null;

        $lines = 0;
        $dashed = 0;
        $colors = [];
        foreach (['path', 'line', 'polyline', 'polygon', 'rect', 'circle', 'ellipse'] as $tag) {
            foreach ($doc->getElementsByTagName($tag) as $el) {
                /** @var DOMElement $el */
                $lines++;
                $style = self::styleOf($el);
                if (! empty($style['stroke-dasharray']) && $style['stroke-dasharray'] !== 'none') {
                    $dashed++;
                }
                $stroke = strtolower($style['stroke'] ?? '');
                if ($stroke !== '' && $stroke !== 'none') {
                    $colors[$stroke] = ($colors[$stroke] ?? 0) + 1;
                }
            }
        }
        arsort($colors);

        return [
            'width_mm' => $root ? self::toMm($root->getAttribute('width'), $viewBox[2] ?? null) : null,
            'height_mm' => $root ? self::toMm($root->getAttribute('height'), $viewBox[3] ?? null) : null,
            'view_box' => $viewBox && count($viewBox) === 4 ? $viewBox : null,
            'line_count' => $lines,
            'dashed_count' => $dashed,
            'stroke_colors' => array_slice($colors, 0, 12, true),
        ];
    }

    /** Presentation attributes plus inline style, inherited from parent <g> elements. */
    private static function styleOf(DOMElement $el): array
    {
        $style = [];
        $chain = [];
        for ($node = $el; $node instanceof DOMElement; $node = $node->parentNode) {
            $chain[] = $node;
        }
        foreach (array_reverse($chain) as $node) {
            foreach (['stroke', 'stroke-dasharray'] as $attr) {
                if ($node->hasAttribute($attr)) {
                    $style[$attr] = trim($node->getAttribute($attr));
                }
            }
            foreach (explode(';', $node->getAttribute('style')) as $decl) {
                [$k, $v] = array_pad(array_map('trim', explode(':', $decl, 2)), 2, null);
                if (in_array($k, ['stroke', 'stroke-dasharray'], true) && $v !== null) {
                    $style[$k] = $v;
                }
            }
        }

        return $style;
    }

    /** "210mm", "595.3pt", "8.5in", "300px" or unitless (user units = px at 96 dpi) → mm. */
    private static function toMm(string $value, ?float $fallback): ?float
    {
        if ($value === '' && $fallback === null) {
            return null;
        }
        if ($value === '' || ! preg_match('/^\s*([\d.]+)\s*([a-z%]*)\s*$/i', $value, $m)) {
            return $fallback !== null ? round($fallback * 25.4 / 96, 2) : null;
        }
        $n = (float) $m[1];
        $mm = match (strtolower($m[2])) {
            'mm' => $n,
            'cm' => $n * 10,
            'in' => $n * 25.4,
            'pt' => $n * 25.4 / 72,
            'pc' => $n * 25.4 / 6,
            '%' => null,
            default => $n * 25.4 / 96,
        };

        return $mm === null ? null : round($mm, 2);
    }
}
