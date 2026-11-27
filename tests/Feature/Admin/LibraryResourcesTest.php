<?php

namespace Tests\Feature\Admin;

use App\Filament\Resources\Library\Pages\ManageIcons;
use App\Filament\Resources\Library\Pages\ManageMaterials;
use App\Filament\Resources\Library\Pages\ManagePatterns;
use App\Models\Icon;
use App\Models\Material;
use App\Models\Pattern;
use App\Models\User;
use Database\Seeders\LibrarySeeder;
use Filament\Actions\CreateAction;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\UploadedFile;
use InvalidArgumentException;
use Livewire\Livewire;
use Tests\TestCase;

class LibraryResourcesTest extends TestCase
{
    use RefreshDatabase;

    private const STAR = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><path d="M12 2l3 7h7l-6 4 2 8-6-5-6 5 2-8-6-4h7z"/></svg>';

    private function admin(): User
    {
        return User::factory()->create(['is_admin' => true]);
    }

    public function test_admin_sees_the_seeded_library_pages(): void
    {
        $this->seed(LibrarySeeder::class);
        $this->actingAs($this->admin());

        $this->get('/admin/library/icons')->assertOk()->assertSee('This side up')->assertSee('Library');
        $this->get('/admin/library/patterns')->assertOk()->assertSee('Polka dots');
        $this->get('/admin/library/materials')->assertOk()->assertSee('Leatherette')->assertSee('wrap-paper');
    }

    public function test_customers_and_guests_cannot_open_the_library(): void
    {
        $this->get('/admin/library/icons')->assertRedirect('/admin/login');
        $this->actingAs(User::factory()->create())->get('/admin/library/materials')->assertForbidden();
    }

    public function test_the_seeder_can_run_twice_without_duplicates(): void
    {
        $this->seed(LibrarySeeder::class);
        $this->seed(LibrarySeeder::class);

        $this->assertSame(10, Icon::count());
        $this->assertSame(5, Pattern::count());
        $this->assertSame(6, Material::count());
    }

    public function test_creating_an_icon_stores_sanitised_svg(): void
    {
        $this->actingAs($this->admin());
        $evil = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)"><script>alert(2)</script><path d="M0 0h24v24H0z"/></svg>';

        Livewire::test(ManageIcons::class)
            ->callAction(CreateAction::class, data: ['name' => 'Square', 'category' => 'Shapes', 'svg' => $evil, 'active' => true])
            ->assertHasNoFormErrors();

        $icon = Icon::where('name', 'Square')->firstOrFail();
        $this->assertStringContainsString('<path', $icon->svg);
        $this->assertStringNotContainsString('script', $icon->svg);
        $this->assertStringNotContainsString('onload', $icon->svg);
    }

    public function test_uploading_an_svg_file_fills_the_code_and_saves_it_clean(): void
    {
        $this->actingAs($this->admin());
        $file = UploadedFile::fake()->createWithContent('star.svg', str_replace('</svg>', '<script>alert(1)</script></svg>', self::STAR));

        Livewire::test(ManageIcons::class)
            ->mountAction(CreateAction::class)
            ->fillForm(['name' => 'Uploaded star', 'svg_upload' => $file])
            ->callMountedAction()
            ->assertHasNoFormErrors();

        $icon = Icon::where('name', 'Uploaded star')->firstOrFail();
        $this->assertStringContainsString('<path', $icon->svg);
        $this->assertStringNotContainsString('script', $icon->svg);
    }

    public function test_an_icon_needs_a_real_svg(): void
    {
        $this->actingAs($this->admin());

        Livewire::test(ManageIcons::class)
            ->callAction(CreateAction::class, data: ['name' => 'Broken', 'svg' => '<div>not an svg</div>'])
            ->assertHasFormErrors(['svg']);

        $this->assertDatabaseMissing('icons', ['name' => 'Broken']);
    }

    public function test_a_pattern_needs_an_svg_tile_or_an_image(): void
    {
        $this->actingAs($this->admin());

        Livewire::test(ManagePatterns::class)
            ->callAction(CreateAction::class, data: ['name' => 'Empty'])
            ->assertHasFormErrors(['svg']);

        Livewire::test(ManagePatterns::class)
            ->callAction(CreateAction::class, data: ['name' => 'Stars', 'svg' => self::STAR, 'active' => true])
            ->assertHasNoFormErrors();

        $this->assertDatabaseHas('patterns', ['name' => 'Stars']);
    }

    public function test_creating_a_material_keeps_its_look_in_properties(): void
    {
        $this->actingAs($this->admin());

        Livewire::test(ManageMaterials::class)
            ->callAction(CreateAction::class, data: [
                'name' => 'Black Velvet',
                'slug' => 'black-velvet',
                'category' => 'wrap',
                'active' => true,
                'properties' => [
                    'outside' => '#111111',
                    'inside' => '#222222',
                    'roughness' => 0.95,
                    'bumpScale' => 0.2,
                    'constructions' => ['rigid'],
                ],
            ])
            ->assertHasNoFormErrors();

        $material = Material::where('slug', 'black-velvet')->firstOrFail();
        $this->assertSame('#111111', $material->properties['outside']);
        $this->assertSame(['rigid'], $material->properties['constructions']);
    }

    public function test_a_material_colour_must_be_a_hex_colour(): void
    {
        $this->actingAs($this->admin());

        Livewire::test(ManageMaterials::class)
            ->callAction(CreateAction::class, data: [
                'name' => 'Bad',
                'slug' => 'bad',
                'category' => 'board',
                'properties' => ['outside' => 'red;background:url(x)', 'inside' => '#ffffff', 'roughness' => 0.5, 'bumpScale' => 0, 'constructions' => ['folding']],
            ])
            ->assertHasFormErrors(['properties.outside']);
    }

    public function test_models_refuse_invalid_svg_outside_the_admin_too(): void
    {
        $this->expectException(InvalidArgumentException::class);
        Icon::create(['name' => 'Nope', 'svg' => 'hello']);
    }
}
