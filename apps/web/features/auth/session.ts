export type AuthSessionSnapshot = {
  userId: string;
  accessToken: string;
  onboardingRequired: boolean;
  nicknameInput: string;
  expiresAt?: number;
};

export function hasPlayableSession(session: AuthSessionSnapshot | null): boolean {
  return !!session && !!session.userId && !!session.accessToken && !session.onboardingRequired;
}

export function emptyAuthSession(): AuthSessionSnapshot {
  return {
    userId: '',
    accessToken: '',
    onboardingRequired: false,
    nicknameInput: '',
    expiresAt: 0
  };
}
