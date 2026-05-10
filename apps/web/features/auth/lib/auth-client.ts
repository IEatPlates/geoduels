import type { RuntimeConfig } from "../../../lib/runtime-config";
import { readError } from "../../../lib/http";
import type { LeaderboardSummary } from "../controllers/session-controller";

export async function requestSession(config: RuntimeConfig) {
  const resp = await fetch(`${config.apiURL}/v1/auth/session`, {
    credentials: "include",
  });
  if (resp.status === 204) {
    return null;
  }
  if (!resp.ok) {
    return null;
  }
  return resp.json();
}

export async function requestGuestSession(config: RuntimeConfig) {
  const resp = await fetch(`${config.apiURL}/v1/auth/guest`, {
    method: "POST",
    credentials: "include",
  });
  if (!resp.ok) {
    throw new Error(await readError(resp, "Guest login failed"));
  }
  return resp.json();
}

export async function requestRefreshSession(config: RuntimeConfig) {
  const resp = await fetch(`${config.apiURL}/v1/auth/refresh`, {
    method: "POST",
    credentials: "include",
  });
  if (!resp.ok) {
    return null;
  }
  return resp.json();
}

export async function requestMe(config: RuntimeConfig, accessToken: string) {
  const resp = await fetch(`${config.apiURL}/v1/me`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });
  return resp;
}

export type UserNotification = {
  id: number;
  type: string;
  payload: {
    refundDelta?: number;
    matchId?: string;
    cheaterUserId?: string;
    mmrBefore?: number;
    mmrAfter?: number;
  };
  createdAt: string;
};

export async function requestUserNotifications(
  config: RuntimeConfig,
  accessToken: string,
): Promise<{ notifications: UserNotification[] }> {
  const resp = await fetch(`${config.apiURL}/v1/me/notifications`, {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!resp.ok) {
    return { notifications: [] };
  }
  return resp.json();
}

export async function markUserNotificationRead(
  config: RuntimeConfig,
  accessToken: string,
  notificationId: number,
) {
  await fetch(
    `${config.apiURL}/v1/me/notifications/${encodeURIComponent(notificationId)}/read`,
    {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}` },
    },
  );
}

export async function requestLeaderboard(
  config: RuntimeConfig,
  accessToken?: string,
): Promise<LeaderboardSummary | null> {
  const resp = await fetch(`${config.apiURL}/v1/leaderboard`, {
    headers: accessToken
      ? { Authorization: `Bearer ${accessToken}` }
      : undefined,
  });
  if (!resp.ok) {
    return null;
  }
  return resp.json();
}

export async function requestLogout(config: RuntimeConfig) {
  await fetch(`${config.apiURL}/v1/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function requestCompleteOnboarding(
  config: RuntimeConfig,
  accessToken: string,
  nickname: string,
) {
  const resp = await fetch(`${config.apiURL}/v1/auth/onboarding`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ nickname }),
  });
  if (!resp.ok) {
    throw new Error(await readError(resp, "Failed to save nickname"));
  }
  return resp.json();
}

export async function requestUpdateNickname(
  config: RuntimeConfig,
  accessToken: string,
  nickname: string,
) {
  const resp = await fetch(`${config.apiURL}/v1/me/nickname`, {
    method: "PATCH",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ nickname }),
  });
  return resp;
}

export async function requestGoogleStart(
  config: RuntimeConfig,
  accessToken?: string,
  returnTo?: string,
) {
  const resp = await fetch(`${config.apiURL}/v1/auth/google/start`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ returnTo }),
  });
  if (!resp.ok) {
    throw new Error(await readError(resp, "Failed to start Google migration"));
  }
  return resp.json();
}

export async function requestDiscordStart(
  config: RuntimeConfig,
  accessToken?: string,
  returnTo?: string,
) {
  const resp = await fetch(`${config.apiURL}/v1/auth/discord/start`, {
    method: "POST",
    credentials: "include",
    headers: {
      "content-type": "application/json",
      ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
    },
    body: JSON.stringify({ returnTo }),
  });
  if (!resp.ok) {
    throw new Error(await readError(resp, "Failed to start Discord sign-in"));
  }
  return resp.json();
}

export async function requestLobbyChangelog(config: RuntimeConfig) {
  const resp = await fetch(`${config.apiURL}/v1/content/lobby-changelog`);
  if (!resp.ok) {
    return null;
  }
  return resp.json() as Promise<{
    eyebrow?: string;
    title?: string;
    markdown?: string;
  }>;
}

export async function requestMatchReport(
  config: RuntimeConfig,
  accessToken: string,
  matchId: string,
  reportedUserId: string,
  category = "cheating",
  reason = "",
) {
  const resp = await fetch(
    `${config.apiURL}/v1/matches/${encodeURIComponent(matchId)}/reports`,
    {
      method: "POST",
      headers: {
        "content-type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ reportedUserId, category, reason }),
    },
  );
  if (!resp.ok) {
    throw new Error(await readError(resp, "Failed to send report"));
  }
}
