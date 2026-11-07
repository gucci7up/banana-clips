// Trigger sub-worker for queue: worker-analyze
process.argv.push('--role=worker-analyze');
require('../src/worker-entry');
