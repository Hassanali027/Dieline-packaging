<x-mail::message>
# Thank you, {{ $quote->customer_name }}!

We have your quote request **#{{ $quote->id }}** and will get back to you shortly.

<x-mail::table>
| Item | Your request |
|:-----|:-------------|
| Size (L × W × D) | {{ rtrim(rtrim(number_format($quote->length, 2), '0'), '.') }} × {{ rtrim(rtrim(number_format($quote->width, 2), '0'), '.') }} × {{ rtrim(rtrim(number_format($quote->depth, 2), '0'), '.') }} {{ $quote->unit }} |
| Quantity | {{ number_format($quote->quantity) }} |
@if ($quote->construction)
| Construction | {{ ucfirst($quote->construction) }} |
@endif
</x-mail::table>

If anything is wrong, just reply to this email.

Thanks,<br>
{{ config('app.name') }}
</x-mail::message>
