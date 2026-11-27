<x-mail::message>
# New quote request #{{ $quote->id }}

**{{ $quote->customer_name }}**@if ($quote->company_name) ({{ $quote->company_name }})@endif<br>
{{ $quote->customer_email }} · {{ $quote->customer_phone }}

<x-mail::table>
| Field | Value |
|:------|:------|
| Size (L × W × D) | {{ $quote->length }} × {{ $quote->width }} × {{ $quote->depth }} {{ $quote->unit }} |
| Quantity | {{ number_format($quote->quantity) }} |
| Construction | {{ $quote->construction ?? '—' }} |
| Board | {{ $quote->board_thickness ?? '—' }} |
| Paper | {{ $quote->paper ?? '—' }} |
| Finishes | {{ $quote->finishes ? implode(', ', $quote->finishes) : '—' }} |
| Insert | {{ $quote->insert_type ?? '—' }} |
| Saved design | {{ $quote->design_id ? '#'.$quote->design_id : '—' }} |
</x-mail::table>

@if ($quote->notes)
**Notes**

{{ $quote->notes }}
@endif

<x-mail::button :url="url('/admin/quotes/'.$quote->id.'/edit')">
Open in admin
</x-mail::button>

Preview images are attached when the customer sent them.
</x-mail::message>
