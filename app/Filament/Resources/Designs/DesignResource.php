<?php

namespace App\Filament\Resources\Designs;

use App\Filament\Resources\Designs\Pages\ManageDesigns;
use App\Models\Design;
use BackedEnum;
use Filament\Actions\Action;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Resources\Resource;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Database\Eloquent\Builder;

/** Saved customer designs: browse, open in the editor, delete. Designs are edited in the editor only. */
class DesignResource extends Resource
{
    protected static ?string $model = Design::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedSwatch;

    protected static ?int $navigationSort = 2;

    protected static ?string $recordTitleAttribute = 'name';

    public static function canCreate(): bool
    {
        return false;
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('updated_at', 'desc')
            ->columns([
                TextColumn::make('id')->label('#')->sortable(),
                TextColumn::make('name')->searchable(),
                TextColumn::make('style')
                    ->state(fn (Design $record) => data_get($record->data, 'source.params.style', '—'))
                    ->badge(),
                TextColumn::make('user.email')->label('Owner')->placeholder('Guest')->searchable(),
                TextColumn::make('quotes_count')->counts('quotes')->label('Quotes')->sortable(),
                TextColumn::make('updated_at')->label('Last saved')->since()->sortable(),
            ])
            ->filters([
                TernaryFilter::make('user_id')
                    ->label('Owner')
                    ->placeholder('Everyone')
                    ->trueLabel('Registered users')
                    ->falseLabel('Guests')
                    ->queries(
                        true: fn (Builder $query) => $query->whereNotNull('user_id'),
                        false: fn (Builder $query) => $query->whereNull('user_id'),
                    ),
            ])
            ->recordActions([
                Action::make('open')
                    ->label('Open in editor')
                    ->icon(Heroicon::OutlinedArrowTopRightOnSquare)
                    ->url(fn (Design $record) => "/editor?design={$record->id}")
                    ->openUrlInNewTab(),
                DeleteAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }

    public static function getPages(): array
    {
        return [
            'index' => ManageDesigns::route('/'),
        ];
    }
}
