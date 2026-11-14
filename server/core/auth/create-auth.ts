import { betterAuth } from 'better-auth';
import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import type { AppConfig } from '../config';
import type { Database } from '../db/client';
import { account, session, user, verification } from '../db/schema/auth';
import type { IdentityModule } from '../modules/identity';
import { AUTH_BASE_PATH, NOT_INVITED_ERROR_CODE } from './constants';

function notInvited(): APIError {
  return new APIError('FORBIDDEN', { code: NOT_INVITED_ERROR_CODE, message: 'This account is not invited.' });
}

export type AuthDependencies = Readonly<{
  db: Database;
  config: AppConfig;
  identity: IdentityModule;
}>;

/** Better Auth options (ARCHITECTURE.md sections 8.3-8.6). */
export function createAuthOptions({ db, config, identity }: AuthDependencies) {
  return {
    appName: 'Słówko',
    baseURL: config.auth.baseUrl,
    basePath: AUTH_BASE_PATH,
    secret: config.auth.secret,
    database: drizzleAdapter(db, { provider: 'pg', schema: { user, session, account, verification } }),
    emailAndPassword: { enabled: false },
    socialProviders: {
      google: {
        clientId: config.auth.googleClientId,
        clientSecret: config.auth.googleClientSecret,
        prompt: 'select_account',
      },
    },
    account: {
      accountLinking: { enabled: false },
      // We never call Google APIs, but Better Auth stores the OAuth tokens; keep them encrypted at rest.
      encryptOAuthTokens: true,
    },
    session: {
      // Off, so revocation and sign-out take effect on the very next request (ARCHITECTURE 8.6).
      cookieCache: { enabled: false },
    },
    advanced: {
      // IDs come from the uuidv7() column defaults (D-28).
      database: { generateId: false },
      // Better Auth skips its origin/CSRF check when NODE_ENV=test unless this is
      // set explicitly. Keep it on everywhere so tests exercise production behavior.
      disableOriginCheck: false,
    },
    telemetry: { enabled: false },
    databaseHooks: {
      user: {
        create: {
          // First sign-in only: invited and verified, otherwise nothing is written (ARCHITECTURE 8.4).
          before: async (candidate) => {
            if (candidate.emailVerified !== true || !(await identity.isEmailAllowed(candidate.email))) {
              throw notInvited();
            }
          },
          after: async (created) => {
            await identity.ensureSettings(created.id);
          },
        },
      },
      session: {
        create: {
          // Every sign-in: the stored user must still be invited (blocks removed users).
          before: async (candidate) => {
            if (!(await identity.isUserAllowed(candidate.userId))) {
              throw notInvited();
            }
          },
        },
      },
    },
  } satisfies BetterAuthOptions;
}

export function createAuth(dependencies: AuthDependencies) {
  return betterAuth(createAuthOptions(dependencies));
}

export type Auth = ReturnType<typeof createAuth>;
