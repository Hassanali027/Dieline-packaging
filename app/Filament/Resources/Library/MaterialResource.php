<?php

namespace App\Filament\Resources\Library;

use App\Filament\Resources\Library\Pages\ManageMaterials;
use App\Models\Material;
use BackedEnum;
use Filament\Actions\BulkActionGroup;
use Filament\Actions\DeleteAction;
use Filament\Actions\DeleteBulkAction;
use Filament\Actions\EditAction;
use Filament\Forms\Components\CheckboxList;
use Filament\Forms\Components\ColorPicker;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Resources\Resource;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Columns\ColorColumn;
use Filament\Tables\Columns\TextColumn;
use Filament\Tables\Columns\ToggleColumn;
use Filament\Tables\Filters\SelectFilter;
use Filament\Tables\Filters\TernaryFilter;
use Filament\Tables\Table;
use Illuminate\Support\Str;
use UnitEnum;

/**
 * Boards and wrap papers. The editor colours the 2D sheet and the 3D box with them; the slug
 * is what a saved design stores (Design.material), so it cannot change once in use.
 */
class MaterialResource extends Resource
{
    protected static ?string $model = Material::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedSwatch;

    protected static string|UnitEnum|null $navigationGroup = 'Library';

    protected static ?int $navigationSort = 3;

    protected static ?string $recordTitleAttribute = 'name';

    public static function form(Schema $schema): Schema
    {
        $hex = ['regex:/^#[0-9a-fA-F]{6}$/'];

        return $schema
            ->columns(2)
            ->components([
                TextInput::make('name')
                    ->required()
                    ->maxLength(80)
                    ->live(onBlur: true)
                    ->afterStateUpdated(function (Get $get, Set $set, ?string $state, string $operation) {
                        if ($operation === 'create' && blank($get('slug'))) {
                            $set('slug', Str::slug((string) $state));
                        }
                    }),
                TextInput::make('slug')
                    ->required()
                    ->maxLength(40)
                    ->alphaDash()
                    ->unique(ignoreRecord: true)
                    ->disabledOn('edit')
                    ->helperText('Saved designs refer to this, so it is fixed after creating.'),
                Select::make('category')->options(Material::CATEGORIES)->default('board')->required(),
                Toggle::make('active')->default(true)->inline(false)->helperText('Inactive materials are hidden from the editor.'),

                Section::make('Look')
                    ->columns(2)
                    ->columnSpanFull()
                    ->schema([
                        ColorPicker::make('properties.outside')->label('Outside colour')->required()->rules($hex),
                        ColorPicker::make('properties.inside')->label('Inside colour')->required()->rules($hex),
                        TextInput::make('properties.roughness')
                            ->label('Roughness (3D)')
                            ->numeric()
                            ->minValue(0)
                            ->maxValue(1)
                            ->step(0.01)
                            ->default(0.8)
                            ->required()
                            ->helperText('0 = shiny, 1 = fully matte.'),
                        TextInput::make('properties.bumpScale')
                            ->label('Texture strength (3D)')
                            ->numeric()
                            ->minValue(0)
                            ->maxValue(1)
                            ->step(0.01)
                            ->default(0)
                            ->required()
                            ->helperText('Paper grain, e.g. 0.35 for linen. 0 = smooth.'),
                        CheckboxList::make('properties.constructions')
                            ->label('Available for')
                            ->options(Material::CONSTRUCTIONS)
                            ->default(array_keys(Material::CONSTRUCTIONS))
                            ->required()
                            ->columns(3)
                            ->columnSpanFull(),
                        FileUpload::make('image')
                            ->label('Swatch photo (optional)')
                            ->image()
                            ->maxSize(2048)
                            ->disk('public')
                            ->directory('library/materials')
                            ->visibility('public')
                            ->columnSpanFull(),
                    ]),
            ]);
    }

    public static function table(Table $table): Table
    {
        return $table
            ->defaultSort('name')
            ->columns([
                ColorColumn::make('properties.outside')->label('Outside'),
                ColorColumn::make('properties.inside')->label('Inside'),
                TextColumn::make('name')->searchable()->sortable(),
                TextColumn::make('slug')->color('gray')->searchable(),
                TextColumn::make('category')
                    ->badge()
                    ->formatStateUsing(fn (?string $state) => ['board' => 'Board', 'wrap' => 'Wrap paper'][$state] ?? $state),
                TextColumn::make('properties.constructions')
                    ->label('For')
                    ->badge()
                    ->color('gray')
                    ->formatStateUsing(fn (?string $state) => Material::CONSTRUCTIONS[$state] ?? $state),
                ToggleColumn::make('active'),
            ])
            ->filters([
                SelectFilter::make('category')->options(Material::CATEGORIES),
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
            'index' => ManageMaterials::route('/'),
        ];
    }
}
