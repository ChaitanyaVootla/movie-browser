import { DefaultSession, DefaultUser } from "next-auth";
import { DefaultJWT } from "next-auth/jwt";
import type { UserRole } from "@/lib/admin";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: UserRole;
      /**
       * Google OAuth sub (numeric string).
       * Used as userId for compatibility with existing Nuxt app data.
       */
      googleId?: string;
    } & DefaultSession["user"];
  }

  interface User extends DefaultUser {
    id: string;
    role?: UserRole;
    googleId?: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT extends DefaultJWT {
    id?: string;
    role?: UserRole;
    googleId?: string;
  }
}
