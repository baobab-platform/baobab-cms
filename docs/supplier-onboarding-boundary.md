# Supplier onboarding boundary (future note)

`baobab-platform/thamani` is building a supplier registration, vetting and
cross-border sourcing portal (see `baobab-platform/shared` ADR-0006 and
`baobab-platform/thamani` ADR-0002). This repository's existing boundary already
covers it correctly; this note only makes the connection explicit and
changes no code here.

ADR-0011 already excludes "procurement transactions," "supplier
accounting," and "ERP business partners" from what the Content Engine may
be authoritative for, and ADR-0015 reiterates that procurement, costing and
material-master concerns stay in iDempiere. Supplier compliance
records — applications, capability and certification declarations, review
outcomes, banking details, identity documents — are exactly that category
of data. None of it belongs in a Payload collection, public or restricted.

If a future need arises for editorial content *about* suppliers (for
example, a "become a supplier" marketing page, or public brand storytelling
for an approved supplier's products), that content follows the same model
`ProductContent.ts` already uses for commerce products: an editorial
collection linked only by a canonical identifier, never a copy of or a
direct reference into the supplier-onboarding domain's own data. No such
collection exists yet, and this note does not add one.
