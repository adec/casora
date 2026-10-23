# Agile electricity rate community badge

The badge shows the current electricity import rate in p/kWh. Its popup embeds the existing `custom:octopus-energy-rates-card`, using the installed HACS resource. The wrapper observes its available width and configures one column below 440px, two below 720px, and three above that. It passes live Home Assistant states to the original card. Closing the popup disconnects resize observers and timers. The original card and other dashboards are unchanged.

## Required dependencies

- [Octopus Energy integration](https://github.com/BottlecapDave/HomeAssistant-OctopusEnergy) supplies the electricity import current-rate sensor and enabled current-day/next-day rate event entities.
- [Octopus Energy Rates Card](https://github.com/lozzd/octopus-energy-rates-card) is a **required frontend dependency for the tariff popup**. Install it through HACS and ensure its JavaScript is loaded under Home Assistant's dashboard Resources. Its card type is `custom:octopus-energy-rates-card`. The Casora badge reuses this card; it does not bundle or install it.

The current-rate badge can still display a sensor value if the frontend card is missing, but the popup shows an installation message instead of the rates table. Glow can supply an optional current rate; it does not replace the Octopus forecast data or the frontend card dependency.

In Studio → Rates, select **Current electricity rate** to add it beside the desktop header's existing badges. Its advanced settings configure the Octopus current-rate sensor, today/tomorrow rate events, standing charge, thresholds, cheapest highlight and all seven band colours. A separate Community entry also provides a standalone badge. Rates has its own visibility switch and Show Popup control; Energy controls the original consumption badge independently.

Default thresholds follow the upstream card: 5 / 20 / 30 p/kWh. Limits use strict `>` comparisons. Zero/negative prices are blue; cheapest remaining prices take precedence and use light green or light blue. The installed household dashboard can override the thresholds to match its existing card. Named CSS colours, hex colours and RGB values are accepted. Colours are shared between the badge and popup. Tariff details expand beneath the rates.

Use the Octopus import current-rate sensor as the main source for Agile. Glow is an explicit optional alternative/fallback, with an optional Octopus source to identify the correct forecast meter. Prices require explicit GBP/kWh or p/kWh units (or a configured unit override); rates-event values are GBP including VAT. Expired slots are removed. Forecast matching uses MPAN, meter serial and tariff attributes, including renamed entities, and excludes export data. Standing charge can be selected explicitly. No account credentials or personal entity IDs are stored in this repository.

The popup shows published upcoming prices from the integration, rather than estimating unpublished prices. Empty tomorrow data is supported. The source card's target-time and dynamic-limit customisations are not imported automatically.

```yaml
type: custom:button-card
template: casora_badge_energy_rate
entity: sensor.your_octopus_current_rate
variables:
  today_rates: event.your_octopus_current_day_rates
  tomorrow_rates: event.your_octopus_next_day_rates
  standing_charge_entity: sensor.your_octopus_standing_charge
  lowlimit: 6
  mediumlimit: 15
  highlimit: 27
  cheapest: true
  # color_high: Tomato
```

Validation:

```sh
node dev/unit/energy_rate.mjs
node dev/unit/badge_haptic.mjs
node dev/unit/design_zaehler.mjs
node dev/unit/vorlagen_regeln.mjs
node dev/qa/check-templates.mjs dashboards/casora/button_card_templates.json
python3 tools/i18ncheck.py
```

## Category duration in the popup header

The header counts down to the first published contiguous slot in a different price category. It follows Studio's configured thresholds, combining consecutive half-hours in the same category even when their prices differ. The special cheapest-slot colour does not redefine a category. A rate of exactly the high limit is no longer expensive, matching the embedded card's strict `>` comparisons.

If the published data stops or has a gap before a category change, the header says the current category lasts **at least** until that point. Missing current-slot data or disagreement between the current price's category and that slot produces an unavailable-duration message. Tariff details include the category-change time and the rate/category immediately afterward. Countdown text refreshes through the existing 30-second live-section timer. Times use Home Assistant's configured timezone; elapsed durations use timestamps across daylight-saving changes.

## Independent Studio badge

The original Energy Studio section and `casora_badge_energy`, `casora_badge_energy_group`, and `casora_popup_energy` templates match the repository baseline. Rates is a separate section and preview badge, with independent visibility (`show_rates`), tariff settings, popup title and Show Popup control. Existing `energy_rate_*` settings remain valid; they do not belong to the stock Energy section. Header ordering uses the new `rates` category alongside the existing categories.
