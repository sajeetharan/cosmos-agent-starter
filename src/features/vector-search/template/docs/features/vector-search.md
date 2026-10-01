# Vector search

The `agent-memory` container defines an immutable vector embedding policy and a quantized-flat index
for Azure. The local vNext emulator uses the same policy with scan-based vector retrieval because its
preview vector index implementation does not currently create reliably.
Recall always uses a bounded `TOP N`, parameterized embedding, tenant/user filters, and hierarchical
partition-key prefix. Azure Cosmos DB vector search and optimal HPK behavior can require account-level
feature enablement; validate this path in an Azure integration environment.
