<?php

namespace Tests\Support;

/** Builds a tiny but valid binary glTF (one triangle), with or without a UV map. */
class GlbFixture
{
    public static function triangle(bool $withUv = true): string
    {
        $positions = pack('g*', 0, 0, 0, 1, 0, 0, 0, 1, 0);
        $uvs = pack('g*', 0, 0, 1, 0, 0, 1);
        $bin = $positions.$uvs;

        $attributes = ['POSITION' => 0];
        $bufferViews = [['buffer' => 0, 'byteOffset' => 0, 'byteLength' => 36, 'target' => 34962]];
        $accessors = [['bufferView' => 0, 'componentType' => 5126, 'count' => 3, 'type' => 'VEC3', 'min' => [0, 0, 0], 'max' => [1, 1, 0]]];
        if ($withUv) {
            $attributes['TEXCOORD_0'] = 1;
            $bufferViews[] = ['buffer' => 0, 'byteOffset' => 36, 'byteLength' => 24, 'target' => 34962];
            $accessors[] = ['bufferView' => 1, 'componentType' => 5126, 'count' => 3, 'type' => 'VEC2'];
        } else {
            $bin = $positions;
        }

        $json = json_encode([
            'asset' => ['version' => '2.0', 'generator' => 'dieline tests'],
            'scene' => 0,
            'scenes' => [['nodes' => [0]]],
            'nodes' => [['mesh' => 0]],
            'meshes' => [['primitives' => [['attributes' => $attributes]]]],
            'accessors' => $accessors,
            'bufferViews' => $bufferViews,
            'buffers' => [['byteLength' => strlen($bin)]],
        ], JSON_UNESCAPED_SLASHES);

        $json .= str_repeat(' ', (4 - strlen($json) % 4) % 4);
        $bin .= str_repeat("\0", (4 - strlen($bin) % 4) % 4);

        $body = pack('VV', strlen($json), 0x4E4F534A).$json.pack('VV', strlen($bin), 0x004E4942).$bin;

        return 'glTF'.pack('VV', 2, 12 + strlen($body)).$body;
    }
}
