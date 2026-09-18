# Worker boundary
Redis Streams ingestion, scheduled scanners, dead-letter handling and archive jobs are pending. The current deterministic replay CLI is `pnpm replay:market`; it runs one process and does not claim durable event delivery.
