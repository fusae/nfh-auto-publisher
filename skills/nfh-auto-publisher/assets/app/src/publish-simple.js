import { runCli } from './cli.js';

runCli(['publish', '--mode', 'assist', ...process.argv.slice(2)]).catch(error => {
  console.error('错误:', error.message);
  process.exit(1);
});
