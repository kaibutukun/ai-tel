import { Request } from "express";

export interface JwtPayload {
  sub: string;
  email: string;
  companyId: string | null;
  role: string | null;
  adminRole: boolean;
}

export type AuthenticatedRequest = Request & {
  user?: JwtPayload;
};
