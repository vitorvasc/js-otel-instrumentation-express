/**
 * Bug Reproduction: @opentelemetry/instrumentation-express
 *
 * Issue: When middleware returns early (before reaching route handler),
 * the http.route attribute is incomplete, showing only the router mount path
 * instead of the full matched route.
 *
 * Expected: http.route should always be the complete matched route
 * Actual: http.route is incomplete when middleware returns early
 */

const { NodeSDK } = require('@opentelemetry/sdk-node');
const {
  PeriodicExportingMetricReader,
  ConsoleMetricExporter,
} = require('@opentelemetry/sdk-metrics');
const { HttpInstrumentation } = require('@opentelemetry/instrumentation-http');
const {
  ExpressInstrumentation,
} = require('@opentelemetry/instrumentation-express');

// Initialize OpenTelemetry SDK
const sdk = new NodeSDK({
  metricReader: new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(),
    exportIntervalMillis: 3000,
  }),
  instrumentations: [
    new HttpInstrumentation(),
    new ExpressInstrumentation({
      requestHook: (span, info) => {
        const req = info.request;
        const route = span.attributes['http.route'];

        console.log('\n=== OpenTelemetry Request Hook ===');
        console.log(`URL: ${req.method} ${req.url}`);
        console.log(`http.route: ${route}`);
        console.log('==================================\n');
      },
    }),
  ],
});

sdk.start();

// Create Express app
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

// API-specific router (mounted at /api within main router)
const apiRouter = express.Router();

// ETag validation middleware - returns early on cache hit
apiRouter.use([
  (req, res, next) => {
    console.log('[ETag Middleware] Checking cache');

    const etag = req.headers['if-none-match'];
    const currentETag = '"12345-abcdef"';

    if (etag && etag === currentETag) {
      console.log('[ETag Middleware] ✓ Cache hit - returning 304');
      console.log(
        '[ETag Middleware] ⚠️  Early return - route handler NOT reached'
      );
      res.status(304).end();
      return; // EARLY RETURN - This is where the bug occurs
    }

    console.log('[ETag Middleware] ✗ Cache miss - continuing to route handler');
    res.setHeader('ETag', currentETag);
    next();
  },
]);

// Define routes on the API router
apiRouter.get('/users', (req, res) => {
  console.log('[Route Handler] GET /users executed');
  res.json({
    message: 'Users list',
    note: 'This handler was reached - full route should be captured',
  });
});

apiRouter.get('/products', (req, res) => {
  console.log('[Route Handler] GET /products executed');
  res.json({
    message: 'Products list',
    note: 'This handler was reached - full route should be captured',
  });
});

// Mount main router at / on the app
app.use('/', apiRouter);

// Start server
app.listen(port, () => {
  console.log('\n' + '='.repeat(80));
  console.log('OpenTelemetry Express');
  console.log('Early Middleware Return vs Route Matching');
  console.log('='.repeat(80));
  console.log(`\nServer running on http://localhost:${port}\n`);
  console.log('Test Commands:\n');

  console.log('1️⃣  BASELINE (no early return):');
  console.log(`   curl http://localhost:${port}/api/users`);
  console.log('   Expected: http.route = /api/users');
  console.log('   Actual:   http.route = /api/users ✅\n');

  console.log('2️⃣  Early return with ETag match:');
  console.log(
    `   curl http://localhost:${port}/api/users -H 'If-None-Match: "12345-abcdef"'`
  );
  console.log('   Expected: http.route = /api/users');
  console.log('   Actual:   http.route = /api ❌ (incomplete!)\n');

  console.log('3️⃣  Same scenario with different route:');
  console.log(
    `   curl http://localhost:${port}/api/products -H 'If-None-Match: "12345-abcdef"'`
  );
  console.log('   Expected: http.route = /api/products');
  console.log('   Actual:   http.route = /api ❌ (incomplete!)\n');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  sdk
    .shutdown()
    .then(() => console.log('SDK shut down successfully'))
    .catch((error) => console.log('Error shutting down SDK', error))
    .finally(() => process.exit(0));
});
