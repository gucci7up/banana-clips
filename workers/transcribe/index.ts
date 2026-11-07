// Trigger sub-worker for queue: worker-transcribe
process.argv.push('--role=worker-transcribe');
require('../src/worker-entry');
