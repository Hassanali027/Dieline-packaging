<?php

namespace App\Filament\Resources\Library;

use App\Filament\Resources\Library\Pages\ManagePatterns;
use App\Models\Pattern;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\ImageColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Columns\ToggleColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use UnitEnum;

/** Repeating patterns customers can lay over one panel or the whole box, served by /api/library. */
class PatternResource extends Resource
{
    protected static ?string $model = Pattern::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedSquares2x2;

    protected static string|UnitEnum|null $navigationGroup = 'Library';

    protected static ?int $navigationSort = 2;

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->columns(2)
            ->components([
                TextInput::make('name')->required()->maxLength(120),
                LibraryFields::category(Pattern::class),
                Toggle::make('active')->default(true)->helperText('Inactive patterns are hidden from the editor.')->columnSpanFull(),
                ...LibraryFields::svg(required: false, tiled: true, requiredWithout: 'image'),
                FileUpload::make('image')
                    ->label('Or a tile image (PNG / JPG)')
                    ->image()
                    ->acceptedFileTypes(['image/png', 'image/jpeg', 'image/webp'])
                    ->maxSize(4096)
                    ->disk('public')
                    ->directory('library/patterns')
                    ->visibility('public')
                    ->helperText('Used instead of the SVG when both are set. One seamless tile, at most 4 MB.')
                    ->columnSpanFull(),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('name')
            ->columns([
                ImageColumn::make('preview')
                    ->state(fn (Pattern $record) => $record->tileUrl())
                    ->imageSize(36)
                    ->extraImgAttributes(['style' => 'background:#fff;border-radius:8px']),
                TextColumn::make('name')->searchable()->sortable(),
                TextColumn::make('category')->badge()->placeholder('—')->sortable(),
                TextColumn::make('source')
                    ->state(fn (Pattern $record) => filled($record->image) ? 'Image' : 'SVG')
                    ->badge()
                    ->color('gray'),
                ToggleColumn::make('active'),
                TextColumn::make('updated_at')->label('Updated')->since()->sortable(),
            ])
            ->filters([
                SelectFilter::make('category')
                    ->options(fn () => Pattern::query()->whereNotNull('category')->distinct()->orderBy('category')->pluck('category', 'category')->all()),
                TernaryFilter::make('active'),
            ])
            ->recordActions([
                EditAction::make(),
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
            'index' => ManagePatterns::route('/'),
        ];
    }
}
