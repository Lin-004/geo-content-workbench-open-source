import type { PayloadRequest } from "payload";

export const authenticated = ({ req }: { req: PayloadRequest }): boolean => Boolean(req.user);
