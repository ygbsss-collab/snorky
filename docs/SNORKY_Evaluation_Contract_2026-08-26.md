# SNORKY Evaluation Contract

**Decision record date:** 2026-08-26  
**Status:** Controlling decision record for the topics defined below  
**Scope:** Evaluation result identity, modes, slot cardinality, reader behavior, frontend calculation policy, physical storage certainty, and scheduler evidence

## 1. Authority and conflict rule

This document resolves the currently identified conflicts among the SNORKY V1.5 algorithm documents, API/Supabase operating documents, consistency checklists, implementation reports, migrations, SQL, and current code.

For the topics explicitly decided here, this contract is the controlling decision record until its decisions are incorporated into the next formally approved specification version. Older documents remain historical references and must not override this contract for these topics.

This contract does not prove that the implementation, migrations, or production database already conform. Conformance remains a separate verification task.

## 2. Canonical result identity

The canonical uniqueness identity for a persisted evaluation result is:

```text
(point_id, target_date, mode, period_start, period_end)
```

`slot_index` is optional supporting metadata. It may be used for ordering, display, or convenience lookup, but it MUST NOT be treated as the canonical uniqueness key.

The identity is evaluated together with the persisted mode value. Internal evaluation labels do not create alternate persisted identities.

## 3. Persisted result modes

The only allowed final persisted result modes are:

```text
TODAY
TODAY_HOURLY
SHORT
MID
```

`MID_MARINE_ONLY` is an internal evaluation/input mode only. It MUST NOT be persisted as the final result mode.

The internal `MID_MARINE_ONLY` evaluation path may produce the final persisted mode `MID` after normalization at the storage boundary.

## 4. TODAY representative result

`TODAY` represents one result for the most recent valid forecast/evaluation slot relative to the current time.

`TODAY` is NOT a fixed 12:00 KST representative slot. A fixed 12:00 KST rule must not replace the current-time-relative representative rule unless this contract is formally superseded.

The representative result remains identified by the canonical five-field identity in Section 2.

## 5. TODAY_HOURLY

`TODAY_HOURLY` stores and evaluates these seven KST slots per day:

```text
03:00, 06:00, 09:00, 12:00, 15:00, 18:00, 21:00
```

The contract is seven selected hourly slots, not a complete 24-slot hourly timeline.

## 6. SHORT

`SHORT` covers +1 through +3 days.

Each day has five slots:

```text
06:00, 09:00, 12:00, 15:00, 18:00 KST
```

The contract therefore produces 15 `SHORT` results per point and evaluation run.

## 7. MID

`MID` covers +4 through +6 days.

Each day has two activity windows:

```text
AM: 06:00-12:00 KST
PM: 12:00-18:00 KST
```

The contract therefore produces 6 `MID` results per point and evaluation run.

The internal marine-only evaluation/input label remains `MID_MARINE_ONLY`; the final stored mode remains `MID`.

## 8. Aggregate Reader contract

The aggregate reader contract for one point is:

| Mode | Result count |
|---|---:|
| `TODAY` | 1 |
| `TODAY_HOURLY` | 7 |
| `SHORT` | 15 |
| `MID` | 6 |
| **Total** | **29** |

An aggregate reader that returns only 22 results is incomplete under this contract because it omits the seven `TODAY_HOURLY` results.

## 9. Frontend calculation rule

The target architecture is Reader-only / Zero Math:

- UI code consumes persisted evaluation results through the shared result reader.
- UI code must not independently recompute the authoritative evaluation result.
- Current direct `SNORKYEval` evaluation paths are legacy or incomplete migration paths.
- Those paths MUST NOT be reported as fully removed until direct code-reference verification confirms their removal or explicit test-only isolation.

The presence of a result reader does not, by itself, establish that the Zero Math migration is complete.

## 10. Physical storage certainty

This contract does not finalize a physical production table name.

`point_evaluation_results` may appear in code, migrations, SQL, reports, or local test artifacts, but that appearance is not proof that it is the finalized physical production table name.

The physical production table name, applied schema, constraints, indexes, and migration revision remain **UNCONFIRMED** until verified against the live Supabase schema.

No implementation or audit may infer production authority solely from the existence of a local migration or SQL file.

## 11. Scheduler evidence levels

Scheduler claims must distinguish three separate states:

1. **Design exists** — scheduler behavior is described in a document or SQL design.
2. **Migration exists** — a migration contains scheduler creation or update statements.
3. **Production active** — runtime evidence confirms the scheduler is installed and active in the production Supabase project.

Only the third state may be reported as production activation. SQL or migration presence alone must not be reported as active production scheduling.

## 12. Required verification boundary

Before implementation claims are upgraded to conformant, verify at minimum:

- the live result table and applied constraints;
- canonical five-field uniqueness behavior;
- persisted mode values, including absence of persisted `MID_MARINE_ONLY`;
- one TODAY representative result and seven TODAY_HOURLY results;
- 15 SHORT and 6 MID results;
- reader aggregate cardinality of 29;
- absence or explicit isolation of direct frontend evaluation paths;
- scheduler runtime activation separately from SQL/migration presence.

Until those checks are complete, this document records the controlling decisions, not an implementation certification.
