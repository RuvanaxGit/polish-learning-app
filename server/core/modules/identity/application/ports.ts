import type { SettingsChanges, UserSettings } from '../domain/settings';

export interface AllowlistRepository {
  /** `email` is already normalized. */
  contains(email: string): Promise<boolean>;
  /** Whether the stored email of user `userId` is (still) on the allowlist. */
  containsUser(userId: string): Promise<boolean>;
  /** Inserts missing emails, never deletes. Returns how many were new. */
  addMissing(emails: readonly string[]): Promise<number>;
}

export interface UserSettingsRepository {
  /** Returns the user's settings, creating the default row if it doesn't exist. */
  getOrCreate(userId: string): Promise<UserSettings>;
  /** Applies validated changes. Creates the default row first if needed. */
  update(userId: string, changes: SettingsChanges): Promise<UserSettings>;
}
