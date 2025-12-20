---
description: Authentication and authorization patterns using Auth.js v5
globs: ["src/lib/auth*.ts", "src/proxy.ts", "src/app/api/auth/**/*.ts", "src/components/features/auth/**/*.tsx"]
alwaysApply: false
---

# Authentication Rules

## Tech Stack

- **Auth.js v5** (NextAuth) with JWT strategy
- **Google OAuth** with Google One Tap support
- **MongoDB Adapter** for user persistence
- **Role-based access control** (admin via email whitelist)

## Architecture

### Split Configuration (Edge + Node)

Auth.js config is split for Edge Runtime compatibility:

```
src/lib/
├── auth.ts        # Full config (Node.js only) - includes MongoDB adapter
├── auth.config.ts # Edge-compatible config - used by proxy.ts
└── admin.ts       # Admin email whitelist
```

**Why?** The `proxy.ts` (middleware) runs in Edge Runtime which doesn't support:
- MongoDB driver (native `dns` module)
- Node.js-specific APIs

```typescript
// src/lib/auth.config.ts - Edge-safe
import Google from "next-auth/providers/google";

export const authConfig = {
  providers: [Google, Credentials],
  callbacks: {
    authorized: ({ auth, request }) => {
      // Route protection logic
    },
    jwt: ({ token, user }) => {
      // Add user.id and role to token
    },
    session: ({ session, token }) => {
      // Add id and role to session.user
    },
  },
};

// src/lib/auth.ts - Full Node.js config
import { MongoDBAdapter } from "@auth/mongodb-adapter";
import { authConfig } from "./auth.config";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: MongoDBAdapter(clientPromise),
  // Additional Node.js-only config
});
```

### Proxy (Route Protection)

File: `src/proxy.ts` (NOT `middleware.ts` - Next.js 16 convention)

```typescript
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";

export const { auth } = NextAuth(authConfig);

export default auth((req) => {
  const isLoggedIn = !!req.auth;
  const isProtectedRoute = req.nextUrl.pathname.startsWith("/profile");
  
  if (isProtectedRoute && !isLoggedIn) {
    return Response.redirect(new URL("/auth/signin", req.url));
  }
});

export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
```

## Google One Tap

### Component Location

`src/components/features/auth/google-one-tap.tsx`

### Behavior

- **Delay**: 2-second delay before showing (non-invasive)
- **Cooldown**: 24-hour cooldown after dismissal
- **FedCM**: Uses Federated Credential Management API where supported
- **Auto-select**: Enabled for returning users

```typescript
"use client";

export function GoogleOneTap() {
  const { status } = useSession();
  
  useEffect(() => {
    if (status === "authenticated" || status === "loading") return;
    
    // Check cooldown
    const cooldown = localStorage.getItem("google-one-tap-cooldown");
    if (cooldown && Date.now() < parseInt(cooldown)) return;
    
    // Initialize after delay
    const timer = setTimeout(() => {
      google.accounts.id.initialize({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID!,
        callback: handleCredentialResponse,
        use_fedcm_for_prompt: true,
      });
      google.accounts.id.prompt();
    }, 2000);
    
    return () => clearTimeout(timer);
  }, [status]);
}
```

### Integration

Wrap in `Providers` component:

```tsx
// src/components/providers/index.tsx
export function Providers({ children }) {
  return (
    <AuthProvider>
      <GoogleOneTap />
      {children}
    </AuthProvider>
  );
}
```

## Admin System

### Role Identification

Admins are identified by **email whitelist** in environment variables:

```typescript
// src/lib/admin.ts
export const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return ADMIN_EMAILS.includes(email.toLowerCase());
}
```

```env
# .env.local
ADMIN_EMAILS=admin@example.com,owner@example.com
```

### Role in Session

Role is added via JWT callback:

```typescript
// src/lib/auth.config.ts
callbacks: {
  jwt({ token, user }) {
    if (user) {
      token.id = user.id;
      token.role = isAdminEmail(user.email) ? "admin" : "user";
    }
    return token;
  },
  session({ session, token }) {
    if (session.user) {
      session.user.id = token.id as string;
      session.user.role = token.role as "admin" | "user";
    }
    return session;
  },
}
```

### Type Augmentation

```typescript
// src/types/next-auth.d.ts
import "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      role: "admin" | "user";
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    role?: "admin" | "user";
  }
}
```

### Protected API Routes

```typescript
// src/lib/auth.ts
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    throw new Error("Authentication required");
  }
  if (session.user.role !== "admin") {
    throw new Error("Admin access required");
  }
  return session;
}

// Usage in API route
export async function GET() {
  try {
    await requireAdmin();
    // ... admin-only logic
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 403 });
  }
}
```

### Admin UI

Admin link only visible to admins:

```tsx
// In NavBar
{session?.user?.role === "admin" && (
  <Link href="/admin">
    <Button variant="ghost" className="text-amber-500">
      Admin
    </Button>
  </Link>
)}
```

## Database Structure

### Two Databases

| Database | Purpose | Collections |
|----------|---------|-------------|
| `moviebrowser` | Auth.js adapter | `users`, `accounts`, `sessions` |
| `test` | Nuxt app data (shared) | `users`, `watchedmovies`, `movieswatchlists`, `serieslists`, `userratings`, etc. |

**Important**: The admin dashboard fetches user data from the `test` database to access Nuxt app user activity data.

```typescript
// API route for admin users
const db = client.db("test"); // Nuxt app database
const users = await db.collection("users").find().toArray();
```

### User Schema (Nuxt/test database)

```typescript
interface NuxtUser {
  _id: ObjectId;
  sub: string;           // Google user ID (primary identifier)
  name: string;
  email: string;
  picture?: string;
  location?: {
    countryCode: string;
    country: string;
    city: string;
    region: string;
    timezone: string;
  };
  createdAt: Date;
  lastVisited: Date;
}
```

### User Library Collections (test database)

The Nuxt app stores user library data with `userId` as a **number** (Google OAuth `sub` parsed as integer):

```typescript
// watchedmovies collection
interface WatchedMovie {
  _id: ObjectId;
  userId: number;        // Google sub as number (e.g., 100739281047185839198)
  movieId: number;       // TMDB movie ID
  createdAt: Date;
}

// movieswatchlists collection
interface MovieWatchlist {
  _id: ObjectId;
  userId: number;
  movieId: number;
  createdAt: Date;
}

// serieslists collection
interface SeriesWatchlist {
  _id: ObjectId;
  userId: number;
  seriesId: number;
  createdAt: Date;
}

// userratings collection
interface UserRating {
  _id: ObjectId;
  odooUserId: number;    // Google sub as number
  itemId: number;        // TMDB movie/series ID
  mediaType: "movie" | "series";
  rating: 1 | -1;        // 1 = like, -1 = dislike
  createdAt: Date;
}
```

## User ID Utility

### Getting userId for Database Queries

The session's `id` field contains the Google OAuth `sub`. Use the utility function:

```typescript
// src/lib/user-id.ts
import { auth } from "./auth";

export async function getUserIdForDb(): Promise<number | null> {
  const session = await auth();
  
  if (!session?.user) {
    return null;
  }
  
  // Try googleId first (explicitly captured), then fall back to id
  // The id field often contains the Google sub when using Google OAuth
  const googleId = session.user.googleId || session.user.id;
  
  if (googleId) {
    const parsed = parseInt(googleId, 10);
    if (!isNaN(parsed)) {
      return parsed;
    }
  }
  
  return null;
}

// Throws if not authenticated
export async function requireUserIdForDb(): Promise<number> {
  const userId = await getUserIdForDb();
  if (!userId) {
    throw new Error("Authentication required");
  }
  return userId;
}
```

### Usage in API Routes

```typescript
// src/app/api/user/watchlist/route.ts
import { getUserIdForDb } from "@/lib/user-id";

export async function GET() {
  const userId = await getUserIdForDb();
  
  if (!userId) {
    return NextResponse.json({ movies: [], series: [] });
  }
  
  // Query with numeric userId
  const watchlist = await MoviesWatchlist.find({ userId });
  // ...
}
```

## Environment Variables

```env
# Required
AUTH_SECRET=<random-32-char-string>
GOOGLE_AUTH_CLIENT_ID=<google-client-id>
GOOGLE_AUTH_CLIENT_SECRET=<google-client-secret>
NEXT_PUBLIC_GOOGLE_CLIENT_ID=<same-as-above>

# MongoDB
MONGO_IP=<ip-address>
MONGO_PORT=27018
MONGO_PASS=<password>

# Admin
ADMIN_EMAILS=admin@example.com

# Optional
NEXTAUTH_URL=http://localhost:3000
AUTH_TRUST_HOST=true
```

## Auth Components

```
src/components/features/auth/
├── google-one-tap.tsx   # Google One Tap prompt
├── login-dialog.tsx     # Manual sign-in modal
├── user-menu.tsx        # Avatar dropdown (profile, logout)
└── index.ts             # Barrel exports
```

## Common Patterns

### Check Auth in Server Component

```typescript
import { auth } from "@/lib/auth";

export default async function Page() {
  const session = await auth();
  
  if (!session) {
    redirect("/auth/signin");
  }
  
  return <div>Welcome, {session.user.name}</div>;
}
```

### Check Auth in Client Component

```typescript
"use client";
import { useSession } from "next-auth/react";

export function UserGreeting() {
  const { data: session, status } = useSession();
  
  if (status === "loading") return <Skeleton />;
  if (!session) return null;
  
  return <span>Hi, {session.user.name}</span>;
}
```

### Protected Server Action

```typescript
"use server";
import { auth } from "@/lib/auth";

export async function addToWatchlist(movieId: number) {
  const session = await auth();
  if (!session?.user?.id) {
    throw new Error("Not authenticated");
  }
  
  // ... add to watchlist
}
```

## Do NOT

- Import `auth.ts` in Edge Runtime files (use `auth.config.ts`)
- Store sensitive data in session (only id, role, basic profile)
- Use `middleware.ts` filename (use `proxy.ts` for Next.js 16)
- Hardcode admin emails (use environment variable)
- Skip type augmentation for custom session fields

