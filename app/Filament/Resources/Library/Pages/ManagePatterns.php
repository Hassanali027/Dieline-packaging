<?php

namespace App\Filament\Resources\Library\Pages;

use App\Filament\Resources\Library\PatternResource;
use Filament\Actions\CreateAction;
use Filament\Resources\Pages\ManageRecords;

class ManagePatterns extends ManageRecords
{
    protected static string $resource = PatternResource::class;

    protected function getHeaderActions(): array
    {
        return [
            CreateAction::make()->label('New pattern'),
        ];
    }
}
