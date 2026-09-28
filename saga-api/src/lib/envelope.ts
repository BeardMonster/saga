export interface Envelope<T> {
  status: "ok" | "error";
  message: string;
  code: number;
  data: T | null;
}

export function ok<T>(data: T, message = "OK", code = 200): Envelope<T> {
  return { status: "ok", message, code, data };
}

export function err(message: string, code = 500): Envelope<null> {
  return { status: "error", message, code, data: null };
}
