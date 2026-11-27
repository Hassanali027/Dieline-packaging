<?php

namespace App\Filament\Resources\CustomBoxUploads\Pages;

use App\Filament\Resources\CustomBoxUploads\CustomBoxUploadResource;
use App\Jobs\ConvertDielineToSvg;
use App\Models\CustomBoxUpload;
use enshrined\svgSanitize\Sanitizer;
use Filament\Actions\DeleteAction;
use Filament\Notifications\Notification;
use Filament\Resources\Pages\EditRecord;
use Illuminate\Support\Facades\Storage;

class EditCustomBoxUpload extends EditRecord
{
    protected static string $resource = CustomBoxUploadResource::class;

    protected function getHeaderActions(): array
    {
        return [
            DeleteAction::make(),
        ];
    }

    /** Records who decided, and swaps in an admin-corrected SVG (sanitized) when one was uploaded. */
    protected function mutateFormDataBeforeSave(array $data): array
    {
        /** @var CustomBoxUpload $record */
        $record = $this->getRecord();

        $replacement = $data['replacement_svg'] ?? null;
        unset($data['replacement_svg']);
        if (is_array($replacement)) {
            $replacement = reset($replacement) ?: null;
        }

        if ($replacement) {
            $disk = Storage::disk('local');
            $clean = (new Sanitizer)->sanitize((string) $disk->get($replacement));
            if ($clean) {
                $disk->put($replacement, $clean);
                $data['converted_file'] = $replacement;
                $data['meta'] = ConvertDielineToSvg::inspect($clean);
                $data['error'] = null;
            } else {
                $disk->delete($replacement);
                Notification::make()->danger()->title('That SVG could not be read safely and was not used.')->send();
            }
        }

        if (($data['status'] ?? null) !== $record->status || $replacement || ($data['review_notes'] ?? null) !== $record->review_notes) {
            $data['reviewed_by'] = auth()->id();
            $data['reviewed_at'] = now();
        }

        return $data;
    }
}
