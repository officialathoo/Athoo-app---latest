# Infrastructure provider switch runbook

1. Configure the target provider credentials in the deployment secret manager.
2. Validate production readiness and connectivity before changing the selector.
3. Stop accepting new background work or calls when the provider is stateful.
4. Wait for queue jobs and active calls to drain.
5. Change the provider environment value.
6. Restart one instance first and check health, logs, queue stats, and call configuration.
7. Complete the rollout only after the canary instance passes.
8. Keep the previous provider available until rollback risk has passed.

Never change a queue or TURN provider during active traffic without draining. Never expose provider secrets to the mobile app or Admin Panel.

## Cache scaling gate

Keep `CACHE_PROVIDER=memory` while Render runs one API instance. Do not select `redis` merely because `REDIS_URL` exists; Phase 22 intentionally reports it as not configured until the shared adapter and cross-instance invalidation tests exist. Use `CACHE_PROVIDER=disabled` when diagnosing cache-related behavior. A future shared-cache rollout requires canary verification and a restart.
