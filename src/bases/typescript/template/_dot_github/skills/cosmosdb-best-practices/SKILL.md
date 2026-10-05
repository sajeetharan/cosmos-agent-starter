---
name: cosmosdb-best-practices
description: |
  Azure Cosmos DB for NoSQL design and implementation guidance based on the
  AzureCosmosDB/cosmosdb-agent-kit. Use when designing data models or partition
  keys, writing or reviewing Cosmos DB queries and SDK code, configuring indexing
  or throughput, implementing vector search, or preparing Cosmos DB workloads for
  production.
license: MIT
metadata:
  author: AzureCosmosDB/cosmosdb-agent-kit
  source: https://github.com/AzureCosmosDB/cosmosdb-agent-kit
---

# Azure Cosmos DB best practices

Apply this skill on demand whenever a task creates, changes, or reviews Azure Cosmos DB code or infrastructure.

## Required practices

### Data model and partitioning

- Start from access patterns and transaction boundaries. Embed data read and updated together; reference independently growing or infrequently read data.
- Keep documents well below the 2 MB item limit and version document schemas.
- Choose an immutable, high-cardinality partition key that distributes storage and request units evenly.
- Scope tenant data with a tenant-led hierarchical partition key when the workload is multi-tenant.
- Ensure common queries include the full partition key or a useful hierarchical prefix. Avoid designs that depend on routine cross-partition scans.
- Plan for logical-partition growth and hot partitions before selecting a key.

### Queries and indexing

- Prefer point reads when both `id` and the partition key are known.
- Parameterize user-controlled values. Use literal integers for `TOP`.
- Project only required fields and page with continuation tokens; do not use unbounded `fetchAll()`.
- Keep indexing policies intentional. Exclude unused paths and add composite indexes for supported multi-property `ORDER BY` queries.
- Treat analytical aggregation and broad scans as separate workloads; do not force OLAP patterns onto a transactional container.

### SDK usage and reliability

- Reuse one `CosmosClient` per process and use asynchronous APIs.
- Use `DefaultAzureCredential` or Managed Identity in Azure. Account keys are allowed only for the local emulator.
- Use direct connection mode for production unless the hosting environment requires gateway mode.
- Honor SDK retry-after behavior for throttling and design operations to be idempotent.
- Use ETags for read-modify-write concurrency and atomic patch operations where applicable.
- Record request charge, latency, status, and Cosmos diagnostics without logging sensitive document bodies.
- Configure preferred regions and availability behavior when the application is globally distributed.

### Throughput, vector search, and operations

- Choose serverless for eligible intermittent workloads and autoscale for variable provisioned workloads; never configure provisioned throughput on a serverless account.
- Define vector embedding and vector indexing policies together. Keep vector dimensions and distance functions consistent with the embedding model.
- Filter vector queries by tenant partition scope and return bounded results.
- Monitor normalized RU consumption, throttling, storage growth, and P99 latency.
- Test production data paths against the Cosmos DB emulator or an isolated Azure environment.

## Project-specific invariants

- Preserve the repository's `RequestContext` trust boundary; never accept tenant or user identity from model output or request payload fields.
- Keep every user-data operation tenant scoped.
- Preserve provenance, inspection, and deletion support for durable agent memory.
- Require explicit approval before consequential actions and prevent an agent from approving its own action.
- Keep infrastructure, emulator initialization, runtime container definitions, and partition-key values aligned.

## Review workflow

1. Identify the operation's access pattern, partition scope, expected cardinality, and growth.
2. Check data modeling and partition-key correctness before optimizing queries.
3. Check query bounds, parameters, projections, pagination, and indexes.
4. Check client lifetime, identity, retries, concurrency, diagnostics, and regional configuration.
5. Check throughput mode, vector policies, monitoring, and tests.
6. Call out any tradeoff that cannot be verified from the repository rather than inventing workload assumptions.

For the full maintained rule catalog and examples, use the
[Azure Cosmos DB Agent Kit](https://github.com/AzureCosmosDB/cosmosdb-agent-kit).
