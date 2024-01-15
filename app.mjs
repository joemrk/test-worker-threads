import { randomBytes, createHash } from 'node:crypto';
import { Worker } from 'node:worker_threads';
import { time, timeEnd } from 'node:console';
import { cpus } from 'node:os';

time('message')
const messages = Array(1 << 12).fill().map(() => randomBytes(1 << 16));
timeEnd('message');

const hashes = new Map();

// ========================= main thread

time('hashes_1');
messages.forEach((m, index) => hashes.set(index, createHash('sha256').update(m).digest('hex')));
timeEnd('hashes_1')

// message: 334.938ms
// hashes: 840.315ms

// ========================= 1 worker

const worker = new Worker('./runner.mjs');

worker.on('online', () => {
  time('hashes_2');
  messages.forEach((message, id) => {
    worker.postMessage({ id, message });
  });
})
.on('message', ({ id, hash }) => {
  hashes.set(id, hash);
  if(hashes.size === messages.length) {
    worker.unref();
    timeEnd('hashes_2');
  }
})

// message: 335.963ms
// hashes: 1.010s

// ========================= messages.length  === threads

time('hashes_3');
messages.forEach((message, id) => {
  const worker = new Worker('./worker-with-data.mjs', {
    workerData: { id, message }
  });
  worker.on('message', ({ id, hash }) => {
    hashes.set(id, hash);
    if(hashes.size === messages.length) {
      worker.unref();
      timeEnd('hashes_3');
    }
  })
})

// message: 330.399ms
// hashes: 1:06.983 (m:ss.mmm)

// ========================= logic_cores.length  === threads.length

Promise.all(cpus().map(() => new Promise((res, rej) => {
  const worker = new Worker('./worker.mjs');
  worker.on('online', () => res(worker));
  worker.on('message', ({ id, hash }) => {
    hashes.set(id, hash);
    if(hashes.size === messages.length) {
      timeEnd('hashes_4');
      process.exit();
    }
  });
})))
.then((workers) => {
  time('hashes_4');
  messages.forEach((message, id) => {
    const worker = workers[id % workers.length];
    worker.postMessage({id, message});
  })
});

// message: 325.405ms
// hashes: 292.459ms

// ========================= logic_cores.length  === threads.length with performance

const workers = [];
let activeWorkersCount = 1;
let t;

Promise.all(cpus().map(() => new Promise((res, rej) => {
  const worker = new Worker('./worker.mjs');
  worker.on('online', () => res(worker));
  worker.on('message', ({ id, hash }) => {
    hashes.set(id, hash);
    if(hashes.size === messages.length) {
      process.emit('event:end');
    }
  });
})))
.then((results) => {
  workers.push(...results);
  process.emit('event:start');
});

process
.on('event:start', () => {
  workers.forEach(w => {
    w.elu = w.performance.eventLoopUtilization();
  })
  t = process.hrtime();
  messages.forEach((message, id) => {
    const worker = workers[id % activeWorkersCount];
    worker.postMessage({id, message});
  })
})
.on('event:end', () => {
  workers.forEach(w => {
    w.util = w.performance.eventLoopUtilization(w.elu).utilization;
  })

  const average = workers.slice(0, activeWorkersCount).reduce((a, c) => (a + c.util), 0) / activeWorkersCount;
  console.log(
    'hashes:',
    activeWorkersCount.toString().padStart(2),
    ":",
    ((process.hrtime(t)[1] / 1e6) | 0).toString().padStart(4),
    "ms | ",
    Number(average * 100) | 0,
    " | ",
    workers.map(w => ((w.util * 100) | 0).toString().padStart(4)).join(' ')
  );

  if(activeWorkersCount < workers.length) {
    activeWorkersCount++;
    process.emit('event:start');
  } else {
    process.exit();
  }
})

// message: 333.995ms
// hashes:  1 :   26 ms |  99  |   99   0   0   0   0   0   0   0   0   0   0   1
// hashes:  2 :  242 ms |  99  |   99  99   0   0   0   0   0   0   0   0   0   0
// hashes:  3 :  281 ms |  99  |  100 100  99   0   0   0   0   0   0   0   0   0
// hashes:  4 :  318 ms |  99  |  100 100 100  99   0   0   0   0   0   0   0   0
// hashes:  5 :  255 ms |  99  |  100 100 100 100  99   0   0   0   0   0   0   0
// hashes:  6 :  290 ms |  98  |  100 100 100 100 100  90   0   0   0   0   0   0
// hashes:  7 :  310 ms |  97  |  100 100 100 100 100  95  83   0   0   0   0   0
// hashes:  8 :  335 ms |  93  |  100 100 100 100 100  93  79  78   0   0   0   0
// hashes:  9 :  398 ms |  89  |  100 100 100 100  94  89  84  71  65   0   0   0
// hashes: 10 :  382 ms |  81  |  100 100 100  97  76  75  78  69  62  60   0   0
// hashes: 11 :  368 ms |  73  |  100 100 100  74  62  64  66  66  61  59  54   0
// hashes: 12 :  365 ms |  67  |  100 100 100  54  56  59  61  59  60  53  51  49