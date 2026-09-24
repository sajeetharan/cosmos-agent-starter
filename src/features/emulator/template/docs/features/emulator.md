# Emulator

The Docker Compose image is the vNext Linux emulator preview. Emulator feature parity, especially
vector indexing and hierarchical partition keys, can lag Azure. Run tenant and approval tests locally,
then opt in to Azure integration tests for vector-policy validation.

The local Compose profile uses the emulator's HTTP gateway to avoid trusting a development
certificate. Never use this endpoint mode outside local development. After the emulator is healthy
and the documented key is set in `.env`, run `npm run emulator:init`. Initialization creates
separate `conversation-history`, `agent-memory`, `application-data`, and `action-requests` containers
with the same partition keys and TTL defaults as the Bicep deployment.
