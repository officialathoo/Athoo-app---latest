# Infrastructure provider architecture

Athoo selects infrastructure through configuration while keeping application contracts stable.

## Queue

The built-in durable adapter is PostgreSQL. It supports retries, deduplication, stale-lock recovery, retention, bounded concurrency, and graceful drain. `QUEUE_PROVIDER=disabled` is accepted only for controlled maintenance. Unsupported values fail closed instead of silently falling back.

## Cache

`CACHE_PROVIDER=memory` is the zero-dependency adapter certified for one API instance. `CACHE_PROVIDER=disabled` bypasses Athoo's configurable response, map, and platform-settings caches. `CACHE_PROVIDER=redis` is reserved in the configuration vocabulary but deliberately fails closed: a URL alone does not create a shared cache. Redis may be enabled only after a real adapter is installed, every cache consumer is migrated, invalidation is tested across instances, and the connected/load suites pass.

## Calling and TURN

Calling remains WebRTC-based and vendor-neutral because STUN/TURN use open protocols. Athoo supports short-lived Cloudflare TURN credentials through `CLOUDFLARE_TURN_KEY_ID` and `CLOUDFLARE_TURN_API_TOKEN`, while any standards-compliant static TURN vendor can still be selected with `STUN_URLS`, `TURN_URLS`, `TURN_USERNAME`, and `TURN_CREDENTIAL`. Master credentials never enter the mobile bundle. Drain active calls before changing providers.

## Important boundary

Configuration can switch among implemented standards and adapters without source changes. A future vendor with a proprietary, non-compatible API still requires a new adapter; no safe system can support an unknown protocol merely from a provider name.
