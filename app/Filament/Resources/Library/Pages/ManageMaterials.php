<?php

namespace App\Filament\Resources\Library\Pages;

use App\Filament\Resources\Library\MaterialResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManageMaterials extends ManageRecords
{
    protected static string $resource = MaterialResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make()->label('New material'),
        ];
    }
}
