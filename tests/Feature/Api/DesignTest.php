<?php

namespace Tests\Feature\Api;

use App\Models\Design;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

class DesignTest extends TestCase
{
    use RefreshDatabase;

    private function payload(array $overrides = []): array
    {
        return array_replace_recursive([
            'name' => 'My mailer',
            'data' => [
                'source' => [
                    'kind' => 'parametric',
                    'params' => [
                        'style' => 'mailer', 'length' => 220, 'width' => 160, 'depth' => 70,
                        'thickness' => 1.5, 'unit' => 'mm', 'construction' => 'corrugated',
                    ],
                ],
                'outside' => [
                    ['id' => 'obj-1', 'type' => 'text', 'side' => 'outside', 'props' => ['text' => 'Hello']],
                ],
                'inside' => [],
                'faceColors' => ['lid' => '#ff0000'],
                'material' => 'kraft',
            ],
        ], $overrides);
    }

    public function test_a_guest_creates_a_design_and_reads_it_back(): void
    {
        $id = $this->postJson('/api/designs', $this->payload())
            ->assertCreated()
            ->assertJsonPath('data.name', 'My mailer')
            ->json('data.id');

        $this->getJson("/api/designs/{$id}")
            ->assertOk()
            ->assertJsonPath('data.data.material', 'kraft')
            ->assertJsonPath('data.data.outside.0.props.text', 'Hello');

        $this->assertNotNull(Design::find($id)->session_id);
    }

    public function test_it_lists_updates_and_deletes_the_visitors_designs(): void
    {
        $id = $this->postJson('/api/designs', $this->payload())->json('data.id');

        $this->getJson('/api/designs')->assertOk()->assertJsonCount(1, 'data');

        $this->putJson("/api/designs/{$id}", ['name' => 'Renamed'])
            ->assertOk()
            ->assertJsonPath('data.name', 'Renamed')
            ->assertJsonPath('data.data.material', 'kraft');

        $this->deleteJson("/api/designs/{$id}")->assertNoContent();
        $this->assertSame(0, Design::count());
    }

    public function test_other_visitors_are_kept_out(): void
    {
        $design = Design::create($this->payload() + ['session_id' => 'someone-else']);

        $this->getJson("/api/designs/{$design->id}")->assertForbidden();
        $this->putJson("/api/designs/{$design->id}", ['name' => 'Mine now'])->assertForbidden();
        $this->deleteJson("/api/designs/{$design->id}")->assertForbidden();
        $this->getJson('/api/designs')->assertOk()->assertJsonCount(0, 'data');
    }

    public function test_a_logged_in_user_reaches_their_own_designs(): void
    {
        $user = User::factory()->create();
        $design = Design::create($this->payload() + ['user_id' => $user->id, 'session_id' => 'old-session']);

        $this->actingAs($user)->getJson("/api/designs/{$design->id}")->assertOk();
    }

    public function test_it_validates_the_design_json(): void
    {
        $this->postJson('/api/designs', ['name' => 'Broken', 'data' => ['source' => ['kind' => 'nope']]])
            ->assertUnprocessable()
            ->assertJsonValidationErrors(['data.source.kind', 'data.material', 'data.outside']);

        $this->postJson('/api/designs', $this->payload(['data' => ['source' => ['params' => ['length' => -5]]]]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data.source.params.length');

        $this->postJson('/api/designs', $this->payload(['data' => ['outside' => [['id' => 'x', 'type' => 'video']]]]))
            ->assertUnprocessable()
            ->assertJsonValidationErrors('data.outside.0.type');
    }
}
