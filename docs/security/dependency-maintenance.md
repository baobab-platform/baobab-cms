# BA-SEC-DEP-001 — baobab-cms dependency and security maintenance audit

**Review date:** 7 November 2026. **Repository:** `baobab-platform/baobab-cms`. **Status:** SOURCE_COMMITTED only.

## Observed manifests and Dependabot coverage

GitHub Actions /; npm / (package.json, package-lock.json); Docker /; Docker Compose / (runtime stack); Docker Compose /.devcontainer (development topology).

## Actual dependency/security surveillance

Daily full-tree npm audit (including development dependencies) uses repository-compatible Node 24 and a fresh npm ci --ignore-scripts. Existing source CI also runs Postgres17 CMS migrations, payload and content custody; these are NOT replaced by the security job.

## Findings, unqualified boundaries and exception custody

P0: .baobab/repository.yaml contains a dependency-audit exception expiring 2026-11-09 for GHSA-vfj7-8cjw-p6xm. Its reviewer identifier is not independent approval proof. .trivyignore separately suppresses CVE-2026-93687 ONLY until 2026-12-31. The scopes/identifiers differ and must be reconciled against actual installed @payloadcms/storage-s3 -> find-node-modules -> braces paths and assembled image. Neither is silently extended or marked PASSED. The Payload peer-pinned family stays coordinated for minor/patch version updates only; major upgrades require separate native Content/PG17 qualification.

**Current disposition:** Existing time-boxed exceptions require independent Security adjudication; the source regression deliberately becomes BLOCKED when the 9 November 2026 expiry passes.

## Governance and evidence levels

Governing authority: [approved BA-SEC-DEP-001 v1.0, Shared #429](https://github.com/baobab-platform/shared/pull/429). The proposed stricter Shared validator is NOT released; this branch uses the SHA-pinned accepted Shared v2.3.0 structural validator and an owner-local positive/negative source suite. Weekly Monday Africa/Johannesburg version updates are distinct from advisory-driven security response. Routine groups apply only to minor/patch version-updates; major or security updates require independent review.

Evidence state **SOURCE_COMMITTED** means source reviewed/committed, not executed. **CI_VERIFIED**, **SECURITY_ALERT_PATH_VERIFIED**, **CONSUMER_QUALIFIED**, **STAGING_VERIFIED**, and **PRODUCTION_VERIFIED** are NOT claimed. Findings are **BLOCKED** pending an independently approved remediation or expiring exception. **WAIVED is not PASSED**. Security CODEOWNERS review applies to manifest and exception changes.

## Exit criteria

1. Run the actual final-head policy regression and accepted Shared validator; inspect live GitHub Dependabot job logs, dependency graph, Alerts, automatic security update settings and actual dependency scan results.
2. Repair reported security vulnerabilities promptly using real installed package/image provenance; independent time-bounded evidence and Security approval are required for any unpatched exceptions. Do not permit scanner errors, no-ops or ignored advisories to appear as success.
3. Re-run owner-specific native runtime, IAM/CP authority, supplier/consumer isolation, replay, migration and negative acceptance tests after a major or security update. No synthetic PSP, carrier, rule or issuer success counts as a real integration.
4. Obtain separate staging/production approvals and deployment evidence. No protected environment, credential, provider or release is activated by this policy adoption.

No CI run or monitoring, PR merge or protected business approval has been claimed.
