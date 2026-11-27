<?php

namespace App\Filament\Resources\CustomBoxUploads\Schemas;

use App\Filament\Resources\CustomBoxUploads\CustomBoxUploadResource;
use App\Models\CustomBoxUpload;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\Textarea;
use Filament\Infolists\Components\TextEntry;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Schema;
use Illuminate\Support\Number;

/**
 * Review screen: what was uploaded, what the automatic checks found, the files, and the
 * admin's decision. A corrected SVG can replace the converted dieline (plan: "admin fix kare").
 */
class CustomBoxUploadForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->columns(3)
            ->components([
                Section::make('Upload')
                    ->columnSpan(2)
                    ->columns(3)
                    ->schema([
                        TextEntry::make('original_name')->label('File')->columnSpan(2),
                        TextEntry::make('kind')->badge()->formatStateUsing(fn (string $state) => CustomBoxUpload::KINDS[$state] ?? $state),
                        TextEntry::make('format')->state(fn (CustomBoxUpload $record) => strtoupper($record->extension())),
                        TextEntry::make('size')->state(fn (CustomBoxUpload $record) => Number::fileSize((int) $record->size)),
                        TextEntry::make('created_at')->label('Uploaded')->since(),
                        TextEntry::make('error')->label('Problem found')->placeholder('None')->color('danger')->columnSpanFull(),
                    ]),

                Section::make('Decision')
                    ->columnSpan(1)
                    ->schema([
                        Select::make('status')->options(CustomBoxUpload::STATUSES)->required()->native(false),
                        Textarea::make('review_notes')->label('Notes')->rows(4)->maxLength(1000),
                        TextEntry::make('reviewer.name')->label('Last reviewed by')->placeholder('—'),
                    ]),

                Section::make('Automatic checks')
                    ->columnSpan(2)
                    ->columns(3)
                    ->schema(self::checks()),

                Section::make('Files')
                    ->columnSpan(1)
                    ->schema([
                        self::download('original', 'Original file'),
                        self::download('converted', 'Converted SVG'),
                        FileUpload::make('replacement_svg')
                            ->label('Replace the converted dieline')
                            ->helperText('Upload a cleaned-up SVG; it is sanitized and the customer gets it after saving.')
                            ->disk('local')
                            ->directory('custom-boxes/fixed')
                            ->acceptedFileTypes(['image/svg+xml'])
                            ->maxSize(20480)
                            ->visible(fn (CustomBoxUpload $record) => $record->kind === 'dieline')
                            ->dehydrated(),
                    ]),
            ]);
    }

    /** @return array<int, TextEntry> */
    private static function checks(): array
    {
        $meta = fn (CustomBoxUpload $record, string $key) => data_get($record->meta, $key);

        return [
            // Dielines
            TextEntry::make('sheet_size')
                ->label('Drawing size')
                ->state(fn (CustomBoxUpload $r) => $meta($r, 'width_mm') ? round($meta($r, 'width_mm')).' × '.round($meta($r, 'height_mm')).' mm' : null)
                ->placeholder('—')
                ->visible(fn (CustomBoxUpload $r) => $r->kind === 'dieline'),
            TextEntry::make('lines')->label('Lines')->state(fn (CustomBoxUpload $r) => $meta($r, 'line_count'))->placeholder('—')->visible(fn (CustomBoxUpload $r) => $r->kind === 'dieline'),
            TextEntry::make('dashed')->label('Dashed lines (creases?)')->state(fn (CustomBoxUpload $r) => $meta($r, 'dashed_count'))->placeholder('—')->visible(fn (CustomBoxUpload $r) => $r->kind === 'dieline'),
            TextEntry::make('colors')
                ->label('Stroke colours (lines)')
                ->state(fn (CustomBoxUpload $r) => collect($meta($r, 'stroke_colors') ?? [])->map(fn ($n, $c) => "{$c} ({$n})")->values()->all())
                ->badge()
                ->placeholder('—')
                ->columnSpanFull()
                ->visible(fn (CustomBoxUpload $r) => $r->kind === 'dieline'),
            // Models
            TextEntry::make('gltf_errors')->label('Validator errors')->state(fn (CustomBoxUpload $r) => $meta($r, 'validator.numErrors'))->placeholder('—')->visible(fn (CustomBoxUpload $r) => $r->kind === 'model'),
            TextEntry::make('gltf_warnings')->label('Warnings')->state(fn (CustomBoxUpload $r) => $meta($r, 'validator.numWarnings'))->placeholder('—')->visible(fn (CustomBoxUpload $r) => $r->kind === 'model'),
            TextEntry::make('uv')
                ->label('UV map')
                ->state(fn (CustomBoxUpload $r) => $meta($r, 'uv.primitives') !== null ? $meta($r, 'uv.with_uv').' of '.$meta($r, 'uv.primitives').' parts' : null)
                ->placeholder('—')
                ->visible(fn (CustomBoxUpload $r) => $r->kind === 'model'),
            TextEntry::make('vertices')->label('Vertices')->state(fn (CustomBoxUpload $r) => $meta($r, 'validator.info.totalVertexCount'))->numeric()->placeholder('—')->visible(fn (CustomBoxUpload $r) => $r->kind === 'model'),
            TextEntry::make('generator')->label('Made with')->state(fn (CustomBoxUpload $r) => $meta($r, 'validator.info.generator'))->placeholder('—')->visible(fn (CustomBoxUpload $r) => $r->kind === 'model'),
            // Photos
            TextEntry::make('photo_note')->hiddenLabel()->state('Photos are used as they are, for a preview mock-up only (not for print).')->visible(fn (CustomBoxUpload $r) => $r->kind === 'photo')->columnSpanFull(),
        ];
    }

    private static function download(string $variant, string $label): TextEntry
    {
        $path = fn (CustomBoxUpload $r) => $variant === 'original' ? $r->file : $r->converted_file;

        return TextEntry::make("download_{$variant}")
            ->label($label)
            ->state(fn (CustomBoxUpload $r) => $path($r) ? 'Download' : null)
            ->placeholder('Not available')
            ->url(fn (CustomBoxUpload $r) => $path($r) ? route('admin.custom-box-file', ['upload' => $r, 'variant' => $variant]) : null)
            ->openUrlInNewTab()
            ->visible(fn (CustomBoxUpload $r) => $variant === 'original' || $r->kind === 'dieline');
    }

    public static function statusColor(string $status): string
    {
        return CustomBoxUploadResource::statusColor($status);
    }
}
