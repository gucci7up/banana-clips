// Trigger sub-worker for queue: worker-ingest
process.argv.push('--role=worker-ingest');
require('../src/worker-entry');
