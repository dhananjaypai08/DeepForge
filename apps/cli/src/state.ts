import { homedir } from "node:os";
import { join } from "node:path";
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs";

const DIR = join(homedir(), ".deepforge");
const FILE = join(DIR, "state.json");

type State = Record<string, Record<string, { managerId?: string }>>;

function read(): State {
  if (!existsSync(FILE)) return {};
  try {
    return JSON.parse(readFileSync(FILE, "utf8")) as State;
  } catch {
    return {};
  }
}

function write(s: State): void {
  mkdirSync(DIR, { recursive: true });
  writeFileSync(FILE, JSON.stringify(s, null, 2));
}

export function getManagerId(network: string, address: string): string | undefined {
  return read()[network]?.[address.toLowerCase()]?.managerId;
}

export function setManagerId(network: string, address: string, managerId: string): void {
  const s = read();
  s[network] ??= {};
  s[network]![address.toLowerCase()] = { managerId };
  write(s);
}
