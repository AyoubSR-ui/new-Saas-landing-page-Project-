# Root-level unit tests

Package-level unit tests are colocated with their source (e.g. `shared/src/**/*.test.ts`,
`server/src/**/*.test.ts`) so they run against the code they exercise. This folder is
reserved for unit tests that genuinely span multiple packages once such logic exists.
