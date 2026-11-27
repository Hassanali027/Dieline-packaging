<?php

namespace App\Filament\Resources\Library;

use App\Filament\Resources\Library\Pages\ManageIcons;
use App\Models\Icon;
use App\Support\SvgMarkup;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
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

/** Icons customers can add to their box in the editor (Elements panel), served by /api/library. */
class IconResource extends Resource
{
    protected static ?string $model = Icon::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedStar;

    protected static string|UnitEnum|null $navigationGroup = 'Library';

    protected static ?int $navigationSort = 1;

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        return $schema
            ->columns(2)
            ->components([
                TextInput::make('name')->required()->maxLength(120),
                LibraryFields::category(Icon::class),
                Toggle::make('active')->default(true)->helperText('Inactive icons are hidden from the editor.')->columnSpanFull(),
                ...LibraryFields::svg(required: true),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('name')
            ->columns([
                ImageColumn::make('preview')
                    ->state(fn (Icon $record) => SvgMarkup::dataUri($record->svg))
                    ->imageSize(36)
                    ->extraImgAttributes(['style' => 'background:#fff;border-radius:8px;padding:4px']),
                TextColumn::make('name')->searchable()->sortable(),
                TextColumn::make('category')->badge()->placeholder('—')->sortable(),
                ToggleColumn::make('active'),
                TextColumn::make('updated_at')->label('Updated')->since()->sortable(),
            ])
            ->filters([
                SelectFilter::make('category')
                    ->options(fn () => Icon::query()->whereNotNull('category')->distinct()->orderBy('category')->pluck('category', 'category')->all()),
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
            'index' => ManageIcons::route('/'),
        ];
    }
}
