# Relationships

## Storage Convention

A relationship is stored as a single row in the `relationships` table:

```
contact_id  →  related_contact_id  with  relationship_type_id
```

**`related_contact_id` IS `type.name` OF `contact_id`.**

In other words: `contact_id` is the person who CREATED the relationship (the profile owner). `type.name` describes what `related_contact_id` is to them.

### Examples

| contact_id | related_contact_id | type | Meaning |
|---|---|---|---|
| Monica (1968) | Harald (1945) | parent | Harald is parent of Monica |
| Monica (1968) | Kevin (1995) | child | Kevin is child of Monica |
| Robert | Veronica | spouse | Veronica is spouse of Robert |
| Thomas | Robert | sibling | Robert is sibling of Thomas |

### Key Rules

1. **Parent type: related_contact_id (parent) is always older.** `related_contact_id` should have an earlier birth year than `contact_id`.
2. **Grandparent follows the same rule.** `related_contact_id` (grandparent) is older.
3. **Symmetric types** (spouse, sibling, cousin, friend, neighbor, colleague, classmate, ex, cohabitant) — direction doesn't matter, both sides are equivalent. `inverse_name === name`.
4. **Asymmetric types** — direction matters:

| type.name | type.inverse_name | contact_id is... | related_contact_id is... |
|---|---|---|---|
| parent | child | the child | the parent |
| grandparent | grandchild | the grandchild | the grandparent |
| uncle_aunt | nephew_niece | the nephew/niece | the uncle/aunt |
| stepparent | stepchild | the stepchild | the stepparent |
| godparent | godchild | the godchild | the godparent |
| boss | employee | the employee | the boss |
| mentor | mentee | the mentee | the mentor |
| owner | pet | the pet | the owner |

## Profile Display

The profile page uses two queries combined with UNION ALL:

### Forward query (I am `contact_id`)
- Shows: `related_contact_id` person
- Label: `type.name` — what the other person IS to me
- `is_inverse = 0`

### Inverse query (I am `related_contact_id`)
- Shows: `contact_id` person
- Label: `type.inverse_name` — what the other person IS to me (derived from stored direction)
- `is_inverse = 1`

### How the user reads it

On Monica's profile, she sees "Harald — Parent":
- This comes from the **forward query**: `contact_id=Monica, related=Harald, type.name=parent`
- Convention says: **Harald is parent of Monica** ✓
- User reads it as: **Harald is my parent** ✓
- These match — display is correct.

Both queries consistently show "Person — what they are to me", which is the natural reading.

## Relationship Suggestions

Suggestions are generated on-the-fly by `GET /api/relationships/suggestions`. The format is:

```
contact1 is suggested_type of contact2
```

When accepted, it creates: `contact_id=contact1, related_contact_id=contact2, type=suggested_type`.

### Rules (9 total)
1. Children of same parent → siblings
2. _(empty)_
3. Partner's children → partner is parent (max 2 parents per child)
4. Parent's parent → grandparent
5. Parent's sibling → uncle/aunt
6. Sibling's children → uncle/aunt (I am uncle/aunt to them)
7. Parent's sibling's children → cousin
8. Partner's parents → in-law
9. Grandparent's partner → grandparent

### Dismissed suggestions
Stored in `dismissed_suggestions` table (tenant_id, contact1_id, contact2_id, suggested_type). Filtered out on every fetch. Can be restored via UI.

## Consistency Report

`GET /api/relationships/consistency` checks for:
- Self-relationships (person related to themselves)
- Duplicate relationships (same pair + type)
- Parent younger than child (birth_year comparison)
- Parent less than 12 years older than child
- Grandparent younger than grandchild
- Spouse age gap > 40 years

Actions: swap direction (↔) or delete.

## Family Tree

`GET /api/relationships/family-tree/:uuid?generations=N` builds a generation-based tree:
- Uses parent/child edges only for generation assignment
- Ancestors: BFS upward (following "parent" edges — other is my parent, gen-1)
- Descendants: BFS downward (following "child" edges — other is my child, gen+1)
- Siblings of root: same generation (gen 0)
- Partners: placed beside their partner, no further traversal
- Depth = number of generations, not relationship hops

## Edit Dialog

When editing a relationship, the dropdown shows both forward and inverse options for asymmetric types (e.g. "Parent" and "Child"). For symmetric types (sibling, spouse), only one option is shown.

The swap button (↔) exchanges `contact_id` and `related_contact_id` in the database, effectively reversing the relationship direction.

`is_inverse` flag on relationship rows indicates whether the relationship was loaded via the inverse query. This is used to pre-select the correct option in the edit dropdown.
