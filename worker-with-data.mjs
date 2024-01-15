import { parentPort, workerData } from 'node:worker_threads';
import { createHash } from 'node:crypto';

const { id, message } = workerData;
parentPort.postMessage({
  id,
  hash: createHash('sha256').update(message).digest('hex')
})
process.exit();