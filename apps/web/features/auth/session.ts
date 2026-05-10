export type AuthSessionSnapshot = {
  userId: string;
  accessToken: string;
  onboardingRequired: boolean;
  authMigrationRequired?: boolean;
  migrationAvailable?: boolean;
  linkedProviders?: string[];
  canPlay?: boolean;
  nicknameInput: string;
  expiresAt?: number;
};

export function hasPlayableSession(session: AuthSessionSnapshot | null): boolean {
  return !!session && !!session.userId && !!session.accessToken && !session.onboardingRequired && !session.authMigrationRequired && session.canPlay !== false;
}

export function emptyAuthSession(): AuthSessionSnapshot {
  return {
    userId: '',
    accessToken: '',
    onboardingRequired: false,
    authMigrationRequired: false,
    migrationAvailable: false,
    linkedProviders: [],
    canPlay: false,
    nicknameInput: '',
    expiresAt: 0
  };
}
