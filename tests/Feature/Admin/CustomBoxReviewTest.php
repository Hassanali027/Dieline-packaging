<?php

namespace Tests\Feature\Admin;

use App\Filament\Resources\CustomBoxUploads\Pages\EditCustomBoxUpload;
use App\Filament\Resources\CustomBoxUploads\Pages\ListCustomBoxUploads;
use App\Models\CustomBoxUpload;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Storage;
use Livewire\Livewire;
use Tests\TestCase;

class CustomBoxReviewTest extends TestCase
{
    use RefreshDatabase;

    private function upload(array $extra = []): CustomBoxUpload
    {
        return CustomBoxUpload::create([
            'kind' => 'dieline',
            'file' => 'custom-boxes/a.pdf',
            'original_name' => 'client-box.pdf',
            'size' => 12345,
            'status' => CustomBoxUpload::STATUS_NEEDS_REVIEW,
            'error' => 'PDF conversion failed.',
            'owner' => 'guest-1',
            ...$extra,
        ]);
    }

    public function test_the_review_queue_lists_uploads_that_need_a_person(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $waiting = $this->upload();
        $this->upload(['original_name' => 'fine.svg', 'status' => CustomBoxUpload::STATUS_READY, 'error' => null]);

        $this->actingAs($admin)->get('/admin/custom-box-uploads')->assertOk()->assertSee('client-box.pdf');
        $this->actingAs($admin)->get("/admin/custom-box-uploads/{$waiting->id}/edit")->assertOk()->assertSee('PDF conversion failed.');
        $this->actingAs(User::factory()->create())->get('/admin/custom-box-uploads')->assertForbidden();
    }

    public function test_admins_approve_and_reject_from_the_list(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $a = $this->upload();
        $b = $this->upload(['original_name' => 'other.pdf']);
        $this->actingAs($admin);

        Livewire::test(ListCustomBoxUploads::class)
            ->callTableAction('approve', $a)
            ->callTableAction('reject', $b, data: ['review_notes' => 'Lines are not closed.']);

        $this->assertSame('approved', $a->refresh()->status);
        $this->assertSame($admin->id, $a->reviewed_by);
        $this->assertSame('rejected', $b->refresh()->status);
        $this->assertSame('Lines are not closed.', $b->review_notes);
    }

    public function test_saving_a_review_records_the_reviewer(): void
    {
        $admin = User::factory()->create(['is_admin' => true]);
        $upload = $this->upload();
        $this->actingAs($admin);

        Livewire::test(EditCustomBoxUpload::class, ['record' => $upload->getRouteKey()])
            ->fillForm(['status' => 'approved', 'review_notes' => 'Fixed the crease layer.'])
            ->call('save')
            ->assertHasNoFormErrors();

        $upload->refresh();
        $this->assertSame('approved', $upload->status);
        $this->assertSame($admin->id, $upload->reviewed_by);
        $this->assertNotNull($upload->reviewed_at);
    }

    public function test_only_admins_download_upload_files(): void
    {
        Storage::fake('local');
        Storage::disk('local')->put('custom-boxes/a.pdf', '%PDF-1.7');
        $upload = $this->upload();
        $url = "/admin-files/custom-boxes/{$upload->id}/original";

        $this->get($url)->assertRedirect('/login');
        $this->actingAs(User::factory()->create())->get($url)->assertForbidden();
        $this->actingAs(User::factory()->create(['is_admin' => true]))->get($url)->assertOk()->assertDownload('client-box.pdf');
        $this->actingAs(User::factory()->create(['is_admin' => true]))->get("/admin-files/custom-boxes/{$upload->id}/converted")->assertNotFound();
    }
}
