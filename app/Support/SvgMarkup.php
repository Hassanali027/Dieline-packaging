<?php

namespace App\Support;

use enshrined\svgSanitize\Sanitizer;

/**
 * SVG artwork from admins (icons, pattern tiles). It reaches customers' browsers, so it is
 * always stored sanitised: no scripts, event handlers, foreign objects or remote references.
 */
class SvgMarkup
{
    /** Largest SVG accepted, in bytes (icons and tiles are small; this stops pasted giant files). */
    public const MAX_BYTES = 512 * 1024;

    /** The sanitised SVG, or null when the input is not a usable SVG document. */
    public static function clean(?string $svg): ?string
    {
        $svg = trim((string) $svg);
        if ($svg === '' || strlen($svg) > self::MAX_BYTES || ! str_contains(strtolower($svg), '<svg')) {
            return null;
        }

        $sanitizer = new Sanitizer;
        $sanitizer->removeRemoteReferences(true);
        $sanitizer->minify(true);
        $clean = $sanitizer->sanitize($svg);

        if (! is_string($clean) || ! preg_match('/^\s*(<\?xml[^>]*>\s*)?<svg[\s>]/i', $clean)) {
            return null;
        }

        return trim($clean);
    }

    /** A data: URI an <img> (or the editor's Fabric canvas) can show directly. */
    public static function dataUri(?string $svg): ?string
    {
        return filled($svg) ? 'data:image/svg+xml;base64,'.base64_encode((string) $svg) : null;
    }
}
