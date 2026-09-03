# Integration tests

Phase 0's only integration surface is the server's own `/health` endpoint, tested in
`server/src/routes/health.test.ts` with a mocked database. This folder is for integration
tests that span real services (e.g. Shopify OAuth flow, Phase 1; product sync, Phase 2)
once those services exist.
