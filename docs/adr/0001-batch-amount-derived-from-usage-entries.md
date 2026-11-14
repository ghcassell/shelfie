# Batch remaining amount is derived from Usage entries, not stored

Sync is hand-rolled, and edits to the same field from two Members are resolved by last-write-wins on a server timestamp. If a Batch stored its remaining amount, two Members using the same Batch offline would each overwrite it, and one use would silently disappear. Instead, a Batch keeps its starting amount, and its remaining amount is always the starting amount minus its immutable, append-only Usage entries; mistakes are fixed with a "corrected" entry, never an edit. Appends never conflict, so both uses survive sync. A total below zero (both used the last tin) shows as zero and the Batch is Finished.

## Considered Options

- **Stored amount with last-write-wins:** simplest, but loses concurrent uses, which is the most common conflict in a shared pantry.
- **PowerSync:** tested sync, but adds op-sqlite, a second service and a second idle-deactivation clock; it still needs a merge rule for amounts.

## Consequences

- Never write a remaining-amount column that sync treats as authoritative. If one is cached for speed, rebuild it from Usage entries.
- Usage entries are never updated or deleted, including by sync.
- Entry kinds are used, wasted, corrected and split. Opening part of a Batch appends a `split` entry to the original and creates a new Batch; the starting amount is never edited.
- A `corrected` entry may reverse one earlier entry via `reverses_entry_id`; if two phones reverse the same entry offline, only the earliest reversal counts.
- Two phones splitting or using the same Batch offline are not reconciled: amounts sum, below zero shows as zero.
