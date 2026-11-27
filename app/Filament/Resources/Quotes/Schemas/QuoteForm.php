<?php

namespace App\Filament\Resources\Quotes\Schemas;

use App\Models\Quote;
use Filament\Forms\Components\Select;
use Filament\Infolists\Components\TextEntry;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;

/**
 * Admin view of a quote request. What the customer sent is shown read-only; the admin
 * works the request by changing its status (new → contacted → quoted → won / lost).
 */
class QuoteForm
{
    public const STATUSES = [
        'new' => 'New',
        'contacted' => 'Contacted',
        'quoted' => 'Quoted',
        'won' => 'Won',
        'lost' => 'Lost',
    ];

    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Status')
                    ->schema([
                        Select::make('status')->options(self::STATUSES)->required()->native(false),
                    ]),

                Section::make('Customer')
                    ->columns(2)
                    ->schema([
                        TextEntry::make('customer_name')->label('Name'),
                        TextEntry::make('company_name')->label('Company')->placeholder('—'),
                        TextEntry::make('customer_email')->label('Email')->copyable()->url(fn (Quote $record) => "mailto:{$record->customer_email}"),
                        TextEntry::make('customer_phone')->label('Phone')->copyable(),
                    ]),

                Section::make('Box')
                    ->columns(3)
                    ->schema([
                        TextEntry::make('size')
                            ->label('Size (L × W × D)')
                            ->state(fn (Quote $record) => "{$record->length} × {$record->width} × {$record->depth} {$record->unit}"),
                        TextEntry::make('quantity')->numeric(),
                        TextEntry::make('construction')->placeholder('—')->badge(),
                        TextEntry::make('board_thickness')->label('Board')->placeholder('—'),
                        TextEntry::make('paper')->placeholder('—'),
                        TextEntry::make('insert_type')->label('Insert')->placeholder('—'),
                        TextEntry::make('finishes')->badge()->placeholder('—')->columnSpanFull(),
                        TextEntry::make('notes')->placeholder('—')->columnSpanFull(),
                    ]),

                Section::make('Files')
                    ->columns(3)
                    ->schema([
                        self::file('outside_png', 'Outside preview'),
                        self::file('inside_png', 'Inside preview'),
                        self::file('print_pdf', 'Print PDF'),
                        TextEntry::make('design_id')
                            ->label('Saved design')
                            ->placeholder('—')
                            ->state(fn (Quote $record) => $record->design_id ? 'Open in editor' : null)
                            ->url(fn (Quote $record) => $record->design_id ? "/editor?design={$record->design_id}" : null)
                            ->openUrlInNewTab(),
                    ]),
            ]);
    }

    private static function file(string $field, string $label): TextEntry
    {
        return TextEntry::make($field)
            ->label($label)
            ->placeholder('Not sent')
            ->state(fn (Quote $record) => $record->{$field} ? 'Download' : null)
            ->url(fn (Quote $record) => $record->{$field} ? route('admin.quote-file', ['quote' => $record, 'field' => $field]) : null)
            ->openUrlInNewTab();
    }
}
