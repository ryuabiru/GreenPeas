import { spawnSync } from 'node:child_process';
import { join } from 'node:path';

const vitest = join(process.cwd(), 'node_modules', 'vitest', 'vitest.mjs');
const result = spawnSync(process.execPath, [vitest, 'run',
  'src/benchmarks/mapPerformance.test.tsx', '--disableConsoleIntercept'], {
  env: { ...process.env, GREENPEAS_UI_PERF: '1' },
  stdio: 'inherit'
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
