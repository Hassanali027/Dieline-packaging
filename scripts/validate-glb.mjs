// Validates a GLB with the Khronos glTF-Validator and prints a short JSON report on stdout.
// Used by app/Jobs/ValidateGlbModel.php:  node scripts/validate-glb.mjs <file.glb>
// Exit code 0 = a report was printed (even if it lists errors), 1 = the file could not be read.
/* global process */
import { validateBytes, version } from 'gltf-validator';
import { readFile } from 'node:fs/promises';

const path = process.argv[2];
if (!path) {
    console.error('usage: node scripts/validate-glb.mjs <file.glb>');
    process.exit(1);
}

try {
    const data = new Uint8Array(await readFile(path));
    // No externalResourceFunction: models must be self-contained, external files count as errors.
    const report = await validateBytes(data, { maxIssues: 200, writeTimestamp: false });
    const issues = report.issues ?? {};
    const info = report.info ?? {};
    console.log(
        JSON.stringify({
            validator: typeof version === 'function' ? version() : version,
            numErrors: issues.numErrors ?? 0,
            numWarnings: issues.numWarnings ?? 0,
            info: {
                generator: info.generator ?? null,
                drawCallCount: info.drawCallCount ?? null,
                totalVertexCount: info.totalVertexCount ?? null,
                totalTriangleCount: info.totalTriangleCount ?? null,
                materialCount: info.materialCount ?? null,
                hasTextures: info.hasTextures ?? false,
                hasAnimations: info.hasAnimations ?? false,
            },
            errors: (issues.messages ?? [])
                .filter((m) => m.severity === 0)
                .slice(0, 10)
                .map((m) => ({ code: m.code, message: m.message, pointer: m.pointer ?? null })),
        }),
    );
} catch (error) {
    console.error(String(error?.message ?? error));
    process.exit(1);
}
