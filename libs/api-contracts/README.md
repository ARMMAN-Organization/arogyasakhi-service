# @armman/api-contracts

The OpenAPI 3.0 spec (`openapi/openapi.yaml`) is the **single source of truth** for
all API surfaces. Typed clients are generated from it and consumed by both the
backend services and the web app — so the two never drift out of sync.

API-first rule: define/extend the contract here **before** implementing an endpoint.
