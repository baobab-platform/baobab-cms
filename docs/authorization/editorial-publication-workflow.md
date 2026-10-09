# Editorial roles and the publication workflow (corporate content)

Gate CMS-NAB-05. Status: implemented in code, exercised on PostgreSQL 16 through the Local API with access control on.
Not production-activated; human editors cannot sign in to production until IAM federation is proven.

## What is enforced

Applies to `site-configurations`, `portfolio-companies`, `sectors` and `insights`
(`src/baobab/authorization/publication.ts`, hooks on every write and delete):

| Change | Needs |
|---|---|
| create | `create` |
| edit a record that is not published | `update` |
| move to PUBLISHED, or edit a PUBLISHED record | `publish`, and capability `content.publish` |
| PUBLISHED to UNPUBLISHED or DRAFT | `unpublish` |
| move to ARCHIVED | `archive` |
| delete | `delete`, plus `unpublish` if published |

Permissions come from the actor's `editorialRoles` through `DEFAULT_ROLE_PERMISSIONS`. Estate bindings on the actor are honoured.
Unknown roles, no roles, no resolvable context and no user all deny. A platform administrator passes.
Default roles keep editing and publishing apart: AUTHOR and EDITOR cannot publish or change live content; PUBLISHER alone cannot edit.

## No self-elevation

On `users`, `tenantId`, `legalEntityId`, `digitalEstateIds`, `marketIds`, `locales`, `editorialRoles`, `capabilities`,
`serviceIdentity` and the legacy bindings can be changed only by a platform administrator. An editor who tries to update their own
roles, capabilities, tenant or administrator flag has the change ignored. SSO provisioning creates zero-privilege accounts, and seed
scripts use the system actor, so neither is affected. No bootstrap creates a human editor with a default password.

## Preview

Preview is not an editor feature of this API. A caller sees DRAFT content only through `content.entry.resolve` with
`preview_mode` and the `content:entry:preview` scope, and those responses are `no-store`. That scope is granted to no client today.

## Not done, by decision or dependency

- `pages` is guarded in a **transitional** mode (expand step of ADR-0019): an editor who has editorial roles is fully enforced,
  and a platform administrator and the system actor pass, but a non-administrator with **no** editorial roles is not role-checked
  and keeps the access layer's behaviour. That is a known, temporary gap, not a finished control. To close it, give every existing
  editor editorial roles, then remove `transitional: true` in `src/collections/Pages.ts` (the contract step). `product-content` is
  not guarded yet and needs the same plan (it also has a `REVIEW` state that the guard does not yet treat).
- REVIEWER holds `review` but there is no review state, so review is advisory. Four-eyes approval (publisher differs from last editor)
  and legal sign-off before publishing group-profile or legal notices need a sponsor decision, a state and a migration.
- Mapping IAM groups to editorial roles is IAM's to define; nothing here assumes group names.
- Media publication is not covered by this guard.
