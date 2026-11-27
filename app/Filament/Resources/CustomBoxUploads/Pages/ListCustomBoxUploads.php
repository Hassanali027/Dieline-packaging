<?php

namespace App\Filament\Resources\CustomBoxUploads\Pages;

use App\Filament\Resources\CustomBoxUploads\CustomBoxUploadResource;
use App\Models\CustomBoxUpload;
use Filament\Resources\Pages\ListRecords;
use Filament\Schemas\Components\Tabs\Tab;
use Illuminate\Database\Eloquent\Builder;

class ListCustomBoxUploads extends ListRecords
{
    protected static string $resource = CustomBoxUploadResource::class;

    /** The queue first: what needs a person, then everything else. */
    public function getTabs(): array
    {
        return [
            'needs-review' => Tab::make('Needs review')
                ->badge(CustomBoxUpload::where('status', CustomBoxUpload::STATUS_NEEDS_REVIEW)->count() ?: null)
                ->badgeColor('warning')
                ->modifyQueryUsing(fn (Builder $query) => $query->where('status', CustomBoxUpload::STATUS_NEEDS_REVIEW)),
            'all' => Tab::make('All'),
            'approved' => Tab::make('Approved')->modifyQueryUsing(fn (Builder $query) => $query->where('status', CustomBoxUpload::STATUS_APPROVED)),
            'rejected' => Tab::make('Rejected')->modifyQueryUsing(fn (Builder $query) => $query->where('status', CustomBoxUpload::STATUS_REJECTED)),
        ];
    }
}
