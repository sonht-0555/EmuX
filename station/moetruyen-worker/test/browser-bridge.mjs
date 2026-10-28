import { parentPort, workerData } from 'node:worker_threads';
globalThis.self = globalThis;
globalThis.postMessage = (data, transfer) => parentPort.postMessage(data, transfer);
await import(workerData.entry);
parentPort.on('message', data => globalThis.onmessage?.({ data }));
