<?php

namespace App\Filament\Resources\CustomBoxUploads;

use App\Filament\Resources\CustomBoxUploads\Pages\EditCustomBoxUpload;
use App\Filament\Resources\CustomBoxUploads\Pages\ListCustomBoxUploads;
use App\Filament\Resources\CustomBoxUploads\Schemas\CustomBoxUploadForm;
use App\Filament\Resources\CustomBoxUploads\Tables\CustomBoxUploadsTable;
use App\Models\CustomBoxUpload;
use BackedEnum;
use Filament\Resources\Resource;
use Filament\Schemas\Schema;
use Filament\Support\Icons\Heroicon;
use Filament\Tables\Table;

/** Review queue for customers' own boxes (dielines that failed automatic processing, models, photos). */
class CustomBoxUploadResource extends Resource
{
    protected static ?string $model = CustomBoxUpload::class;

    protected static string|BackedEnum|null $navigationIcon = Heroicon::OutlinedCubeTransparent;

    protected static ?string $navigationLabel = 'Custom boxes';

    protected static ?string $modelLabel = 'custom box upload';

    protected static ?int $navigationSort = 3;

    protected static ?string $recordTitleAttribute = 'original_name';

    public static function form(Schema $schema): Schema
    {
        return CustomBoxUploadForm::configure($schema);
    }

    public static function table(Table $table): Table
    {
        return CustomBoxUploadsTable::configure($table);
    }

    public static function getPages(): array
    {
        return [
            'index' => ListCustomBoxUploads::route('/'),
            'edit' => EditCustomBoxUpload::route('/{record}/edit'),
        ];
    }

    public static function canCreate(): bool
    {
        return false;
    }

    /** How many uploads wait for a person. */
    public static function getNavigationBadge(): ?string
    {
        $count = CustomBoxUpload::where('status', CustomBoxUpload::STATUS_NEEDS_REVIEW)->count();

        return $count ? (string) $count : null;
    }

    public static function getNavigationBadgeColor(): ?string
    {
        return 'warning';
    }

    public static function statusColor(string $status): string
    {
        return match ($status) {
            CustomBoxUpload::STATUS_PENDING => 'gray',
            CustomBoxUpload::STATUS_READY => 'info',
            CustomBoxUpload::STATUS_NEEDS_REVIEW => 'warning',
            CustomBoxUpload::STATUS_APPROVED => 'success',
            CustomBoxUpload::STATUS_REJECTED => 'danger',
            default => 'gray',
        };
    }
}
