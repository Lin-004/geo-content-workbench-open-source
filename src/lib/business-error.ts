import { APIError } from "payload";

export function businessError(message: string, status = 400) {
  return new APIError(message, status, null, true);
}
