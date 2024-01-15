import { parentPort } from 'node:worker_threads';
import { createHash } from 'node:crypto';

parentPort.on('message', ({ id, message }) => {
  parentPort.postMessage({
    id,
    hash: createHash('sha256').update(message).digest('hex')
  })
});