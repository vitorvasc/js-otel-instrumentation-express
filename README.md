# OpenTelemetry Express Instrumentation - Early Return `http.route` Issue

When middleware in an Express router returns a response early (e.g., cache hit, auth failure, rate limit), the `http.route` metric attribute only contains the router's mount path instead of the full matched route.

## Expected vs Actual Behavior

| Scenario                         | Request                       | Expected `http.route` | Actual `http.route` | Status         |
| -------------------------------- | ----------------------------- | --------------------- | ------------------- | -------------- |
| Normal request (reaches handler) | `GET /api/users`              | `/api/users`          | `/api/users`        | ✅ Working     |
| Early return (304 from ETag)     | `GET /api/users` with ETag    | `/api/users`          | `/api`              | ❌ Not working |
| Early return (304 from ETag)     | `GET /api/products` with ETag | `/api/products`       | `/api`              | ❌ Not working |

## Impact

All early returns from the same router produce identical metrics, losing route-level granularity.

**Affects Common Patterns:**

- **Cache middleware** - 304 responses lose route information
- **Authentication** - 401/403 responses can't be tracked per-endpoint
- **Rate limiting** - 429 responses aggregated incorrectly
- **Request validation** - 400 responses lack route context

## Installation

```bash
npm install
node main.js
```

- The server will start on `http://localhost:3000` and display test commands

- Run the test cases:

### Test 1: Baseline (No Early Return)

```bash
curl http://localhost:3000/api/users
```

- **Status:** 200 OK
- **Expected:** `http.route = /api/users`
- **Actual:** `http.route = /api/users` ✅

### Test 2: Bug (Early Return with Cache Hit)

```bash
curl http://localhost:3000/api/users -H 'If-None-Match: "12345-abcdef"'
```

- **Status:** 304 Not Modified
- **Expected:** `http.route = /api/users`
- **Actual:** `http.route = /api` ❌

### Test 3: Same Bug, Different Route

```bash
curl http://localhost:3000/api/products -H 'If-None-Match: "12345-abcdef"'
```

- **Status:** 304 Not Modified
- **Expected:** `http.route = /api/products`
- **Actual:** `http.route = /api` ❌

### Test 4: Control (No Middleware)

```bash
curl http://localhost:3000/health
```

- **Status:** 200 OK
- **Expected:** `http.route = /health`
- **Actual:** `http.route = /health` ✅

Observe the metrics output (every 3 seconds) showing the incomplete `http.route` values

## Environment

- `@opentelemetry/api`: `^1.9.0`
- `@opentelemetry/instrumentation-express`: `^0.57.0`
- `@opentelemetry/instrumentation-http`: `^0.208.0`
- `@opentelemetry/sdk-metrics`: `^2.2.0`
- `@opentelemetry/sdk-node`: `^0.208.0`
- `@opentelemetry/sdk-trace-base`: `^2.2.0`
- `express`: `^5.1.0`
