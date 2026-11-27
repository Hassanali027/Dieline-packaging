<?php

namespace App\Filament\Resources\Quotes\Tables;

use App\Filament\Resources\Quotes\Schemas\QuoteForm;
use App\Models\Quote;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;

class QuotesTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('id')->label('#')->sortable(),
                TextColumn::make('customer_name')->label('Customer')->searchable()
                    ->description(fn (Quote $record) => $record->company_name),
                TextColumn::make('customer_email')->label('Email')->searchable()->copyable(),
                TextColumn::make('size')
                    ->label('Size')
                    ->state(fn (Quote $record) => "{$record->length} × {$record->width} × {$record->depth} {$record->unit}"),
                TextColumn::make('quantity')->numeric()->sortable(),
                TextColumn::make('status')
                    ->badge()
                    ->formatStateUsing(fn (string $state) => QuoteForm::STATUSES[$state] ?? $state)
                    ->color(fn (string $state) => match ($state) {
                        'new' => 'info',
                        'contacted' => 'warning',
                        'quoted' => 'primary',
                        'won' => 'success',
                        'lost' => 'gray',
                        default => 'gray',
                    }),
                TextColumn::make('created_at')->label('Received')->since()->sortable(),
            ])
            ->filters([
                SelectFilter::make('status')->options(QuoteForm::STATUSES),
            ])
            ->recordActions([
                EditAction::make()->label('Open'),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
