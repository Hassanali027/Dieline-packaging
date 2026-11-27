<?php

namespace App\Filament\Resources\Library;

use App\Support\SvgMarkup;
use Closure;
use Filament\Forms\Components\FileUpload;
use Filament\Forms\Components\Textarea;
use Filament\Forms\Components\TextInput;
use Filament\Infolists\Components\TextEntry;
use Filament\Schemas\Components\Utilities\Get;
use Filament\Schemas\Components\Utilities\Set;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\HtmlString;
use Livewire\Features\SupportFileUploads\TemporaryUploadedFile;

/** Form fields shared by the Icons and Patterns admin (SVG upload / paste with a live preview). */
class LibraryFields
{
    /**
     * Free-text category that suggests the categories already in use.
     *
     * @param  class-string<Model>  $model
     */
    public static function category(string $model): TextInput
    {
        return TextInput::make('category')
            ->maxLength(60)
            ->datalist(fn () => $model::query()->whereNotNull('category')->distinct()->orderBy('category')->pluck('category')->all())
            ->helperText('Groups items in the editor, e.g. Handling, Eco, Decorative.');
    }

    /**
     * Upload an .svg file or paste SVG code; both end up in the `svg` field, sanitised on save.
     *
     * @return array<int, mixed>
     */
    public static function svg(bool $required, bool $tiled = false, ?string $requiredWithout = null): array
    {
        $field = Textarea::make('svg')
            ->label('SVG code')
            ->rows(6)
            ->live(onBlur: true)
            ->helperText('Scripts, event handlers and links to other sites are removed when saving.')
            ->rule(fn () => function (string $attribute, mixed $value, Closure $fail) {
                if (filled($value) && SvgMarkup::clean((string) $value) === null) {
                    $fail('This is not a valid SVG (it must be an <svg> document, at most 512 KB).');
                }
            })
            ->columnSpanFull();

        if ($requiredWithout) {
            $field->requiredWithout($requiredWithout)->validationMessages(['required_without' => 'Add an SVG tile or upload an image.']);
        } else {
            $field->required($required);
        }

        return [
            FileUpload::make('svg_upload')
                ->label('Upload .svg file')
                ->acceptedFileTypes(['image/svg+xml'])
                ->maxSize(512)
                ->storeFiles(false)
                ->dehydrated(false)
                ->live()
                ->afterStateUpdated(function (mixed $state, Set $set) {
                    $file = is_array($state) ? reset($state) : $state;
                    if ($file instanceof TemporaryUploadedFile) {
                        $set('svg', $file->get());
                    }
                })
                ->helperText('Fills the SVG code below.')
                ->columnSpanFull(),
            $field,
            TextEntry::make('svg_preview')
                ->label('Preview')
                ->state(function (Get $get) use ($tiled) {
                    $uri = SvgMarkup::dataUri(SvgMarkup::clean($get('svg')));
                    if (! $uri) {
                        return 'Upload or paste an SVG to see it here.';
                    }
                    $style = $tiled
                        ? 'height:120px;border-radius:12px;border:1px solid #e2e8f0;background:#fff url('.e($uri).') repeat;background-size:40px'
                        : 'height:96px;width:96px;padding:12px;border-radius:12px;border:1px solid #e2e8f0;background:#fff;object-fit:contain';

                    return new HtmlString($tiled ? '<div style="'.$style.'"></div>' : '<img alt="" src="'.e($uri).'" style="'.$style.'">');
                })
                ->columnSpanFull(),
        ];
    }
}
