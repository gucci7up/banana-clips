// Trigger sub-worker for queue: worker-render
process.argv.push('--role=worker-render');
require('../src/worker-entry');
