const RESET = '\x1b[0m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const BLUE = '\x1b[34m';
const CYAN = '\x1b[36m';

function ts(): string {
  const d = new Date();
  return d.toISOString().slice(11, 19);
}

export const log = {
  info(...args: unknown[]): void {
    console.log(`${DIM}${ts()}${RESET} ${BLUE}info${RESET}`, ...args);
  },
  success(...args: unknown[]): void {
    console.log(`${DIM}${ts()}${RESET} ${GREEN}ok  ${RESET}`, ...args);
  },
  warn(...args: unknown[]): void {
    console.warn(`${DIM}${ts()}${RESET} ${YELLOW}warn${RESET}`, ...args);
  },
  error(...args: unknown[]): void {
    console.error(`${DIM}${ts()}${RESET} ${RED}err ${RESET}`, ...args);
  },
  step(label: string): void {
    console.log(`${CYAN}▸ ${label}${RESET}`);
  },
};
