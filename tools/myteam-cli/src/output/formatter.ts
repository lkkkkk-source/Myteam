/**
 * MyTeam CLI — Output Formatter (formatter.ts) — v1.1
 * -------------------------------------------------------------------------
 * 统一 CLI 输出格式（human / json）。只格式化，不做任何副作用。
 */

export type Health = "healthy" | "warning" | "error";

const MARK: Record<Health, string> = {
  healthy: "✓",
  warning: "!",
  error: "✗",
};

export function line(label: string, value: string): string {
  return `${label}: ${value}`;
}

export function health(status: Health, label: string): string {
  return `${MARK[status]} ${label}`;
}

export function header(title: string): string {
  return `\n=== ${title} ===`;
}

export function json(obj: unknown): string {
  return JSON.stringify(obj, null, 2);
}

export function report(title: string, rows: Array<[string, string]>): string {
  const body = rows.map(([k, v]) => `  ${k}: ${v}`).join("\n");
  return `${header(title)}\n${body}`;
}
