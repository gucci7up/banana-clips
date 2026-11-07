import { getDb } from '@banana/database';
import { executeAiClippingJob } from './index';

async function startWorkerDaemon() {
  const roleArg = process.argv.find((a) => a.startsWith('--role='))?.split('=')[1];
  const workerRole = roleArg || process.env.WORKER_ROLE || 'worker-all';
  console.log(`[BANANA WORKER] Iniciando daemon para cola: ${workerRole}`);

  const db = await getDb();

  setInterval(async () => {
    try {
      await db.query(
        `UPDATE "ProcessingWorker" SET "lastHeartbeatAt" = CURRENT_TIMESTAMP, status = 'ONLINE' WHERE "queueName" = $1`,
        [workerRole]
      );

      // Poll queued or interrupted jobs
      const queued = await db.query<{ id: string }>(
        `SELECT id FROM "AnalysisJob" WHERE status = 'QUEUED' ORDER BY "createdAt" ASC LIMIT 1`
      );
      if (queued.rows.length > 0) {
        const jobId = queued.rows[0].id;
        console.log(`[BANANA WORKER] Procesando job ${jobId}...`);
        await executeAiClippingJob(jobId);
      }
    } catch (err: any) {
      console.error(`[BANANA WORKER] Error en ciclo de trabajo:`, err?.message);
    }
  }, 2500);
}

if (require.main === module) {
  startWorkerDaemon();
}
