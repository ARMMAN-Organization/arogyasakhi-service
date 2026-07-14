**ARMMAN**

**High-Level Design (HLD) Document**

| Field        | Value                                                              |
| :----------- | :----------------------------------------------------------------- |
| Program Name | Arogya Sakhi Digital Platform (1000 days Mother and Child Program) |
| Version      | 1.0                                                                |
| Date         | 12 May 2026                                                        |
| Author(s)    | Navadhiti – Solution Architecture Team                             |
| Reviewed By  | ARMMAN Technology & Program Team                                   |
| Status       | Draft – For ARMMAN Review                                          |

**CONFIDENTIAL**

# **1\. Design Principles**

**Coding Standards**

- Languages and style guides: TypeScript across Node.js backend and ReactJS web. ESLint \+ Prettier with shared ARMMAN config; PEP8 \+ Black for any Python service (data engineering, ML). Kotlin \+ ktlint for the Sakhi/Supervisor Android apps.

- Naming conventions: camelCase for variables and functions, PascalCase for React components and TypeScript types, UPPER\_SNAKE\_CASE for environment variables and config keys, snake\_case for database identifiers.

- Code review process: minimum 1 reviewer approval before merge to main; CODEOWNERS file enforces domain ownership; squash merges only; conventional commit message format.

- Test coverage: minimum 70% unit coverage on backend services; mandatory contract tests for every API surface; mobile critical-path UI tests for enrollment, visit submission and sync.

**Component-Driven Development**

- UI broken into atomic, reusable React components following Atomic Design (atoms / molecules / organisms / templates / pages).

- Shared component library packaged as @armman/ui with Storybook documentation; reused across Manager Dashboard and Admin Console.

- Mobile UI structured into reusable Jetpack Compose components: form sections, beneficiary cards, visit cards, risk badges, sync-status chips.

- Feature-flag strategy for incremental rollout: rule-based feature flags driven from backend config so features can be enabled per project / geography / role without redeployment.

**DRY Principles (Don't Repeat Yourself)**

- Shared utility functions and helpers extracted into a common @armman/core package – validators, date helpers, encryption wrappers, audit decorators.

- Centralised configuration management – all program rules (scheduling, HR detection, escalation, referral, closure, incentive) live in versioned GoRules packs; no business amounts or thresholds hardcoded in application code.

- Single rules engine deployed centrally as a microservice and reused across MaMitra, Swasth Kadam, mMitra and Arogya Sakhi via the npm package and Kotlin/WASM binding (write-once, deploy-anywhere – per ARMMAN roadmap).

- Wrapper API consolidates all external channel access (TURN/WhatsApp, Hungama/IVR, ArtPark/LLM) so individual services never embed provider-specific SDKs.

- Shared service layer for cross-cutting concerns: audit logging, idempotency, sync envelope handling, notification dispatch.

**Additional Principles**

- Offline-first for field environments – the Sakhi app must function fully without connectivity; all scheduling, risk evaluation, counselling content and form completion happens offline.

- API-first development – every API contract is defined in OpenAPI 3.0 before implementation; mobile and web teams generate typed clients from the spec.

- Fail-safe defaults – external channel outages (WhatsApp, IVR, LLM) never block field workflow; degraded modes retry asynchronously.

- Config-driven, never code-driven – any change to rules, rates, content or thresholds is a config change (versioned, audited, deployable) – not a release.

- Privacy-by-design – PII separated into a dedicated vault, encrypted/tokenised at application layer; consent and PII access logged in an append-only audit trail.

- Idempotent sync APIs – retries and partial sync never duplicate or lose records; client local\_submission\_uuid is the deduplication key.

# **2\. Module Decomposition**

## **2.1 Frontend Modules**

Two web frontends (Manager Dashboard, Admin Console) and two Android frontends (Sakhi App, Supervisor App). The structure below is shared across both web apps; Android apps follow an equivalent Kotlin/Compose package structure.

| Module / Folder         | Responsibility                                                    | Key Components                                                                                                                                   |
| :---------------------- | :---------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| layouts/                | Page shells – header, sidebar, footer, role-aware navigation      | AppLayout, AuthLayout, DashboardLayout, AdminLayout                                                                                              |
| components/shared/      | Reusable UI atoms and molecules                                   | Button, Input, Select, DatePicker, Modal, Toast, RiskBadge, SyncStatusChip, BeneficiaryCard, VisitCard                                           |
| features/beneficiaries/ | Beneficiary list, profile, status history, duplicate detection UI | BeneficiaryList, BeneficiaryProfile, EnrollmentWizard, DuplicateWarningDialog                                                                    |
| features/visits/        | Visit tracker, visit forms, risk classification view              | VisitTracker, VisitForm, RiskSummary, CounsellingPrompt                                                                                          |
| features/referrals/     | Referral creation and follow-up screens                           | ReferralForm, ReferralFollowUp, AccompaniedReferralEvidence                                                                                      |
| features/closure/       | Closure and re-open workflows                                     | ClosureForm, ReopenRequest, ClosureReviewSupervisor                                                                                              |
| features/escalations/   | Supervisor escalation queue and approvals                         | EscalationList, ApprovalDecision, TransferRequest                                                                                                |
| features/reports/       | Manager dashboard KPIs, linelists, exports                        | RegistrationsReport, HighRiskTrends, ReferralFollowUpReport, WagesReport, SakhiWiseReport, ExportCenter                                          |
| features/admin/         | User/role management, master data, form/rule/content publishing   | UserManagement, RoleAssignment, GeographyTree, FormVersionManager, RulePackPublisher, ContentLibrary, IncentiveRates                             |
| hooks/                  | Custom React hooks                                                | useAuth, useFetch, useOfflineSync (mobile), usePermissions, useFeatureFlag, usePagination, useAuditTrail                                         |
| services/               | API call wrappers (typed from OpenAPI)                            | api.ts, authService.ts, beneficiaryService.ts, visitService.ts, syncService.ts, ruleService.ts                                                   |
| store/                  | Global state management                                           | Redux Toolkit slices – auth, beneficiaries, visits, referrals, escalations, notifications, sync; or React Query for server state where preferred |
| i18n/                   | Internationalisation – English \+ Marathi (initial release)       | Locale files per feature; runtime language switching                                                                                             |

## **2.2 Backend Modules**

Microservices on Node.js (NestJS) with TypeScript. Each service has its own repository (or Nx workspace package) and follows the layered structure below.

| Layer                 | Responsibility                                                                                                                | Examples                                                                                                                                                                             |
| :-------------------- | :---------------------------------------------------------------------------------------------------------------------------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Controllers           | Handle HTTP requests, validate inputs (Zod/class-validator), return responses; thin layer only                                | beneficiaryController.ts, visitController.ts, referralController.ts, syncController.ts, approvalController.ts                                                                        |
| Services              | Core business logic, orchestration across repositories and the rules engine                                                   | enrollmentService.ts, visitOrchestrationService.ts, riskEvaluationService.ts, referralWorkflowService.ts, closureService.ts, incentiveCalculationService.ts, syncIngestionService.ts |
| Models / Repositories | Data schema definitions and ORM models (Prisma) per OLTP table                                                                | Beneficiary, BeneficiaryCase, VisitSchedule, VisitInstance, FormSubmission, RiskAssessment, RiskFlag, Referral, Closure, ApprovalRequest, IncentiveEvent, AuditLog                   |
| Middleware            | Auth guards, RBAC enforcement, error handling, request logging, correlation-id propagation, rate limiting                     | authMiddleware, rbacGuard, errorHandler, requestLogger, idempotencyMiddleware                                                                                                        |
| Rules Adapter         | Encapsulates GoRules engine calls; loads versioned rule packs and returns explained decisions for audit                       | rulesClient.ts, schedulingRules.ts, riskRules.ts, escalationRules.ts, incentiveRules.ts, closureRules.ts                                                                             |
| Session Mgmt          | JWT issuance, refresh token rotation, session expiry, device registry, offline credential bootstrap                           | tokenService.ts, deviceRegistryService.ts, sessionService.ts                                                                                                                         |
| Event Bus / Workflow  | Domain event dispatch and consumption (missed visit, HR detected, referral pending, approval requested, closure submitted)    | eventBus.ts, workflowDispatcher.ts; consumers in notificationService, escalationService, incentiveService                                                                            |
| Sync Engine           | Idempotent batch upload/download, conflict resolution, sync history, delta packaging of rules/content/master-data for devices | syncBatchService.ts, syncItemProcessor.ts, deltaPackagerService.ts                                                                                                                   |
| External Adapters     | Wrappers behind the central Wrapper API for WhatsApp/IVR/LLM, plus FCM, S3, KMS, Strapi                                       | whatsappAdapter.ts, ivrAdapter.ts, llmAdapter.ts, fcmAdapter.ts, mediaStorageAdapter.ts, secretsAdapter.ts, cmsAdapter.ts                                                            |
| Audit                 | Append-only audit trail capture for PII access, approvals, rule/rate changes, closures and exports                            | auditService.ts, auditDecorator.ts                                                                                                                                                   |

## **2.3 Database & Services**

| Component                               | Technology                                                                                      | Notes                                                                                                                                     |
| :-------------------------------------- | :---------------------------------------------------------------------------------------------- | :---------------------------------------------------------------------------------------------------------------------------------------- |
| Primary DB Adapter                      | Prisma ORM (with Postgres 8.x)                                                                  | Schema-first; migrations versioned in repo and applied via CI pipeline with approval gates                                                |
| Connection Pooling                      | Built-in Prisma pool (PgBouncer-equivalent not required for Postgres; tune RDS Proxy if needed) | Min/max pool size tuned per service; pool monitored in Grafana                                                                            |
| Cache Layer                             | Redis (AWS ElastiCache)                                                                         | Session refresh tokens, rate-limit counters, hot config (rule pack IDs, master data lookups)                                              |
| File / Object Store                     | AWS S3 (SSE-KMS)                                                                                | Consent photos, referral evidence, training photos, CMS media originals/derivatives, Metabase report exports                              |
| Message Queue                           | AWS SQS (or BullMQ on Redis for lightweight workflows)                                          | Async jobs – notification dispatch, sync post-processing, ETL triggers, incentive recalculation                                           |
| Search Tokens (PII duplicate detection) | Non-reversible hashed tokens stored in Postgres search index columns                            | Enables name+DOB+village/pada duplicate checks without decrypting PII                                                                     |
| OLAP / Data Warehouse                   | ClickHouse (open source)                                                                        | Materialised views for summarised aggregations; canonical linelist tables matching the Manager PRD; loaded from Postgres via Airflow DAGs |
| ETL Orchestration                       | Apache Airflow (managed MWAA or self-hosted)                                                    | Python DAGs with watermarking; observability, retries and config-as-code per ARMMAN roadmap                                               |
| BI / Reporting                          | Metabase                                                                                        | Self-service analyst SQL on ClickHouse; replaces engineering-built reports                                                                |
| CMS                                     | Strapi                                                                                          | Health education content authoring; offline content packs synced to devices; binary assets out of OLTP DB per roadmap                     |
| Mobile Local Store                      | Encrypted SQLite/Room (SQLCipher)                                                               | Beneficiaries, visits, forms, rule packs, content packs, sync queue; encrypted at rest with device-bound key                              |

For complete entity, table, column and ClickHouse linelist definitions, refer to the [Arogya Sakhi Database Design – ERD and Table Definitions](https://docs.google.com/document/d/18hyo9h9XFFH8pRhQfa0fzyVvCAAvzRC-/edit?usp=share_link&ouid=115654475697978190917&rtpof=true&sd=true).

# **3\. Data Flow Diagrams (DFD)**

## **3.1 Primary Request–Response Flow**

| [_Attached_](https://drive.google.com/file/d/132DKYnoPKojBfvXJeUOBR9RvCo6ciGbi/view?usp=share_link) |
| :-------------------------------------------------------------------------------------------------: |

**Flow Description**

- Step 1 – User action on the React / Android UI triggers an API call via the typed service layer (OpenAPI-generated client).

- Step 2 – Request hits the API Gateway / ALB; auth middleware validates the JWT, RBAC guard checks role, project and geography scope, and the idempotency middleware deduplicates retries using the X-Idempotency-Key header.

- Step 3 – Controller validates the payload against the schema (Zod / class-validator) and invokes the relevant service.

- Step 4 – Service orchestrates business logic: it may evaluate rules via the GoRules adapter, query/update repositories through Prisma, emit domain events to the event bus, and write audit entries via the audit decorator.

- Step 5 – Response is serialised through the controller, correlation IDs preserved, and returned to the UI. Server-side errors are translated by the global error middleware into a standard JSON envelope.

## **3.2 Offline Sync Flow**

| [_Attached_](https://drive.google.com/file/d/15rOlN9B5OWqm4E3zDAqnvItcMpRUrlkL/view?usp=share_link) |
| :-------------------------------------------------------------------------------------------------: |

- Step 1 – Field worker records data offline; visits, forms, referrals, closures, media metadata and approval requests are saved in encrypted SQLite/Room and queued in a local sync table with local\_submission\_uuid.

- Step 2 – Sync service polls for connectivity (or user taps 'Data Upload'); when available, the app uploads batches via the Sync API. Media files are uploaded directly to S3 using pre-signed URLs; the API receives references only.

- Step 3 – Server ingests batches idempotently: local\_submission\_uuid is the dedup key on sync\_items. Each form submission triggers risk evaluation via the central rules engine, stores the exact rule\_version\_id and form\_version\_id used, and emits domain events.

- Step 4 – Server resolves conflicts using record ownership and timestamps (Sakhi-owned records: last-write-wins per Sakhi; supervisor-owned approvals: server is the source of truth).

- Step 5 – Acknowledgement returned with per-item status (SUCCESS / FAILED / DUPLICATE); the device updates its local sync\_items rows and clears the queue for accepted records. Failed items remain in the queue with retry counters.

- Step 6 – As part of the same session, the app downloads deltas: published rule pack versions, content pack versions, master data updates (geography, projects, incentive rates), and pending notifications.

## **3.3 Notification / Event Flow**

| [_Attached_](https://drive.google.com/file/d/1DtGDv0kkfOOQpI4I59l-XBIqt6sOV2fR/view?usp=share_link) |
| :-------------------------------------------------------------------------------------------------: |

- Step 1 – A workflow trigger fires a domain event (HR detected on visit submission, second consecutive ANC missed, referral 7-day window elapsed, approval request raised, sync failure threshold breached).

- Step 2 – Event is dispatched to the event bus (SQS / BullMQ); consumers include Notification Service, Escalation Service and Incentive Service.

- Step 3 – Notification Service resolves notification templates and recipient(s) via RBAC and beneficiary ownership; chooses channel(s): in-app \+ FCM push for app users; WhatsApp / IVR (via Wrapper API) for beneficiary-facing comms where applicable.

- Step 4 – Delivery results (sent, delivered, read, failed) are persisted on notification records; retries follow exponential backoff with dead-letter handling.

- Step 5 – Escalation events also flow back into the Supervisor app dashboard as actionable cards with linked entities (beneficiary, visit, referral, request).

Detailed step-by-step user and system journeys (login, enrollment, visit execution, risk and referral, closure, supervisor approvals, sync, notifications, configuration) are documented in the [Arogya Sakhi User Journey Document](https://docs.google.com/document/d/15nWCSO5jGYFF-srgewr6UoXjx5TUq7Kf/edit?usp=share_link&ouid=115654475697978190917&rtpof=true&sd=true).

# **4\. Interface Design**

## **4.1 API Specification**

**API Standards**

| Field          | Value                                                                                                                     |
| :------------- | :------------------------------------------------------------------------------------------------------------------------ |
| Style          | RESTful, resource-oriented, JSON over HTTPS                                                                               |
| Base URL       | https://api.arogyasakhi.armman.org/v1 (placeholder)                                                                       |
| Format         | JSON; UTF-8; dates as ISO 8601 with timezone; UUIDs for all IDs                                                           |
| Versioning     | URL path versioning (/v1/, /v2/); breaking changes only with version bump                                                 |
| Documentation  | OpenAPI 3.0 spec checked into source; Swagger UI hosted per environment; typed clients auto-generated for web and Android |
| Pagination     | Cursor-based pagination for list endpoints (?cursor, ?limit); page metadata in response envelope                          |
| Idempotency    | X-Idempotency-Key header mandatory on all write endpoints used by the Sync API                                            |
| Correlation    | X-Request-Id header propagated end-to-end; surfaced in logs and audit trail                                               |
| Error Envelope | { errorCode, message, traceId, fieldErrors? } for all 4xx/5xx responses                                                   |

**Key Endpoints (representative sample)**

| Method | Endpoint                        | Auth Required                      | Description                                                                                        |
| :----- | :------------------------------ | :--------------------------------- | :------------------------------------------------------------------------------------------------- |
| POST   | /auth/login                     | No                                 | Authenticate user (mobile number \+ password); returns access \+ refresh tokens, role, scope       |
| POST   | /auth/refresh                   | No (refresh token)                 | Rotate access token using refresh token                                                            |
| POST   | /auth/logout                    | Yes                                | Revoke refresh token and clear server session                                                      |
| GET    | /me                             | Yes                                | Current user profile, role, project and geography scope                                            |
| GET    | /beneficiaries                  | Yes (SAKHI / SUPERVISOR / MANAGER) | List beneficiaries with filters (project, geography, status, case type, risk)                      |
| POST   | /beneficiaries                  | Yes (SAKHI)                        | Register a new beneficiary (mother or child); enforces consent and duplicate checks                |
| GET    | /beneficiaries/:id              | Yes                                | Beneficiary profile, current phase, last visits, risk state                                        |
| POST   | /beneficiaries/:id/visits       | Yes (SAKHI)                        | Submit a visit form (called via sync envelope in practice)                                         |
| GET    | /beneficiaries/:id/risk-state   | Yes                                | Current and historical risk classification                                                         |
| POST   | /referrals                      | Yes (SAKHI)                        | Create a referral (standard or accompanied) from a visit                                           |
| POST   | /referrals/:id/followup         | Yes (SAKHI)                        | Record referral follow-up within the 7-day window                                                  |
| POST   | /closures                       | Yes (SAKHI)                        | Submit a closure form for a beneficiary                                                            |
| POST   | /approval-requests              | Yes (SAKHI / SUPERVISOR)           | Generic approval surface – LMP change, re-open, accompanied referral, data restore, closure review |
| POST   | /approval-requests/:id/decision | Yes (SUPERVISOR / MANAGER)         | Approve or reject a request with notes                                                             |
| POST   | /sync/batches                   | Yes (SAKHI / SUPERVISOR)           | Upload a sync batch of mixed entities; idempotent, per-item ack                                    |
| GET    | /sync/deltas                    | Yes (SAKHI / SUPERVISOR)           | Pull delta of rule packs, content packs, master data and notifications                             |
| GET    | /reports/:reportCode            | Yes (MANAGER / ANALYST)            | Linelist / KPI export with filter context                                                          |
| GET    | /admin/rules/:setId             | Yes (ADMIN)                        | Get current published rule pack version                                                            |
| POST   | /admin/rules/:setId/publish     | Yes (ADMIN)                        | Publish a new rule pack version (audited)                                                          |

## **4.2 Authentication Flow**

| [_Attached_](https://drive.google.com/file/d/1SQKAE4MGkCaxysKd25mBBjU1sNcvoIam/view?usp=share_link) |
| :-------------------------------------------------------------------------------------------------: |

**JWT Flow**

- User submits mobile number \+ password → Auth Service validates against users.password\_hash → issues access token (short-lived, 15 minutes) and refresh token (long-lived, 30 days). Both are signed with an asymmetric key managed in AWS KMS.

- Access token sent in Authorization: Bearer \<token\> header on every protected request; RBAC guard reads role and scope claims to authorise actions.

- On expiry, client silently obtains a new access token using the refresh token via /auth/refresh; refresh tokens are stored hashed in user\_sessions and rotated on use.

- Logout invalidates the refresh token server-side and clears device-bound session metadata in user\_sessions.

- Offline bootstrap – on first online login a device-bound credential is cached in encrypted local storage so the Sakhi can log in without connectivity for the configured offline window.

- Failed-login throttling – users.failed\_login\_count is incremented on each failure; account is locked (status=LOCKED) after a threshold and requires Admin reset.

**OAuth2 Flow (if applicable)**

- OAuth2 PKCE flow is reserved for any future SSO integration (e.g., ARMMAN central identity provider or Google Workspace for admin staff).

- In v1.0, all production users authenticate with mobile number \+ password against the internal users table; OAuth2 is not in scope for the Sakhi/Supervisor field roles, where mobile number authentication is operationally necessary.

- Scopes and permissions would mirror the existing RBAC roles and project/geography scoping if OAuth2 is later introduced.

# **5\. Database Design**

## **5.1 ER Diagram (High-Level Entities)**

| [_Attached_](https://drive.google.com/file/d/1MZJFBHhsRBbUp_8PHb3UxIzWfRw26csz/view?usp=share_link) |
| :-------------------------------------------------------------------------------------------------: |

**Key Entities**

| Entity                      | Primary Key                             | Key Relationships                                                                                                                                                                                                |
| :-------------------------- | :-------------------------------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| users                       | user\_id (UUID)                         | Has many user\_roles; profiles by role (sakhi\_profiles, supervisor\_profiles); has many user\_sessions and device\_registry entries                                                                             |
| beneficiary\_pii            | pii\_id (UUID)                          | Reusable PII vault; has many beneficiary\_cases (supports re-enrollment for new pregnancy)                                                                                                                       |
| beneficiary\_cases          | beneficiary\_id (UUID)                  | Belongs to one beneficiary\_pii and one project; case\_type MOTHER / CHILD; child cases may link to mother\_beneficiary\_id; has many visit\_schedules, visit\_instances, form\_submissions, referrals, closures |
| visit\_schedules            | schedule\_id (UUID)                     | Belongs to beneficiary\_cases; generated by a rule\_versions row; has visit\_instances                                                                                                                           |
| visit\_instances            | visit\_id (UUID)                        | Belongs to schedule and beneficiary; produces form\_submissions and risk\_assessments                                                                                                                            |
| form\_submissions           | submission\_id (UUID)                   | Belongs to form\_versions, beneficiary, optional visit; stores raw form\_data\_json with form\_version\_id used at submission time                                                                               |
| risk\_assessments           | risk\_assessment\_id (UUID)             | Belongs to a submission and visit; has many risk\_flags; records the exact rule\_version\_id used                                                                                                                |
| referrals                   | referral\_id (UUID)                     | Belongs to beneficiary and visit; has many referral\_followups; optional supervisor approval via approval\_requests                                                                                              |
| closures                    | closure\_id (UUID)                      | Belongs to beneficiary; supervisor reviewed; may have a reopen\_request linked                                                                                                                                   |
| approval\_requests          | approval\_request\_id (UUID)            | Generic approval surface – LMP change, accompanied referral, re-open, data restore, closure review                                                                                                               |
| incentive\_events           | incentive\_event\_id (UUID)             | Atomic earning event sourced from a completed visit / referral / meeting / training / retainer; aggregated into payout\_lines                                                                                    |
| sync\_batches / sync\_items | sync\_batch\_id / sync\_item\_id (UUID) | Idempotent upload/download envelope; per-item dedup via local\_submission\_uuid                                                                                                                                  |
| audit\_log                  | audit\_id (UUID)                        | Append-only audit trail for PII access, approvals, rule/rate changes, closures and exports                                                                                                                       |

For complete entity, table, column and ClickHouse linelist definitions, refer to the [Arogya Sakhi Database Design – ERD and Table Definitions](https://docs.google.com/document/d/18hyo9h9XFFH8pRhQfa0fzyVvCAAvzRC-/edit?usp=share_link&ouid=115654475697978190917&rtpof=true&sd=true).

## **5.2 Caching Strategy (Redis)**

| Field             | Value                                                                                                                                                                                   |
| :---------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cache Provider    | Redis – AWS ElastiCache (cluster mode disabled for v1.0; cluster mode enabled if cross-AZ throughput requires it)                                                                       |
| Session Cache     | Hashed refresh-token lookup, RBAC role/scope claims, device fingerprint cache for high-frequency auth checks                                                                            |
| Query Cache       | Hot, slow-changing data: published rule pack metadata, master data (geography, projects, funders, incentive rates), form-version metadata, content pack manifests                       |
| Rate Limiting     | Per-IP and per-user counters for public/auth endpoints (e.g., 100 req/min/IP on /auth/\*)                                                                                               |
| TTL Strategy      | Session refresh metadata: 7 days; query cache for master data and rule metadata: 1 hour; content manifests: 15 min; rate-limit windows: 60 seconds                                      |
| Invalidation      | Event-driven – publishing a new rule/form/content version emits an invalidation event consumed by all services; write operations on master data invalidate the corresponding cache keys |
| Cache Miss Policy | Fallback to Postgres; repopulate cache on read with computed TTL; never serve stale data when staleness would affect rule evaluation                                                    |

## **5.3 Data Retention & Archival**

| Field               | Value                                                                                                                                                                                               |
| :------------------ | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Hot Data (active)   | Active beneficiary cases, open and recently closed visits, last 12 months of form submissions, current rule and content versions – retained in Postgres OLTP                                        |
| Warm Data           | Closed beneficiary cases and historical form submissions remain in Postgres with appropriate indexes; analytical copies stream to ClickHouse via Airflow for query workloads                        |
| Cold Data (archive) | Form submissions and media older than 18 months may be archived to S3 (Glacier tier) with metadata pointers retained in Postgres; ClickHouse retains aggregated linelists indefinitely              |
| PII Handling        | Beneficiary PII encrypted at application layer; access logged in audit\_log; PII not duplicated into ClickHouse – analytical store uses tokenised or aggregated identifiers                         |
| Mandatory Retention | Beneficiary health data retained for minimum 7 years post program completion per SRS; audit\_log retained indefinitely                                                                              |
| Deletion Policy     | Right-to-erasure workflow per ARMMAN Data Governance & Privacy Policy; implemented as tombstone/anonymisation that preserves aggregate reporting integrity – hard delete only when legally mandated |
| Backups             | RDS daily automated backups, 30-day retention, PITR enabled; S3 versioning on media buckets; ClickHouse periodic snapshots                                                                          |

# **6\. Security Design**

## **6.1 CORS Policies**

| Field           | Value                                                                                                                                                         |
| :-------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Allowed Origins | Production: https://manager.arogyasakhi.armman.org, https://admin.arogyasakhi.armman.org. Staging / Dev: corresponding subdomains. Wildcards never permitted. |
| Allowed Methods | GET, POST, PUT, PATCH, DELETE, OPTIONS                                                                                                                        |
| Allowed Headers | Content-Type, Authorization, X-Request-Id, X-Idempotency-Key, X-Client-Version                                                                                |
| Credentials     | Allowed only for authenticated routes from registered ARMMAN web origins; mobile apps do not rely on browser CORS                                             |
| Preflight Cache | max-age: 86400 (24 hrs)                                                                                                                                       |

## **6.2 Input Validation**

- All API inputs validated at the controller layer using Zod (Node services) / class-validator (NestJS); no controller calls a service without a parsed, typed payload.

- Parameterised queries / Prisma ORM used throughout the backend – no raw SQL string concatenation. Where raw SQL is necessary (read-only analytics queries on ClickHouse), inputs are strictly typed and templated.

- File upload validation – uploads happen via pre-signed S3 URLs with server-issued constraints on MIME type, max size, and S3 prefix; uploaded objects are virus-scanned via S3 EventBridge → Lambda before being attached to a media\_assets record.

- Rate limiting on public endpoints – e.g., 100 req/min per IP on /auth/login, 60 req/min per user on /sync/batches, configurable via Redis-backed counters.

- Mobile-side input validation mirrors the server schema and form\_versions validation\_json, but is never trusted – the server re-validates every submission.

- Form submissions are evaluated against the form\_versions.schema\_json \+ validation\_json that was active at submission time; the form\_version\_id is persisted on the submission for auditability.

## **6.3 Encryption**

| Field            | Value                                                                                                                                                                                                                                        |
| :--------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| In Transit       | TLS 1.2+ enforced on all public endpoints; HSTS enabled; internal service-to-service calls use TLS within the VPC                                                                                                                            |
| At Rest (DB)     | RDS Postgres storage encryption with AWS KMS-managed CMKs (AES-256)                                                                                                                                                                          |
| At Rest (Files)  | S3 server-side encryption with KMS (SSE-KMS); bucket policies enforce encryption-only writes                                                                                                                                                 |
| At Rest (Mobile) | SQLCipher encrypted SQLite/Room database on Sakhi/Supervisor devices; key derived from device-bound secret protected by Android Keystore                                                                                                     |
| PII Fields       | Beneficiary PII (name, phone, address, Registration number, identity documents, bank tokens) additionally encrypted/tokenised at application layer before persistence in Postgres; non-reversible search tokens used for duplicate detection |
| Key Management   | AWS KMS for envelope encryption; rotation policy 90 days for high-sensitivity keys; key access logged in CloudTrail and surfaced in audit dashboards                                                                                         |

## **6.4 Deployment Security Constraints**

- No secrets in source code – all credentials, tokens and connection strings are sourced from AWS Secrets Manager at runtime; .env files in repos are forbidden by pre-commit hooks.

- Principle of least privilege – IAM roles per microservice are scoped to the minimum required AWS actions; no shared role across services.

- Network isolation – ALB and CloudFront in public subnets; backend services, RDS, ClickHouse, Airflow, Strapi and Redis run in private subnets; egress through NAT with restricted destinations.

- Dependency scanning in CI/CD – Snyk and npm audit for Node services, OWASP Dependency-Check, container image scanning (ECR / Trivy). Critical and High CVEs block production releases.

- Security headers enforced on all responses – Content-Security-Policy, X-Frame-Options: DENY, X-Content-Type-Options: nosniff, Referrer-Policy, Strict-Transport-Security.

- Mobile app integrity – signed APKs, Play Integrity API (or equivalent) checked at login; root/jailbreak detection optional for high-trust deployments.

- VAPT – CERT-In approved Vulnerability Assessment and Penetration Testing before go-live and at major-release cadence; remediation tracked in the security backlog.

## **6.5 Data Privacy Compliance**

| Field                 | Value                                                                                                                                                                                                                                         |
| :-------------------- | :-------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Applicable Regulation | India Digital Personal Data Protection (DPDP) Act 2023; ARMMAN Data Governance & Privacy Policy                                                                                                                                               |
| Consent Management    | Beneficiary consent recorded at registration with consent\_type, status, date and media\_asset\_id pointing to the consent photo/recording; consent is auditable and revocable via a documented workflow                                      |
| Data Residency        | All data – OLTP, OLAP, object store, backups – hosted within India (AWS ap-south-1); no cross-border data transfer                                                                                                                            |
| Audit Logging         | Every access to beneficiary PII, every form submission, every approval, every rule/rate/form/content change, every closure action and every report export creates an audit\_log entry with actor, action, entity, before/after, IP and device |
| Right to Erasure      | Implemented as tombstone/anonymisation workflow preserving aggregate reporting; hard delete only when legally mandated; all erasure actions audited                                                                                           |
| Role Separation       | Strict role separation per SRS – Sakhi, Supervisor and Manager applications cannot cross-access each other's surfaces; shared data moves only through backend services and the reporting pipeline                                             |

For role-level access boundaries, consent capture journey, and cross-role handoff matrix that complements this security design, refer to the [Arogya Sakhi User Journey Document](https://docs.google.com/document/d/15nWCSO5jGYFF-srgewr6UoXjx5TUq7Kf/edit?usp=share_link&ouid=115654475697978190917&rtpof=true&sd=true).

# **Appendix**

## **A. Glossary**

| Term                      | Definition                                                                                    |
| :------------------------ | :-------------------------------------------------------------------------------------------- |
| DFD                       | Data Flow Diagram                                                                             |
| ORM                       | Object-Relational Mapper (Prisma in this design)                                              |
| JWT                       | JSON Web Token – compact token format for stateless authentication                            |
| CORS                      | Cross-Origin Resource Sharing – browser security policy for API access                        |
| PII                       | Personally Identifiable Information                                                           |
| TTL                       | Time To Live – expiry duration for cached data                                                |
| RBAC                      | Role-Based Access Control                                                                     |
| GoRules                   | Open-source decision/rules engine used for config-driven business rules                       |
| OLTP / OLAP               | Online Transactional / Online Analytical Processing                                           |
| ETL                       | Extract, Transform, Load – Postgres → ClickHouse via Apache Airflow                           |
| ANC / PP / NN / INC / CCV | Antenatal / Postpartum / Neonatal / Infant / Child Care Visit phases of the 1000-days program |
| HR                        | High-Risk classification triggering HR visit or referral                                      |
| LMP / EDD                 | Last Menstrual Period / Estimated Date of Delivery                                            |
| VAPT                      | Vulnerability Assessment and Penetration Testing                                              |
| FCM                       | Firebase Cloud Messaging                                                                      |
| KMS / DPDP                | Key Management Service / Digital Personal Data Protection Act, 2023 (India)                   |

## **B. Document History**

| Version | Date        | Author                                 | Summary of Changes                                                                                                                                                               |
| :------ | :---------- | :------------------------------------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.0     | 12 May 2026 | Navadhiti – Solution Architecture Team | Initial draft aligned to ARMMAN HLD Template v1.0, the ARMMAN Future-State Architecture Roadmap, ARMMAN Landscape Design, Arogya Sakhi SRS v2.0 and the PRD Discrepancy Register |

## **C. References**

- ARMMAN Technology Architecture Document – Arogya Sakhi (companion document)

- ARMMAN Future-State Architecture Roadmap

- ARMMAN Landscape Design (program / application / channels)

- Arogya Sakhi SRS v2.0

- PRD Discrepancy and Update Register – Arogya Sakhi

- PRD 2.0 – Arogya Sakhi

- Supervisor PRD

- Manager Dashboard Requirements (Manager PRD)

- 1000-days Visit Flow and Logic – Arogya Sakhi

- High-Risk Protocols (Developer's copy)

- API Specification – OpenAPI 3.0 (to be published)

- ARMMAN Data Governance & Privacy Policy

Companion documents (linked):

- [Arogya Sakhi Database Design – ERD and Table Definitions](https://docs.google.com/document/d/18hyo9h9XFFH8pRhQfa0fzyVvCAAvzRC-/edit?usp=share_link&ouid=115654475697978190917&rtpof=true&sd=true)
