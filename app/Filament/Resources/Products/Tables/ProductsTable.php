<?php

namespace App\Filament\Resources\Products\Tables;

use App\Models\Product;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\IconColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;

class ProductsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->columns([
                TextColumn::make('name')
                    ->searchable(),
                TextColumn::make('slug')
                    ->searchable(),
                TextColumn::make('style')
                    ->formatStateUsing(fn (string $state) => Product::STYLES[$state] ?? $state)
                    ->searchable(),
                TextColumn::make('construction')
                    ->badge(),
                TextColumn::make('default_params')
                    ->label('Default size')
                    ->state(fn (Product $record) => sprintf(
                        '%s × %s × %s %s',
                        $record->default_params['length'] ?? '?',
                        $record->default_params['width'] ?? '?',
                        $record->default_params['depth'] ?? '?',
                        $record->default_params['unit'] ?? 'mm',
                    )),
                IconColumn::make('active')
                    ->boolean(),
                TextColumn::make('created_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('updated_at')
                    ->dateTime()
                    ->sortable()
                    ->toggleable(isToggledHiddenByDefault: true),
            ])
            ->defaultSort('id')
            ->filters([
                SelectFilter::make('construction')
                    ->options(['folding' => 'Folding', 'corrugated' => 'Corrugated', 'rigid' => 'Rigid']),
                TernaryFilter::make('active'),
            ])
            ->recordActions([
                EditAction::make(),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
