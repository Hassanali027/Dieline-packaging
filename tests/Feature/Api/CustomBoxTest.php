<?php

namespace Tests\Feature\Api;

use App\Jobs\ConvertDielineToSvg;
use App\Jobs\ValidateGlbModel;
use App\Models\CustomBoxUpload;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use Illuminate\Process\PendingProcess;
use Illuminate\Support\Facades\Process;
use Illuminate\Support\Facades\Queue;
use Illuminate\Support\Facades\Storage;
use Tests\Support\GlbFixture;
use Tests\TestCase;

class CustomBoxTest extends TestCase
{
    use RefreshDatabase;

    private const SVG = '<svg xmlns="http://www.w3.org/2000/svg" width="300mm" height="200mm" viewBox="0 0 300 200">'
        .'<script>alert(1)</script>'
        .'<g stroke="#ff0000"><path d="M0 0 H300 V200 H0 Z" onclick="x()"/><line x1="100" y1="0" x2="100" y2="200" stroke="#00ff00" stroke-dasharray="4 2"/></g>'
        .'</svg>';

    protected function setUp(): void
    {
        parent::setUp();
        Storage::fake('local');
    }

    private function upload(string $name, string $content): UploadedFile
    {
        return UploadedFile::fake()->createWithContent($name, $content);
    }

    public function test_it_accepts_each_kind_and_routes_it_to_the_right_job(): void
    {
        Queue::fake();

        $svg = $this->postJson('/api/custom-boxes', ['file' => $this->upload('box.svg', self::SVG)])->assertCreated();
        $svg->assertJsonPath('data.kind', 'dieline')->assertJsonPath('data.status', 'pending')->assertJsonPath('data.format', 'svg');
        Queue::assertPushed(ConvertDielineToSvg::class);

        $this->postJson('/api/custom-boxes', ['file' => $this->upload('box.pdf', "%PDF-1.7\n...")])->assertCreated()->assertJsonPath('data.status', 'pending');
        $this->postJson('/api/custom-boxes', ['file' => $this->upload('box.glb', GlbFixture::triangle())])->assertCreated()->assertJsonPath('data.kind', 'model');
        Queue::assertPushed(ValidateGlbModel::class);

        // DXF is parsed in the browser and photos need nothing: ready straight away.
        $this->postJson('/api/custom-boxes', ['file' => $this->upload('box.dxf', "0\nSECTION\n2\nENTITIES\n0\nENDSEC\n0\nEOF\n")])->assertCreated()->assertJsonPath('data.status', 'ready');
        $this->postJson('/api/custom-boxes', ['file' => UploadedFile::fake()->image('photo.jpg')])->assertCreated()->assertJsonPath('data.kind', 'photo')->assertJsonPath('data.status', 'ready');

        $this->assertSame(5, CustomBoxUpload::count());
        $this->getJson('/api/custom-boxes')->assertOk()->assertJsonCount(5, 'data');
    }

    public function test_it_rejects_wrong_types_disguised_files_and_big_files(): void
    {
        $this->postJson('/api/custom-boxes', ['file' => $this->upload('virus.exe', 'MZ...')])->assertUnprocessable()->assertJsonValidationErrors('file');
        $this->postJson('/api/custom-boxes', ['file' => $this->upload('fake.pdf', '<html>not a pdf</html>')])
            ->assertUnprocessable()
            ->assertJsonPath('errors.file.0', 'The file content does not match its type.');
        $this->postJson('/api/custom-boxes', ['file' => $this->upload('model.glb', 'not gltf')])->assertUnprocessable();
        $this->postJson('/api/custom-boxes', ['file' => UploadedFile::fake()->create('huge.pdf', 20481)])->assertUnprocessable();
        $this->assertSame(0, CustomBoxUpload::count());
    }

    public function test_svg_dielines_are_sanitized_and_inspected(): void
    {
        Queue::fake();
        $this->postJson('/api/custom-boxes', ['file' => $this->upload('box.svg', self::SVG)])->assertCreated();
        $upload = CustomBoxUpload::firstOrFail();

        (new ConvertDielineToSvg($upload))->handle();
        $upload->refresh();

        $this->assertSame('ready', $upload->status);
        $converted = Storage::disk('local')->get($upload->converted_file);
        $this->assertStringNotContainsString('<script', $converted);
        $this->assertStringNotContainsString('onclick', $converted);
        $this->assertEquals(300, $upload->meta['width_mm']);
        $this->assertSame(2, $upload->meta['line_count']);
        $this->assertSame(1, $upload->meta['dashed_count']);
        $this->assertSame(['#ff0000' => 1, '#00ff00' => 1], $upload->meta['stroke_colors']);
    }

    public function test_pdf_dielines_are_converted_with_pdftocairo(): void
    {
        Queue::fake();
        config(['dieline.custom_boxes.pdftocairo' => 'pdftocairo-test']);
        Process::fake(function (PendingProcess $process) {
            // pdftocairo -svg -f 1 -l 1 <in> <out>: write the output file like the real tool.
            file_put_contents(end($process->command), '<svg xmlns="http://www.w3.org/2000/svg" width="595pt" height="842pt"><path d="M0 0 L10 10" stroke="black"/></svg>');

            return Process::result();
        });
        $this->postJson('/api/custom-boxes', ['file' => $this->upload('box.pdf', "%PDF-1.7\n...")])->assertCreated();
        $upload = CustomBoxUpload::firstOrFail();

        (new ConvertDielineToSvg($upload))->handle();
        $upload->refresh();

        Process::assertRan(fn (PendingProcess $p) => $p->command[0] === 'pdftocairo-test' && $p->command[1] === '-svg' && $p->timeout === 60);
        $this->assertSame('ready', $upload->status);
        $this->assertEqualsWithDelta(209.9, $upload->meta['width_mm'], 0.1);
    }

    public function test_a_failed_conversion_goes_to_the_review_queue(): void
    {
        Queue::fake();
        Process::fake(fn () => Process::result(errorOutput: 'Syntax Error: Couldn\'t read xref table', exitCode: 1));
        $this->postJson('/api/custom-boxes', ['file' => $this->upload('box.pdf', "%PDF-1.7\n...")])->assertCreated();
        $upload = CustomBoxUpload::firstOrFail();

        (new ConvertDielineToSvg($upload))->handle();
        $upload->refresh();

        $this->assertSame('needs-review', $upload->status);
        $this->assertStringContainsString("Couldn't read xref table", $upload->error);
    }

    public function test_glb_models_need_a_clean_report_and_uv_maps(): void
    {
        Queue::fake();
        $report = json_encode(['numErrors' => 0, 'numWarnings' => 0, 'info' => ['totalVertexCount' => 3], 'errors' => []]);
        Process::fake(fn () => Process::result(output: $report));

        $this->postJson('/api/custom-boxes', ['file' => $this->upload('good.glb', GlbFixture::triangle(true))])->assertCreated();
        $this->postJson('/api/custom-boxes', ['file' => $this->upload('no-uv.glb', GlbFixture::triangle(false))])->assertCreated();
        [$good, $noUv] = CustomBoxUpload::orderBy('id')->get()->all();

        (new ValidateGlbModel($good))->handle();
        (new ValidateGlbModel($noUv))->handle();

        $this->assertSame('ready', $good->refresh()->status);
        $this->assertSame(['primitives' => 1, 'with_uv' => 1], $good->meta['uv']);
        $this->assertSame('needs-review', $noUv->refresh()->status);
        $this->assertStringContainsString('UV map missing', $noUv->error);
        Process::assertRan(fn (PendingProcess $p) => str_ends_with($p->command[1], 'validate-glb.mjs'));
    }

    public function test_only_the_owner_reaches_an_upload_and_its_file(): void
    {
        Queue::fake();
        $this->postJson('/api/custom-boxes', ['file' => UploadedFile::fake()->image('photo.png')])->assertCreated();
        $mine = CustomBoxUpload::firstOrFail();

        $this->getJson("/api/custom-boxes/{$mine->id}")->assertOk();
        $this->get("/api/custom-boxes/{$mine->id}/file")->assertOk()->assertHeader('X-Content-Type-Options', 'nosniff');

        $theirs = CustomBoxUpload::create(['kind' => 'photo', 'file' => 'x.png', 'status' => 'ready', 'owner' => 'someone-else']);
        $this->getJson("/api/custom-boxes/{$theirs->id}")->assertForbidden();
        $this->get("/api/custom-boxes/{$theirs->id}/file")->assertForbidden();
    }
}
