<?php

namespace App\Filament\Resources\Products\Schemas;

use App\Models\Product;
use Filament\Forms\Components\Select;
use Filament\Forms\Components\TextInput;
use Filament\Forms\Components\Toggle;
use Filament\Schemas\Components\Section;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Components\Utilities\Set;
use Filament\Schemas\Schema;
use Illuminate\Support\Str;

class ProductForm
{
    public static function configure(Schema $schema): Schema
    {
        return $schema
            ->components([
                Section::make('Product')
                    ->columns(2)
                    ->schema([
                        TextInput::make('name')
                            ->required()
                            ->maxLength(120)
                            ->live(onBlur: true)
                            ->afterStateUpdated(function (Get $get, Set $set, ?string $state, string $operation) {
                                if ($operation === 'create' && blank($get('slug'))) {
                                    $set('slug', Str::slug((string) $state));
                                }
                            }),
                        TextInput::make('slug')
                            ->required()
                            ->maxLength(120)
                            ->alphaDash()
                            ->unique(ignoreRecord: true)
                            ->helperText('Editor URL: /editor/{slug}'),
                        Select::make('style')
                            ->options(Product::STYLES)
                            ->required()
                            ->live()
                            ->afterStateUpdated(function (Set $set, ?string $state) {
                                $set('construction', Product::constructionFor((string) $state));
                            }),
                        Select::make('construction')
                            ->options(['folding' => 'Folding', 'corrugated' => 'Corrugated', 'rigid' => 'Rigid'])
                            ->default('folding')
                            ->required()
                            ->live(),
                        Toggle::make('active')
                            ->default(true)
                            ->helperText('Inactive products are hidden from the editor.'),
                    ]),

                Section::make('Default size')
                    ->description('Inside dimensions the editor opens with. The customer can change them.')
                    ->columns(5)
                    ->schema([
                        TextInput::make('default_params.length')->label('Length')->numeric()->minValue(1)->required(),
                        TextInput::make('default_params.width')->label('Width')->numeric()->minValue(1)->required(),
                        TextInput::make('default_params.depth')->label('Depth')->numeric()->minValue(1)->required(),
                        TextInput::make('default_params.thickness')->label('Board')->numeric()->minValue(0.1)->step(0.05)->required(),
                        Select::make('default_params.unit')->label('Unit')->options(['mm' => 'mm', 'in' => 'in'])->default('mm')->required(),
                    ]),

                // Factory tolerances differ, so rigid defaults stay editable here (see plan, "Rigid tolerances").
                Section::make('Rigid box settings')
                    ->columns(4)
                    ->visible(fn (Get $get) => $get('construction') === 'rigid')
                    ->schema([
                        TextInput::make('default_params.rigid.boardThickness')->label('Chipboard (mm)')->numeric()->minValue(0.5),
                        TextInput::make('default_params.rigid.turnIn')->label('Turn-in (mm)')->numeric()->minValue(5),
                        TextInput::make('default_params.rigid.lidDepth')->label('Lid depth (mm)')->numeric()->minValue(0),
                        TextInput::make('default_params.rigid.lidClearance')->label('Lid clearance (mm)')->numeric()->minValue(0),
                        TextInput::make('default_params.rigid.shoulderHeight')->label('Shoulder height (mm)')->numeric()->minValue(0),
                        Toggle::make('default_params.rigid.magnet')->label('Magnet'),
                        Toggle::make('default_params.rigid.ribbonPull')->label('Ribbon pull'),
                    ]),

                Section::make('Media')
                    ->columns(2)
                    ->collapsed()
                    ->schema([
                        TextInput::make('thumbnail')->maxLength(255),
                        TextInput::make('glb_url')->label('GLB model URL')->url()->maxLength(255),
                    ]),
            ]);
    }
}
