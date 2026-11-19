import { spawnSync } from 'node:child_process';

const isWin = process.platform === 'win32';

// Windows cmd uchun argumentni xavfsiz qo'shtirnoqqa olish
const quoteWin = (a) => (/[\s"&|<>^()%!]/.test(a) ? `"${String(a).replace(/"/g, '""')}"` : a);

/**
 * Buyruqni ishga tushiradi. Windows'da avval shell'siz (claude.exe, ffmpeg.exe),
 * kerak bo'lsa (npx.cmd, claude.cmd) shell bilan qayta urinadi.
 * @returns {{stdout: string, stderr: string, shell: boolean}}
 */
export function run(cmd, args, { label = cmd, input, inherit = false, cwd = process.cwd(), env, timeoutMs } = {}) {
  const shown = args.map((a) => (String(a).length > 120 ? `${String(a).slice(0, 117)}...` : a)).join(' ');
  console.log(`[${label}] ${cmd} ${shown}`);
  const base = {
    cwd,
    env: { ...process.env, ...env },
    encoding: 'utf-8',
    input,
    maxBuffer: 64 * 1024 * 1024,
    timeout: timeoutMs,
    stdio: inherit ? ['pipe', 'inherit', 'inherit'] : 'pipe',
    windowsHide: true,
  };
  let res = spawnSync(cmd, args, { ...base, shell: false });
  let shell = false;
  if (isWin && res.error && ['ENOENT', 'EINVAL'].includes(res.error.code)) {
    shell = true;
    res = spawnSync(quoteWin(cmd), args.map(quoteWin), { ...base, shell: true });
  }
  if (res.error) throw new Error(`[${label}] ishga tushmadi: ${res.error.message}`);
  if (res.status !== 0) {
    const tail = `${res.stderr || ''}\n${res.stdout || ''}`.trim().split('\n').slice(-40).join('\n');
    throw new Error(`[${label}] xato (exit ${res.status}):\n${tail}`);
  }
  return { stdout: res.stdout || '', stderr: res.stderr || '', shell };
}

export const npxCmd = isWin ? 'npx.cmd' : 'npx';
