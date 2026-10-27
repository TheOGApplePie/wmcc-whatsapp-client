import { monitorEventLoopDelay } from 'node:perf_hooks';

const delay = monitorEventLoopDelay({ resolution: 20 });
delay.enable();

const mib = (bytes) => Number((bytes / 1024 / 1024).toFixed(2));
const ms = (nanoseconds) => Number((nanoseconds / 1e6).toFixed(2));

function sample() {
  const memory = process.memoryUsage();
  console.error(JSON.stringify({
    kind: 'runtime-metrics',
    time: new Date().toISOString(),
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    rssMiB: mib(memory.rss),
    heapUsedMiB: mib(memory.heapUsed),
    heapTotalMiB: mib(memory.heapTotal),
    externalMiB: mib(memory.external),
    arrayBuffersMiB: mib(memory.arrayBuffers),
    eventLoopP99Ms: ms(delay.percentile(99)),
    eventLoopMaxMs: ms(delay.max),
  }));
  delay.reset();
}

sample();
const timer = setInterval(sample, 30_000);
timer.unref();
process.once('exit', () => {
  clearInterval(timer);
  delay.disable();
});
