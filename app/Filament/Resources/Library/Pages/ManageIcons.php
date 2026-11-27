<?php

namespace App\Filament\Resources\Library\Pages;

use App\Filament\Resources\Library\IconResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageIcons extends ManageRecords
{
    protected static string $resource = IconResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make()->label('New icon'),
        ];
    }
}
