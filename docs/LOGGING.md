# Logging Conventions

Morphodyne uses structured diagnostic logs for engineering observability. Diagnostic logs are not simulation `Event` records and must not become world truth.

## Required fields

Every diagnostic entry should carry:

- `level`: Trace, Debug, Information, Warning, Error, or Critical.
- `component`: the owning module or subsystem.
- `event`: a stable `snake_case` event name.
- `simulation_tick`: the authoritative fixed-step index when applicable.
- `message`: a concise human-readable explanation.

Add identifiers such as `entity_id`, `part_id`, `connection_id`, and a causal or correlation identifier only when they are relevant. Prefer structured fields over embedding identifiers in free text.

## Rules

- Use simulation ticks, not wall-clock timestamps, when ordering deterministic simulation work.
- Do not infer gameplay semantics in logs. Record physical or structural facts.
- Never log credentials, tokens, cookies, private keys, authorization headers, subscription URLs, or personal data.
- Do not use logs as a control channel or as a replacement for state and Event storage.
- Core defines world facts and must not depend on a logging implementation.
- Backends and tools may adapt `ISimulationLogSink` to Unity, console, files, or test collectors later.

The Phase 0 console sink is intentionally minimal. Production sinks, retention, rotation, telemetry, and Unity integration are deferred until a phase requires them.
