# Shelfie

A shared household record of what food is in stock, where, and when it expires, so two people can use it up and know what to buy.

## Language

**Household**:
The two people sharing one Larder; all Products, Batches and Locations belong to exactly one Household.
_Avoid_: Family, group, account

**Member**:
A person in a Household, known by a display name, recorded as who added stock or made a Usage entry.
_Avoid_: User, owner

**Product**:
A catalogue entry for a kind of food (name, brand, size, category, image, base unit), shared by the household.
_Avoid_: Item, SKU

**Batch**:
Stock of one Product bought together, with its own expiry date, Location and amount remaining.
_Avoid_: Item, entry, record, lot

**Larder**:
All current Batches held by the household.
_Avoid_: Pantry, inventory, stock list

**Location**:
A user-defined place a Batch is kept (fridge, freezer, pantry).
_Avoid_: Storage, shelf

**Base unit**:
The single measure a Product is counted in (grams, millilitres or count); a Batch's remaining amount is stored in it.
_Avoid_: Unit type

**Usage entry**:
A log record of one change to a Batch's amount, used, wasted, corrected or split, with who made it and when.
_Avoid_: Transaction, event

**Split**:
The division of a Batch when part of it is opened: the opened portion becomes a new Batch and the original keeps the rest.
_Avoid_: Partial use (using part of a Batch does not split it)

**Waste reason**:
Why a wasted Usage entry was thrown away: Expired, Went off early, Didn't like it or Other.
_Avoid_: Cause, note

**Waste report**:
A month's view of wasted Usage entries (net of corrections): estimated cost, number of wasted Batches, most wasted Products and split by Waste reason.
_Avoid_: Waste log, statistics

**Finished Batch**:
A Batch whose amount has reached zero; kept as history and hidden from the Larder.
_Avoid_: Archived, deleted

**Date kind**:
Whether a Batch's printed date is a use-by date (safety: do not eat after) or a best-before date (quality: still safe after); best-before unless stated.
_Avoid_: Date type, expiry type

**Expired**:
A Batch whose use-by date, or opened "use within" limit, has passed; it should be thrown away.
_Avoid_: Off, out of date

**Past best**:
A Batch whose best-before date has passed; still safe stock, lower quality.
_Avoid_: Expired

**Expiring soon**:
A Batch whose effective date falls within the household's warning window (global days, overridable per Product).
_Avoid_: Due, near expiry

**Shopping list entry**:
Something to buy, by name, optionally linked to a Product, with an optional free-text quantity; can be ticked as in the basket.
_Avoid_: Item, list item

**Running-low threshold**:
An optional amount per Product; when the Product's total stock (excluding Expired Batches) falls to or below it, the Product is added to the shopping list.
_Avoid_: Reorder point, minimum stock

**Household settings**:
The few settings both Members share, such as the expiry warning window; everything else is set per phone.
_Avoid_: Preferences, config

**Daily digest**:
The one notification each Member's phone shows per day, summarising Batches that need attention.
_Avoid_: Reminder, alert (for a single Batch)

**Opened Batch**:
A Batch that has been opened, with an optional "use within N days" limit that can bring its effective expiry forward.
_Avoid_: Started

**Receipt alias**:
A remembered mapping from an abbreviated receipt line (such as "CHKN BRST") to a Product, so the same line matches automatically next time.
_Avoid_: Synonym, receipt rule

**Needs attention**:
The screen, and its banner and tab badge, listing Batches that are Expired, Past best, Expiring soon or missing a date.
_Avoid_: Alerts, dashboard

**Needs a date**:
The state of a Batch saved without an expiry date (skipped at capture); it has no urgency colour and never triggers the Daily digest.
_Avoid_: Undated, unknown expiry
