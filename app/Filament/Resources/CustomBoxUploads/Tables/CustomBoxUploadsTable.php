<?php

namespace App\Filament\Resources\CustomBoxUploads\Tables;

use App\Filament\Resources\CustomBoxUploads\CustomBoxUploadResource;
use App\Models\CustomBoxUpload;
use Filament\Actions\Action;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\Textarea;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Table;
use Illuminate\Support\Number;

class CustomBoxUploadsTable
{
    public static function configure(Table $table): Table
    {
        return $table
            ->defaultSort('created_at', 'desc')
            ->columns([
                TextColumn::make('id')->label('#')->sortable(),
                TextColumn::make('original_name')
                    ->label('File')
                    ->searchable()
                    ->limit(40)
                    ->description(fn (CustomBoxUpload $record) => strtoupper($record->extension()).' · '.Number::fileSize((int) $record->size)),
                TextColumn::make('kind')->badge()->formatStateUsing(fn (string $state) => CustomBoxUpload::KINDS[$state] ?? $state),
                TextColumn::make('status')
                    ->badge()
                    ->formatStateUsing(fn (string $state) => CustomBoxUpload::STATUSES[$state] ?? $state)
                    ->color(fn (string $state) => CustomBoxUploadResource::statusColor($state)),
                TextColumn::make('error')->label('Problem')->limit(60)->tooltip(fn (CustomBoxUpload $record) => $record->error)->placeholder('—')->wrap(),
                TextColumn::make('reviewer.name')->label('Reviewed by')->placeholder('—')->toggleable(isToggledHiddenByDefault: true),
                TextColumn::make('created_at')->label('Uploaded')->since()->sortable(),
            ])
            ->filters([
                SelectFilter::make('status')->options(CustomBoxUpload::STATUSES),
                SelectFilter::make('kind')->options(CustomBoxUpload::KINDS),
            ])
            ->recordActions([
                Action::make('approve')
                    ->icon(Heroicon::OutlinedCheckCircle)
                    ->color('success')
                    ->requiresConfirmation()
                    ->visible(fn (CustomBoxUpload $record) => in_array($record->status, [CustomBoxUpload::STATUS_NEEDS_REVIEW, CustomBoxUpload::STATUS_READY], true))
                    ->action(fn (CustomBoxUpload $record) => $record->update([
                        'status' => CustomBoxUpload::STATUS_APPROVED,
                        'reviewed_by' => auth()->id(),
                        'reviewed_at' => now(),
                    ])),
                Action::make('reject')
                    ->icon(Heroicon::OutlinedXCircle)
                    ->color('danger')
                    ->visible(fn (CustomBoxUpload $record) => $record->status !== CustomBoxUpload::STATUS_REJECTED)
                    ->schema([Textarea::make('review_notes')->label('Reason (kept with the upload)')->required()->maxLength(1000)])
                    ->action(fn (CustomBoxUpload $record, array $data) => $record->update([
                        'status' => CustomBoxUpload::STATUS_REJECTED,
                        'review_notes' => $data['review_notes'],
                        'reviewed_by' => auth()->id(),
                        'reviewed_at' => now(),
                    ])),
                EditAction::make()->label('Review'),
            ])
            ->toolbarActions([
                BulkActionGroup::make([
                    DeleteBulkAction::make(),
                ]),
            ]);
    }
}
