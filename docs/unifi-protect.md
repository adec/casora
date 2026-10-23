# UniFi Protect community card

Enable **UniFi Protect camera** in Studio → Community, then add a tile and choose a camera from Home Assistant's UniFi Protect integration. Use one tile per camera or doorbell. The G4 Doorbell Pro's enabled package camera is found on the same device automatically. **Second camera** optionally replaces that feed in the popup switcher.

The tile inherits Casora's camera snapshot and freshness handling. Enable **Live on the tile** in the tile editor for muted HLS streaming on the main dashboard. HLS may introduce several seconds of delay. The stream is removed when off-screen, backgrounded, disconnected or in privacy mode; failures and frozen streams fall back to the snapshot. New tiles default to snapshots. The popup expands up to 1,360 CSS pixels, capped at 94% of the viewport width. The popup adds live video with listening audio and full-screen viewing, ring and detection status, recorded event clips with playback in the existing camera viewer and downloads, time/ring filters, and available recording, detection, privacy, night-vision and doorbell-display controls. Changed or localized entity IDs are supported through the registry's device and translation keys. Missing/disabled controls are omitted.

Event clips use Home Assistant's `media_source/browse_media` and `media_source/resolve_media` APIs. They require UniFi Protect full access. The camera's configuration URL identifies its recording folder; if this metadata is absent, the library presents the camera/console folders for selection. Only a popup browses recordings; camera tiles do not fetch the event library. Playback URLs are resolved when a clip opens, are never persisted, and the player stops when dismissed.

Two-way talk, continuous recording scrubbing, Frigate-style favourites and sharing are not included. Listening and clip playback depend on the browser and the camera's available audio/video streams. New cameras become selectable when installed and adopted into Home Assistant.

Validation without Home Assistant:

```sh
node dev/unit/unifi_protect.mjs
python3 tools/build-templates.py
python3 tools/build-i18n.py
python3 tools/build-panel-i18n.py
node dev/qa/check-templates.mjs dashboards/casora/button_card_templates.json
python3 tools/i18ncheck.py
```

Select an event clip to replace the live feed within the open popup. **Back to live** restores the live camera and package-camera controls. The event list, filters, popup title and settings remain in place. Choosing a different clip replaces the current clip; closing the popup stops playback, and reopening starts with live video. Clips attempt muted autoplay, with native play/audio controls available.


## Event gallery

Choose **Gallery** or **List** above the events in the popup. Studio → edit the tile → Popup → **Event view** sets the initial view for that tile. New tiles default to List.

The gallery reveals 12 cards at a time as its scrollable area reaches the next batch. Thumbnail URLs are resolved only when cards approach the viewport; up to four resolutions run concurrently. Missing thumbnails show a placeholder while the clip stays selectable. A More button supports manual loading and browsers without intersection observers. Selecting a preview plays the clip in the existing camera viewer, with Back to live available.

Home Assistant's UniFi Protect media source returns metadata for the selected time period in one response; this is progressive card/image loading, not server-side metadata pagination. Changing the time filter requests that period. Temporary signed thumbnail URLs are cached only in the open component (up to 128, for four minutes) and released on close. Closing or changing views disconnects observers and ignores stale thumbnail responses.

## Phone panes (22 October 2026)

At phone widths (760 CSS pixels or less), the viewer stays above independently scrolling Latest Events and Event Clips panes. Camera settings remain accessible at the bottom of the Latest Events pane. List and Gallery both use the separate clip pane; progressive thumbnail loading remains scoped to the gallery scroller. Live video and recorded clips fit a compact viewer, with full-screen viewing still available. The layout measures the shared popup body after the header and adjusts when its available height changes.

Tests cover phone configuration, measured available height, card reuse on state changes, resize recalculation and cleanup during asynchronous creation. Visual verification in Safari's 393 × 852 responsive viewport confirmed independent scrolling in both List and Gallery, progressive thumbnails, in-place clip selection and return to live. This was a WebKit responsive preview, not a physical phone test. The pre-update backup is `/config/casora-protect-backups/20261022T112301Z`.

## Shared phone scrolling refinement (22 October 2026)

The phone viewer (including Listen) remains pinned. Everything beneath it—Latest Events, Event Clips in List or Gallery mode, and camera settings—now shares one scrolling area. Gallery rendering and lazy thumbnail resolution observe this shared scroller instead of a nested gallery pane. Tests cover the shared parent, gallery batches and preserved scroll position.

Installed and verified in the 393 × 852 Safari responsive preview: Latest Events and the gallery move together while the live viewer and Listen remain fixed. Ancestor padding is included in the available-height calculation to prevent residual outer scrolling. The pre-refinement backup is `/config/casora-protect-backups/20261022T161544Z`; the padding correction backup is `/config/casora-protect-backups/20261022T161647Z`.

## Relative Latest Events times (22 October 2026)

Latest Events now uses localized relative times on every display size: just now, minutes/hours ago, yesterday, and older calendar-based intervals. Labels refresh every 30 seconds while the event card remains open; hidden pages skip redraws and closed cards stop scheduling updates. The existing event-detail action is preserved. Tests cover localization, minute/hour/day/week/month/year boundaries, invalid/future dates and refresh lifecycle. The installed phone preview displayed “5 hours ago”, “21 minutes ago” and “2 hours ago”. The pre-update backup is `/config/casora-protect-backups/20261022T162534Z`.
