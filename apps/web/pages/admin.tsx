import Head from "next/head";
import Link from "next/link";
import { useRouter } from "next/router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { MoreVertical } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  requestAdminBanPlayer,
  requestAdminAddIPSignupBan,
  requestAdminClearMaintenance,
  requestAdminClearReporterMute,
  requestAdminDemoteModerator,
  requestAdminDebugTestReports,
  requestAdminGetChangelog,
  requestAdminIPSignupBans,
  requestAdminModerationCase,
  requestAdminModerationCaseAction,
  requestAdminModerationCases,
  requestAdminMaintenance,
  requestAdminModerationSettings,
  requestAdminPlayerMatches,
  requestAdminPlayers,
  requestAdminPromoteModerator,
  requestAdminPutChangelog,
  requestAdminPutMaintenance,
  requestAdminPutModerationSettings,
  requestAdminRemoveIPSignupBan,
  requestAdminUnbanPlayer,
  requestAdminUploadCurrentMap,
} from "../features/admin/lib/admin-client";
import { useHomeModel } from "../features/home/model/useHomeModel";
import type { MaintenanceStatus } from "../features/matchmaking/lib/queue-client";
import { getRuntimeConfig } from "../lib/runtime-config";

type Player = {
  userId: string;
  email?: string;
  displayName: string;
  mmr: number;
  gamesPlayed: number;
  wins: number;
  rankedGamesPlayed: number;
  isAdmin: boolean;
  isModerator: boolean;
  isBanned: boolean;
  banReason?: string;
  lastIpAddress?: string;
  reportMutedUntil?: string;
};

type ModerationCase = {
  id: number;
  targetUserId: string;
  targetDisplayName: string;
  status: string;
  priority: string;
  score: number;
  reportCount: number;
  uniqueReporterCount: number;
  categories: Record<string, number>;
  summary?: string;
  latestActivityAt: string;
};

type PlayerReport = {
  id: number;
  caseId: number;
  matchId: string;
  reporterUserId: string;
  reporterName: string;
  category: string;
  reason?: string;
  reporterWeight: number;
  createdAt: string;
};

type ModerationEvent = {
  id: number;
  eventType: string;
  body?: string;
  createdAt: string;
};

type MatchHistory = {
  matchId: string;
  mode: string;
  endedAt: string;
  winnerUserId?: string;
};

type IPBan = {
  id: number;
  ipAddress: string;
  reason?: string;
  createdAt: string;
};

type AdminTab = "players" | "reports" | "content" | "access" | "debug";

function toDateTimeLocal(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString();
}

export default function AdminPage() {
  const config = getRuntimeConfig();
  const { view } = useHomeModel({ routeContext: "home" });
  const queryClient = useQueryClient();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [banReason, setBanReason] = useState<Record<string, string>>({});
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedMapKey, setSelectedMapKey] = useState("a-source-world");
  const [mapStatus, setMapStatus] = useState("");
  const [draftEyebrow, setDraftEyebrow] = useState("");
  const [draftTitle, setDraftTitle] = useState("");
  const [selectedCaseId, setSelectedCaseId] = useState<number | null>(null);
  const [selectedHistoryUserId, setSelectedHistoryUserId] = useState("");
  const [selectedHistoryName, setSelectedHistoryName] = useState("");
  const [caseActionReason, setCaseActionReason] = useState("");
  const [openPlayerMenuId, setOpenPlayerMenuId] = useState("");
  const [ipBanAddress, setIPBanAddress] = useState("");
  const [ipBanReason, setIPBanReason] = useState("");
  const [maintenancePhase, setMaintenancePhase] =
    useState<MaintenanceStatus["phase"]>("normal");
  const [maintenanceStartsAt, setMaintenanceStartsAt] = useState("");
  const [maintenanceEndsAt, setMaintenanceEndsAt] = useState("");
  const [maintenanceQueuePaused, setMaintenanceQueuePaused] = useState(false);
  const [maintenancePlayPaused, setMaintenancePlayPaused] = useState(false);
  const [maintenanceMessage, setMaintenanceMessage] = useState("");
  const [discordWebhookUrl, setDiscordWebhookUrl] = useState("");
  const [debugReportedUserId, setDebugReportedUserId] = useState("");
  const [debugReportCount, setDebugReportCount] = useState(3);
  const [debugReportCategory, setDebugReportCategory] = useState("cheating");
  const [debugReportReason, setDebugReportReason] = useState(
    "Generated from admin debug tab",
  );
  const [debugReportResult, setDebugReportResult] = useState("");
  const accessToken = view.auth.accessToken;
  const canManageAdmin = !!view.auth.isAdmin;
  const canViewReports = !!view.auth.isAdmin || !!view.auth.isModerator;
  const canBanReportedPlayers = canViewReports;
  const activeTab = ((): AdminTab => {
    const raw = Array.isArray(router.query.tab)
      ? router.query.tab[0]
      : router.query.tab;
    if (
      raw === "players" ||
      raw === "reports" ||
      raw === "content" ||
      raw === "access" ||
      raw === "debug"
    ) {
      return canManageAdmin || raw === "reports" || raw === "players"
        ? raw
        : "reports";
    }
    return canViewReports ? "reports" : "players";
  })();

  useEffect(() => {
    if (!router.isReady || router.query.tab) return;
    if (canManageAdmin) {
      void router.replace("/admin/players");
    } else if (canViewReports) {
      void router.replace("/admin/reports");
    }
  }, [canManageAdmin, canViewReports, router]);

  const playersQuery = useQuery({
    queryKey: ["admin-players", query, accessToken],
    enabled: canViewReports && !!accessToken,
    queryFn: async () => requestAdminPlayers(config, accessToken, query),
    staleTime: 5_000,
  });

  const changelogQuery = useQuery({
    queryKey: ["admin-changelog", accessToken],
    enabled: canManageAdmin && !!accessToken,
    queryFn: async () => requestAdminGetChangelog(config, accessToken),
  });

  const moderationCasesQuery = useQuery({
    queryKey: ["admin-moderation-cases", accessToken],
    enabled: canViewReports && !!accessToken,
    queryFn: async () => requestAdminModerationCases(config, accessToken),
    staleTime: 5_000,
  });

  const selectedCaseQuery = useQuery({
    queryKey: ["admin-moderation-case", selectedCaseId, accessToken],
    enabled: canViewReports && !!accessToken && selectedCaseId !== null,
    queryFn: async () =>
      requestAdminModerationCase(config, accessToken, selectedCaseId || 0),
  });

  const selectedMatchesQuery = useQuery({
    queryKey: ["admin-player-matches", selectedHistoryUserId, accessToken],
    enabled: canViewReports && !!accessToken && !!selectedHistoryUserId,
    queryFn: async () =>
      requestAdminPlayerMatches(config, accessToken, selectedHistoryUserId),
  });

  const ipBansQuery = useQuery({
    queryKey: ["admin-ip-signup-bans", accessToken],
    enabled: canManageAdmin && !!accessToken,
    queryFn: async () => requestAdminIPSignupBans(config, accessToken),
  });

  const maintenanceQuery = useQuery({
    queryKey: ["admin-maintenance", accessToken],
    enabled: canManageAdmin && !!accessToken,
    queryFn: async () => requestAdminMaintenance(config, accessToken),
  });

  const moderationSettingsQuery = useQuery({
    queryKey: ["admin-moderation-settings", accessToken],
    enabled: canManageAdmin && !!accessToken,
    queryFn: async () => requestAdminModerationSettings(config, accessToken),
  });

  useEffect(() => {
    const status = maintenanceQuery.data;
    if (!status) return;
    setMaintenancePhase(status.phase || "normal");
    setMaintenanceStartsAt(toDateTimeLocal(status.startsAt));
    setMaintenanceEndsAt(toDateTimeLocal(status.endsAt));
    setMaintenanceQueuePaused(!!status.queuePaused);
    setMaintenancePlayPaused(!!status.playPaused);
    setMaintenanceMessage(status.message || "");
  }, [maintenanceQuery.data]);

  useEffect(() => {
    const settings = moderationSettingsQuery.data;
    if (!settings) return;
    setDiscordWebhookUrl(settings.discordWebhookUrl || "");
  }, [moderationSettingsQuery.data]);

  const [draftChangelog, setDraftChangelog] = useState("");
  const effectiveEyebrow = useMemo(() => {
    if (draftEyebrow) return draftEyebrow;
    return typeof changelogQuery.data?.eyebrow === "string"
      ? changelogQuery.data.eyebrow
      : "Latest News";
  }, [draftEyebrow, changelogQuery.data?.eyebrow]);

  const effectiveTitle = useMemo(() => {
    if (draftTitle) return draftTitle;
    return typeof changelogQuery.data?.title === "string"
      ? changelogQuery.data.title
      : "GeoDuels v1.1";
  }, [draftTitle, changelogQuery.data?.title]);

  const effectiveChangelog = useMemo(() => {
    if (draftChangelog) return draftChangelog;
    return typeof changelogQuery.data?.markdown === "string"
      ? changelogQuery.data.markdown
      : "";
  }, [draftChangelog, changelogQuery.data?.markdown]);

  const refreshAdminData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ["admin-players"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-cases"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-moderation-case"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-player-matches"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-ip-signup-bans"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-changelog"] }),
      queryClient.invalidateQueries({ queryKey: ["admin-maintenance"] }),
      queryClient.invalidateQueries({
        queryKey: ["admin-moderation-settings"],
      }),
      queryClient.invalidateQueries({ queryKey: ["lobby-changelog"] }),
      queryClient.invalidateQueries({ queryKey: ["queue-online"] }),
    ]);
  };

  const banMutation = useMutation({
    mutationFn: async ({
      userId,
      reason,
    }: {
      userId: string;
      reason: string;
    }) => {
      await requestAdminBanPlayer(config, accessToken, userId, reason);
    },
    onSuccess: refreshAdminData,
  });

  const banWithIPMutation = useMutation({
    mutationFn: async ({
      userId,
      reason,
      ipAddress,
    }: {
      userId: string;
      reason: string;
      ipAddress: string;
    }) => {
      await requestAdminBanPlayer(config, accessToken, userId, reason);
      await requestAdminAddIPSignupBan(
        config,
        accessToken,
        ipAddress,
        reason || `Banned with player ${userId}`,
      );
    },
    onSuccess: refreshAdminData,
  });

  const unbanMutation = useMutation({
    mutationFn: async (userId: string) => {
      await requestAdminUnbanPlayer(config, accessToken, userId);
    },
    onSuccess: refreshAdminData,
  });

  const clearReporterMuteMutation = useMutation({
    mutationFn: async (userId: string) => {
      await requestAdminClearReporterMute(config, accessToken, userId);
    },
    onSuccess: refreshAdminData,
  });

  const promoteModeratorMutation = useMutation({
    mutationFn: async (userId: string) => {
      await requestAdminPromoteModerator(config, accessToken, userId);
    },
    onSuccess: refreshAdminData,
  });

  const demoteModeratorMutation = useMutation({
    mutationFn: async (userId: string) => {
      await requestAdminDemoteModerator(config, accessToken, userId);
    },
    onSuccess: refreshAdminData,
  });

  const caseActionMutation = useMutation({
    mutationFn: async ({
      caseId,
      actionType,
      status,
      reason,
      muteUserId,
    }: {
      caseId: number;
      actionType: string;
      status?: string;
      reason?: string;
      muteUserId?: string;
    }) =>
      requestAdminModerationCaseAction(config, accessToken, caseId, {
        actionType,
        status,
        reason,
        muteUserId,
      }),
    onSuccess: async () => {
      setCaseActionReason("");
      await refreshAdminData();
    },
  });

  const saveChangelogMutation = useMutation({
    mutationFn: async (content: {
      eyebrow: string;
      title: string;
      markdown: string;
    }) => requestAdminPutChangelog(config, accessToken, content),
    onSuccess: refreshAdminData,
  });

  const debugTestReportsMutation = useMutation({
    mutationFn: async () =>
      requestAdminDebugTestReports(config, accessToken, {
        reportedUserId: debugReportedUserId.trim(),
        count: debugReportCount,
        category: debugReportCategory,
        reason: debugReportReason,
      }),
    onSuccess: async (result) => {
      setDebugReportResult(
        `Created ${result.reportsCreated} reports in case #${result.caseId}`,
      );
      setSelectedCaseId(result.caseId);
      await refreshAdminData();
    },
  });

  const uploadMapMutation = useMutation({
    mutationFn: async (params: { file: File; mapKey: string }) =>
      requestAdminUploadCurrentMap(config, accessToken, params.file, params.mapKey),
    onSuccess: async (data: { revisionId?: string; rowCount?: number }) => {
      setMapStatus(
        `Uploaded revision ${data.revisionId || "unknown"} with ${data.rowCount || 0} rows.`,
      );
      setSelectedFile(null);
      await refreshAdminData();
    },
  });

  const addIPBanMutation = useMutation({
    mutationFn: async () =>
      requestAdminAddIPSignupBan(
        config,
        accessToken,
        ipBanAddress,
        ipBanReason,
      ),
    onSuccess: async () => {
      setIPBanAddress("");
      setIPBanReason("");
      await refreshAdminData();
    },
  });

  const removeIPBanMutation = useMutation({
    mutationFn: async (ipAddress: string) =>
      requestAdminRemoveIPSignupBan(config, accessToken, ipAddress),
    onSuccess: refreshAdminData,
  });

  const saveMaintenanceMutation = useMutation({
    mutationFn: async (status: MaintenanceStatus) =>
      requestAdminPutMaintenance(config, accessToken, status),
    onSuccess: refreshAdminData,
  });

  const clearMaintenanceMutation = useMutation({
    mutationFn: async () => requestAdminClearMaintenance(config, accessToken),
    onSuccess: async () => {
      setMaintenancePhase("normal");
      setMaintenanceStartsAt("");
      setMaintenanceEndsAt("");
      setMaintenanceQueuePaused(false);
      setMaintenancePlayPaused(false);
      setMaintenanceMessage("");
      await refreshAdminData();
    },
  });

  const saveModerationSettingsMutation = useMutation({
    mutationFn: async (webhookUrl?: string) =>
      requestAdminPutModerationSettings(config, accessToken, {
        discordWebhookUrl: (webhookUrl ?? discordWebhookUrl).trim(),
      }),
    onSuccess: async (settings) => {
      setDiscordWebhookUrl(settings.discordWebhookUrl || "");
      await refreshAdminData();
    },
  });

  const currentMaintenanceDraft = (): MaintenanceStatus => {
    const startsAt = fromDateTimeLocal(maintenanceStartsAt);
    const endsAt = fromDateTimeLocal(maintenanceEndsAt);
    return {
      phase: maintenancePhase,
      ...(startsAt ? { startsAt } : {}),
      ...(endsAt ? { endsAt } : {}),
      queuePaused: maintenanceQueuePaused,
      playPaused: maintenancePlayPaused,
      message: maintenanceMessage.trim(),
    };
  };

  const players = (playersQuery.data?.players || []) as Player[];
  const moderationCases = (moderationCasesQuery.data?.cases ||
    []) as ModerationCase[];
  const selectedCase = selectedCaseQuery.data?.case as
    | ModerationCase
    | undefined;
  const selectedTargetPlayer = selectedCaseQuery.data?.targetPlayer as
    | Player
    | undefined;
  const selectedReports = (selectedCaseQuery.data?.reports ||
    []) as PlayerReport[];
  const selectedEvents = (selectedCaseQuery.data?.events ||
    []) as ModerationEvent[];
  const selectedMatches = (selectedMatchesQuery.data?.matches ||
    []) as MatchHistory[];
  const ipBans = (ipBansQuery.data?.bans || []) as IPBan[];

  const showPlayerHistory = (userId: string, displayName?: string) => {
    setSelectedHistoryUserId(userId);
    setSelectedHistoryName(displayName || userId);
    setOpenPlayerMenuId("");
  };

  const tabs = ([
    { id: "players", label: "Players", detail: `${players.length} shown` },
    {
      id: "reports",
      label: "Moderation",
      detail: `${moderationCases.length} cases`,
    },
    { id: "content", label: "Content", detail: "Map & changelog" },
    { id: "access", label: "Access", detail: "IP & maintenance" },
    { id: "debug", label: "Debug", detail: "Tools" },
  ] as Array<{ id: AdminTab; label: string; detail: string }>).filter(
    (tab) => canManageAdmin || tab.id === "reports" || tab.id === "players",
  );

  return (
    <>
      <Head>
        <title>GeoDuels | Admin</title>
        <meta name="robots" content="noindex,nofollow" />
      </Head>
      <main className="min-h-screen bg-[#08111b] px-4 py-5 text-white sm:px-6 lg:px-8">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-4">
          <div className="flex flex-col gap-3 rounded-[24px] border border-white/10 bg-white/5 p-5 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-[12px] font-bold uppercase tracking-[0.16em] text-[#2ad18f]">
                Admin Panel
              </p>
              <h1 className="mt-2 text-3xl font-black tracking-tight">
                GeoDuels Admin
              </h1>
              <p className="mt-2 text-sm text-[#a9bfd4]">
                Maps, players, and homepage changelog in one place.
              </p>
            </div>
            <Link
              href="/"
              className="inline-flex items-center justify-center rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15"
            >
              Back To Lobby
            </Link>
          </div>

          {!view.auth.userId ? (
            <section className="rounded-[24px] border border-white/10 bg-white/5 p-5 text-[#a9bfd4]">
              Sign in first to access the admin panel.
            </section>
          ) : null}
          {view.auth.userId && !canViewReports ? (
            <section className="rounded-[24px] border border-amber-400/20 bg-amber-400/10 p-5 text-amber-100">
              This account is signed in but does not have admin or moderator
              access yet.
            </section>
          ) : null}

          {canViewReports ? (
            <div className="flex flex-col gap-4">
              <div
                className="flex gap-2 overflow-x-auto rounded-[20px] border border-white/10 bg-white/5 p-2"
                role="tablist"
                aria-label="Admin sections"
              >
                {tabs.map((tab) => {
                  const selected = activeTab === tab.id;
                  return (
                    <Link
                      key={tab.id}
                      role="tab"
                      aria-selected={selected}
                      href={`/admin/${tab.id}`}
                      className={`min-w-[148px] rounded-2xl px-4 py-3 text-left transition ${
                        selected
                          ? "bg-[#2ad18f] text-[#08111b]"
                          : "bg-black/15 text-white hover:bg-white/10"
                      }`}
                    >
                      <span className="block text-sm font-black">
                        {tab.label}
                      </span>
                      <span
                        className={`mt-1 block text-xs ${
                          selected ? "text-[#0d3a29]" : "text-[#a9bfd4]"
                        }`}
                      >
                        {tab.detail}
                      </span>
                    </Link>
                  );
                })}
              </div>

              {activeTab === "content" ? (
                <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                  <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <h2 className="text-lg font-black">Map update</h2>
                    <p className="mt-2 text-sm text-[#a9bfd4]">
                      Upload a JSON file for a live map key.
                    </p>
                    <select
                      value={selectedMapKey}
                      onChange={(event) => {
                        setSelectedMapKey(event.target.value);
                        setMapStatus("");
                      }}
                      className="mt-4 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                    >
                      <option value="a-source-world">A Source World</option>
                      <option value="a-location-world">A Location World</option>
                    </select>
                    <input
                      type="file"
                      accept=".json,application/json"
                      className="mt-3 block w-full rounded-xl border border-white/10 bg-[#0d141c] p-3 text-sm"
                      onChange={(event) => {
                        setSelectedFile(event.target.files?.[0] || null);
                        setMapStatus("");
                      }}
                    />
                    <button
                      type="button"
                      disabled={!selectedFile || uploadMapMutation.isPending}
                      onClick={() => {
                        if (selectedFile) {
                          void uploadMapMutation.mutateAsync({ file: selectedFile, mapKey: selectedMapKey });
                        }
                      }}
                      className="mt-4 min-h-11 rounded-xl bg-[#2ad18f] px-4 py-2 text-sm font-bold text-[#08111b] transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {uploadMapMutation.isPending
                        ? "Uploading..."
                        : "Upload map JSON"}
                    </button>
                    <p className="mt-3 text-sm text-[#a9bfd4]">
                      {mapStatus ||
                        (uploadMapMutation.error instanceof Error
                          ? uploadMapMutation.error.message
                          : "No upload yet.")}
                    </p>
                  </section>

                  <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <h2 className="text-lg font-black">Home changelog</h2>
                    <input
                      value={effectiveEyebrow}
                      onChange={(event) => setDraftEyebrow(event.target.value)}
                      className="mt-4 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                      placeholder="Eyebrow"
                    />
                    <input
                      value={effectiveTitle}
                      onChange={(event) => setDraftTitle(event.target.value)}
                      className="mt-3 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                      placeholder="Title"
                    />
                    <textarea
                      value={effectiveChangelog}
                      onChange={(event) =>
                        setDraftChangelog(event.target.value)
                      }
                      className="mt-4 min-h-[260px] w-full rounded-xl border border-white/10 bg-[#0d141c] p-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                    />
                    <button
                      type="button"
                      disabled={saveChangelogMutation.isPending}
                      onClick={() =>
                        void saveChangelogMutation.mutateAsync({
                          eyebrow: effectiveEyebrow,
                          title: effectiveTitle,
                          markdown: effectiveChangelog,
                        })
                      }
                      className="mt-4 min-h-11 rounded-xl bg-[#2ad18f] px-4 py-2 text-sm font-bold text-[#08111b] transition disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {saveChangelogMutation.isPending
                        ? "Saving..."
                        : "Save changelog"}
                    </button>
                  </section>
                </div>
              ) : null}

              {activeTab === "access" ? (
                <>
                  <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-lg font-black">Maintenance mode</h2>
                        <p className="mt-1 text-sm text-[#a9bfd4]">
                          Control lobby banners and pause new queue/session
                          starts.
                        </p>
                      </div>
                      <div className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] text-[#a9bfd4]">
                        {maintenanceQuery.isLoading
                          ? "Loading"
                          : maintenancePhase === "normal" &&
                              !maintenanceQueuePaused &&
                              !maintenancePlayPaused
                            ? "Normal"
                            : "Active config"}
                      </div>
                    </div>

                    <div className="mt-4 grid gap-3 md:grid-cols-[180px_minmax(0,1fr)_minmax(0,1fr)]">
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#8cb0a1]">
                          Phase
                        </span>
                        <select
                          value={maintenancePhase}
                          onChange={(event) =>
                            setMaintenancePhase(
                              event.target.value as MaintenanceStatus["phase"],
                            )
                          }
                          className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                        >
                          <option value="normal">Normal</option>
                          <option value="warning">Warning</option>
                          <option value="active">Active</option>
                        </select>
                      </label>

                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#8cb0a1]">
                          Starts at
                        </span>
                        <input
                          type="datetime-local"
                          value={maintenanceStartsAt}
                          onChange={(event) =>
                            setMaintenanceStartsAt(event.target.value)
                          }
                          className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                        />
                      </label>

                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#8cb0a1]">
                          Ends at
                        </span>
                        <input
                          type="datetime-local"
                          value={maintenanceEndsAt}
                          onChange={(event) =>
                            setMaintenanceEndsAt(event.target.value)
                          }
                          className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                        />
                      </label>
                    </div>

                    <textarea
                      value={maintenanceMessage}
                      onChange={(event) =>
                        setMaintenanceMessage(event.target.value)
                      }
                      placeholder="Maintenance message"
                      className="mt-4 min-h-[92px] w-full rounded-xl border border-white/10 bg-[#0d141c] p-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                    />

                    <div className="mt-4 grid gap-3 md:grid-cols-2">
                      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/15 px-3 text-sm font-bold text-white">
                        <input
                          type="checkbox"
                          checked={maintenanceQueuePaused}
                          onChange={(event) =>
                            setMaintenanceQueuePaused(event.target.checked)
                          }
                          className="h-4 w-4 accent-[#2ad18f]"
                        />
                        Pause duel queueing
                      </label>
                      <label className="flex min-h-12 items-center gap-3 rounded-xl border border-white/10 bg-black/15 px-3 text-sm font-bold text-white">
                        <input
                          type="checkbox"
                          checked={maintenancePlayPaused}
                          onChange={(event) =>
                            setMaintenancePlayPaused(event.target.checked)
                          }
                          className="h-4 w-4 accent-[#2ad18f]"
                        />
                        Pause all new play sessions
                      </label>
                    </div>

                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        disabled={saveMaintenanceMutation.isPending}
                        onClick={() =>
                          void saveMaintenanceMutation.mutateAsync(
                            currentMaintenanceDraft(),
                          )
                        }
                        className="min-h-11 rounded-xl bg-[#2ad18f] px-4 py-2 text-sm font-bold text-[#08111b] transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saveMaintenanceMutation.isPending
                          ? "Saving..."
                          : "Save maintenance"}
                      </button>
                      <button
                        type="button"
                        disabled={saveMaintenanceMutation.isPending}
                        onClick={() =>
                          void saveMaintenanceMutation.mutateAsync({
                            phase: "active",
                            startsAt: new Date().toISOString(),
                            queuePaused: true,
                            playPaused: true,
                            message:
                              maintenanceMessage.trim() ||
                              "Maintenance in progress. Please check back soon.",
                          })
                        }
                        className="min-h-11 rounded-xl border border-amber-300/30 bg-amber-400/15 px-4 py-2 text-sm font-bold text-amber-100 transition hover:bg-amber-400/20 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Activate now
                      </button>
                      <button
                        type="button"
                        disabled={clearMaintenanceMutation.isPending}
                        onClick={() =>
                          void clearMaintenanceMutation.mutateAsync()
                        }
                        className="min-h-11 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {clearMaintenanceMutation.isPending
                          ? "Clearing..."
                          : "Clear maintenance"}
                      </button>
                    </div>

                    <p className="mt-3 text-sm text-[#a9bfd4]">
                      {saveMaintenanceMutation.error instanceof Error
                        ? saveMaintenanceMutation.error.message
                        : clearMaintenanceMutation.error instanceof Error
                          ? clearMaintenanceMutation.error.message
                          : "Changes apply through Redis key system:maintenance."}
                    </p>
                  </section>

                  <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h2 className="text-lg font-black">
                          Report notifications
                        </h2>
                        <p className="mt-1 text-sm text-[#a9bfd4]">
                          Send new cheater report alerts to a Discord channel.
                        </p>
                      </div>
                      <div
                        className={`rounded-full border px-3 py-1 text-xs font-bold uppercase tracking-[0.12em] ${
                          discordWebhookUrl.trim()
                            ? "border-[#2ad18f]/30 bg-[#2ad18f]/12 text-[#b9f5da]"
                            : "border-white/10 bg-black/20 text-[#a9bfd4]"
                        }`}
                      >
                        {moderationSettingsQuery.isLoading
                          ? "Loading"
                          : discordWebhookUrl.trim()
                            ? "Enabled"
                            : "Disabled"}
                      </div>
                    </div>
                    <label className="mt-4 block">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#8cb0a1]">
                        Discord webhook URL
                      </span>
                      <input
                        type="password"
                        autoComplete="off"
                        spellCheck={false}
                        value={discordWebhookUrl}
                        onChange={(event) =>
                          setDiscordWebhookUrl(event.target.value)
                        }
                        placeholder="https://discord.com/api/webhooks/..."
                        className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                      />
                    </label>
                    <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
                      <button
                        type="button"
                        disabled={saveModerationSettingsMutation.isPending}
                        onClick={() =>
                          void saveModerationSettingsMutation.mutateAsync(
                            discordWebhookUrl,
                          )
                        }
                        className="min-h-11 rounded-xl bg-[#2ad18f] px-4 py-2 text-sm font-bold text-[#08111b] transition disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        {saveModerationSettingsMutation.isPending
                          ? "Saving..."
                          : "Save notification settings"}
                      </button>
                      <button
                        type="button"
                        disabled={
                          !discordWebhookUrl ||
                          saveModerationSettingsMutation.isPending
                        }
                        onClick={() => {
                          setDiscordWebhookUrl("");
                          void saveModerationSettingsMutation.mutateAsync("");
                        }}
                        className="min-h-11 rounded-xl border border-white/10 bg-white/10 px-4 py-2 text-sm font-bold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        Disable
                      </button>
                    </div>
                    <p className="mt-3 text-sm text-[#a9bfd4]">
                      {saveModerationSettingsMutation.error instanceof Error
                        ? saveModerationSettingsMutation.error.message
                        : "Leave blank to disable Discord report notifications."}
                    </p>
                  </section>

                  <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                    <h2 className="text-lg font-black">IP signup bans</h2>
                    <div className="mt-4 grid gap-3 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1fr)_auto]">
                      <input
                        value={ipBanAddress}
                        onChange={(event) =>
                          setIPBanAddress(event.target.value)
                        }
                        placeholder="IP address"
                        className="min-h-11 rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm outline-none focus:border-[#2ad18f]/60"
                      />
                      <input
                        value={ipBanReason}
                        onChange={(event) => setIPBanReason(event.target.value)}
                        placeholder="Reason"
                        className="min-h-11 rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm outline-none focus:border-[#2ad18f]/60"
                      />
                      <button
                        type="button"
                        disabled={!ipBanAddress || addIPBanMutation.isPending}
                        onClick={() => void addIPBanMutation.mutateAsync()}
                        className="min-h-11 rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/22 disabled:opacity-60"
                      >
                        Ban signup
                      </button>
                    </div>
                    <div className="mt-4 space-y-2">
                      {ipBans.map((ban) => (
                        <div
                          key={ban.id}
                          className="flex flex-col gap-2 rounded-xl border border-white/10 bg-black/15 p-3 sm:flex-row sm:items-center sm:justify-between"
                        >
                          <div>
                            <p className="font-bold">{ban.ipAddress}</p>
                            {ban.reason ? (
                              <p className="text-sm text-[#a9bfd4]">
                                {ban.reason}
                              </p>
                            ) : null}
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              void removeIPBanMutation.mutateAsync(
                                ban.ipAddress,
                              )
                            }
                            className="min-h-10 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold"
                          >
                            Remove
                          </button>
                        </div>
                      ))}
                    </div>
                  </section>
                </>
              ) : null}

              {activeTab === "reports" ? (
                <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-black">Moderation queue</h2>
                      <p className="mt-1 text-sm text-[#a9bfd4]">
                        Cases group reports, evidence, status, and actions into
                        one review workflow.
                      </p>
                    </div>
                    {selectedCaseId !== null ? (
                      <button
                        type="button"
                        onClick={() => setSelectedCaseId(null)}
                        className="min-h-10 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold"
                      >
                        Clear selection
                      </button>
                    ) : null}
                  </div>
                  <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
                    <div className="space-y-3">
                      {moderationCases.map((item) => (
                        <button
                          type="button"
                          key={item.id}
                          onClick={() => {
                            setSelectedCaseId(item.id);
                            showPlayerHistory(
                              item.targetUserId,
                              item.targetDisplayName,
                            );
                          }}
                          className={`block w-full rounded-2xl border p-4 text-left transition ${
                            selectedCaseId === item.id
                              ? "border-red-200/45 bg-red-500/18"
                              : "border-white/10 bg-black/15 hover:bg-white/10"
                          }`}
                        >
                          <div className="flex items-start justify-between gap-3">
                            <div>
                              <p className="font-bold text-white">
                                {item.targetDisplayName || item.targetUserId}
                              </p>
                              <p className="mt-1 text-xs text-[#6f8aa5]">
                                Case #{item.id}
                              </p>
                            </div>
                            <span className="rounded-full border border-red-200/25 bg-red-500/15 px-2 py-1 text-[11px] font-black uppercase text-red-100">
                              {item.priority}
                            </span>
                          </div>
                          <p className="mt-3 text-sm text-[#c5d4e2]">
                            Score {item.score.toFixed(2)} · {item.reportCount}{" "}
                            reports · {item.uniqueReporterCount} reporters
                          </p>
                          <p className="mt-2 text-xs font-bold uppercase tracking-[0.12em] text-[#8cb0a1]">
                            {item.status}
                          </p>
                        </button>
                      ))}
                      {!moderationCasesQuery.isLoading &&
                      !moderationCases.length ? (
                        <p className="text-sm text-[#a9bfd4]">
                          No moderation cases yet.
                        </p>
                      ) : null}
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/15 p-4">
                      {selectedCase ? (
                        <>
                          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                            <div>
                              <h3 className="font-black">
                                {selectedCase.targetDisplayName ||
                                  selectedCase.targetUserId}
                              </h3>
                              <p className="mt-1 text-xs text-[#6f8aa5]">
                                Case #{selectedCase.id} ·{" "}
                                {selectedCase.targetUserId}
                              </p>
                            </div>
                            <div className="flex flex-wrap gap-2">
                              {["reviewing", "watching"].map(
                                (status) => (
                                  <button
                                    key={status}
                                    type="button"
                                    disabled={caseActionMutation.isPending}
                                    onClick={() =>
                                      void caseActionMutation.mutateAsync({
                                        caseId: selectedCase.id,
                                        actionType: "status",
                                        status,
                                        reason: caseActionReason,
                                      })
                                    }
                                    className="min-h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-black uppercase text-white transition hover:bg-white/15 disabled:opacity-60"
                                  >
                                    {status}
                                  </button>
                                ),
                              )}
                              <button
                                type="button"
                                disabled={caseActionMutation.isPending}
                                onClick={() =>
                                  void caseActionMutation.mutateAsync({
                                    caseId: selectedCase.id,
                                    actionType: "status",
                                    status: "actioned",
                                    reason: caseActionReason,
                                  })
                                }
                                className="min-h-9 rounded-xl border border-[#2ad18f]/25 bg-[#2ad18f]/12 px-3 text-xs font-black uppercase text-[#b9f5da] transition hover:bg-[#2ad18f]/18 disabled:opacity-60"
                              >
                                Confirmed
                              </button>
                              <button
                                type="button"
                                disabled={caseActionMutation.isPending}
                                onClick={() =>
                                  void caseActionMutation.mutateAsync({
                                    caseId: selectedCase.id,
                                    actionType: "mark_inconclusive",
                                    reason:
                                      caseActionReason ||
                                      "Not enough evidence",
                                  })
                                }
                                className="min-h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-black uppercase text-white transition hover:bg-white/15 disabled:opacity-60"
                              >
                                Inconclusive
                              </button>
                              <button
                                type="button"
                                disabled={caseActionMutation.isPending}
                                onClick={() =>
                                  void caseActionMutation.mutateAsync({
                                    caseId: selectedCase.id,
                                    actionType: "dismiss",
                                    status: "dismissed",
                                    reason: caseActionReason,
                                  })
                                }
                                className="min-h-9 rounded-xl border border-white/10 bg-white/10 px-3 text-xs font-black uppercase text-white transition hover:bg-white/15 disabled:opacity-60"
                              >
                                Dismiss
                              </button>
                              <button
                                type="button"
                                disabled={caseActionMutation.isPending}
                                onClick={() =>
                                  void caseActionMutation.mutateAsync({
                                    caseId: selectedCase.id,
                                    actionType: "abusive_reports",
                                    reason:
                                      caseActionReason ||
                                      "False or abusive report cluster",
                                  })
                                }
                                className="min-h-9 rounded-xl border border-red-300/25 bg-red-500/10 px-3 text-xs font-black uppercase text-red-100 transition hover:bg-red-500/15 disabled:opacity-60"
                              >
                                Abusive reports
                              </button>
                            </div>
                          </div>

                          <div className="mt-4 grid gap-3 sm:grid-cols-3">
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs font-bold uppercase text-[#6f8aa5]">
                                Score
                              </p>
                              <p className="mt-1 text-xl font-black text-white">
                                {selectedCase.score.toFixed(2)}
                              </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs font-bold uppercase text-[#6f8aa5]">
                                Reports
                              </p>
                              <p className="mt-1 text-xl font-black text-white">
                                {selectedCase.reportCount}
                              </p>
                            </div>
                            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
                              <p className="text-xs font-bold uppercase text-[#6f8aa5]">
                                Reporters
                              </p>
                              <p className="mt-1 text-xl font-black text-white">
                                {selectedCase.uniqueReporterCount}
                              </p>
                            </div>
                          </div>

                          {selectedTargetPlayer ? (
                            <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                                <div>
                                  <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8cb0a1]">
                                    Player statistics
                                  </p>
                                  <p className="mt-2 font-bold text-white">
                                    {selectedTargetPlayer.displayName ||
                                      selectedTargetPlayer.userId}
                                  </p>
                                  {canManageAdmin ? (
                                    <p className="mt-1 text-xs text-[#6f8aa5]">
                                      {selectedTargetPlayer.email ||
                                        selectedTargetPlayer.userId}
                                    </p>
                                  ) : (
                                    <p className="mt-1 text-xs text-[#6f8aa5]">
                                      {selectedTargetPlayer.userId}
                                    </p>
                                  )}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {selectedTargetPlayer.isBanned ? (
                                    <span className="rounded-full border border-red-300/25 bg-red-500/15 px-2 py-1 text-[11px] font-black uppercase text-red-100">
                                      Banned
                                    </span>
                                  ) : null}
                                  {selectedTargetPlayer.isAdmin ? (
                                    <span className="rounded-full border border-[#8cb0ff]/25 bg-[#8cb0ff]/10 px-2 py-1 text-[11px] font-black uppercase text-[#c9dcff]">
                                      Admin
                                    </span>
                                  ) : null}
                                  {selectedTargetPlayer.isModerator ? (
                                    <span className="rounded-full border border-[#2ad18f]/25 bg-[#2ad18f]/10 px-2 py-1 text-[11px] font-black uppercase text-[#b9f5da]">
                                      Moderator
                                    </span>
                                  ) : null}
                                </div>
                              </div>
                              <div className="mt-4 grid gap-3 sm:grid-cols-4">
                                <div>
                                  <p className="text-xs font-bold uppercase text-[#6f8aa5]">
                                    MMR
                                  </p>
                                  <p className="mt-1 text-lg font-black text-white">
                                    {selectedTargetPlayer.mmr}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-bold uppercase text-[#6f8aa5]">
                                    Games
                                  </p>
                                  <p className="mt-1 text-lg font-black text-white">
                                    {selectedTargetPlayer.gamesPlayed}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-bold uppercase text-[#6f8aa5]">
                                    Wins
                                  </p>
                                  <p className="mt-1 text-lg font-black text-white">
                                    {selectedTargetPlayer.wins}
                                  </p>
                                </div>
                                <div>
                                  <p className="text-xs font-bold uppercase text-[#6f8aa5]">
                                    Win rate
                                  </p>
                                  <p className="mt-1 text-lg font-black text-white">
                                    {selectedTargetPlayer.gamesPlayed > 0
                                      ? `${Math.round(
                                          (selectedTargetPlayer.wins /
                                            selectedTargetPlayer.gamesPlayed) *
                                            100,
                                        )}%`
                                      : "0%"}
                                  </p>
                                </div>
                              </div>
                              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                                <p className="text-xs text-[#a9bfd4]">
                                  Ranked games:{" "}
                                  <span className="font-bold text-white">
                                    {selectedTargetPlayer.rankedGamesPlayed}
                                  </span>
                                </p>
                                {canManageAdmin ? (
                                  <p className="text-xs text-[#a9bfd4]">
                                    Last IP:{" "}
                                    <span className="font-bold text-white">
                                      {selectedTargetPlayer.lastIpAddress ||
                                        "none"}
                                    </span>
                                  </p>
                                ) : null}
                              </div>
                              {selectedTargetPlayer.banReason ? (
                                <p className="mt-3 rounded-xl border border-red-300/20 bg-red-500/10 p-3 text-sm text-red-100">
                                  {selectedTargetPlayer.banReason}
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <div className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#8cb0a1]">
                              Evidence categories
                            </p>
                            <div className="mt-3 flex flex-wrap gap-2">
                              {Object.entries(selectedCase.categories || {}).map(
                                ([category, count]) => (
                                  <span
                                    key={category}
                                    className="rounded-full border border-white/10 bg-black/20 px-3 py-1 text-xs font-bold text-[#dbe7ff]"
                                  >
                                    {category}: {count}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>

                          <label className="mt-4 block">
                            <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f8aa5]">
                              Action note
                            </span>
                            <textarea
                              value={caseActionReason}
                              onChange={(event) =>
                                setCaseActionReason(event.target.value)
                              }
                              placeholder="Optional internal note or action reason"
                              className="mt-2 min-h-20 w-full resize-none rounded-xl border border-white/10 bg-[#0d141c] px-3 py-2 text-sm outline-none focus:border-[#2ad18f]/60"
                            />
                          </label>

                          {canBanReportedPlayers ? (
                            <div className="mt-4 rounded-xl border border-red-300/20 bg-red-500/10 p-3">
                              <label className="block">
                                <span className="text-xs font-bold uppercase tracking-[0.12em] text-red-100/75">
                                  Ban reason
                                </span>
                                <input
                                  value={
                                    banReason[selectedCase.targetUserId] || ""
                                  }
                                  onChange={(event) =>
                                    setBanReason((current) => ({
                                      ...current,
                                      [selectedCase.targetUserId]:
                                        event.target.value,
                                    }))
                                  }
                                  placeholder="Optional ban reason"
                                  className="mt-2 min-h-10 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm outline-none focus:border-red-300/60"
                                />
                              </label>
                              <button
                                type="button"
                                disabled={banMutation.isPending}
                                onClick={() =>
                                  void banMutation.mutateAsync({
                                    userId: selectedCase.targetUserId,
                                    reason:
                                      banReason[selectedCase.targetUserId] ||
                                      caseActionReason ||
                                      "",
                                  })
                                }
                                className="mt-3 min-h-10 rounded-xl border border-red-400/30 bg-red-500/15 px-4 py-2 text-sm font-bold text-red-100 transition hover:bg-red-500/22 disabled:cursor-not-allowed disabled:opacity-60"
                              >
                                {banMutation.isPending
                                  ? "Banning..."
                                  : "Ban player"}
                              </button>
                            </div>
                          ) : null}

                          <details
                            className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3"
                            open
                          >
                            <summary className="cursor-pointer text-sm font-black uppercase tracking-[0.12em] text-[#8cb0a1]">
                              Reports as evidence ({selectedReports.length})
                            </summary>
                            <div className="mt-3 space-y-2">
                              {selectedReports.map((report) => (
                                <div
                                  key={report.id}
                                  className="rounded-xl border border-white/10 bg-black/15 p-3 text-sm"
                                >
                                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                                    <div>
                                      <p className="font-bold text-white">
                                        {report.category} ·{" "}
                                        {report.reporterName ||
                                          report.reporterUserId}
                                      </p>
                                      <p className="mt-1 text-[#a9bfd4]">
                                        Weight{" "}
                                        {report.reporterWeight.toFixed(2)}
                                      </p>
                                    </div>
                                    <button
                                      type="button"
                                      disabled={caseActionMutation.isPending}
                                      onClick={() =>
                                        void caseActionMutation.mutateAsync({
                                          caseId: selectedCase.id,
                                          actionType: "report_mute",
                                          muteUserId: report.reporterUserId,
                                          reason:
                                            caseActionReason ||
                                            "Abusive report behavior",
                                        })
                                      }
                                      className="min-h-9 rounded-xl border border-red-300/25 bg-red-500/10 px-3 text-xs font-bold text-red-100"
                                    >
                                      Mute reporter
                                    </button>
                                  </div>
                                  <Link
                                    href={`/match/${encodeURIComponent(report.matchId)}`}
                                    className="mt-2 block text-[#8cb0ff] hover:text-white"
                                  >
                                    Match: {report.matchId}
                                  </Link>
                                  {report.reason ? (
                                    <p className="mt-1 text-red-100">
                                      Reason: {report.reason}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                            {!selectedCaseQuery.isLoading &&
                            !selectedReports.length ? (
                              <p className="mt-3 text-sm text-[#a9bfd4]">
                                No reports attached to this case.
                              </p>
                            ) : null}
                          </details>

                          {caseActionMutation.error instanceof Error ? (
                            <p className="mt-3 text-sm text-red-100">
                              {caseActionMutation.error.message}
                            </p>
                          ) : null}
                          <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                            <summary className="cursor-pointer text-sm font-black uppercase tracking-[0.12em] text-[#8cb0a1]">
                              Recent matches ({selectedMatches.length})
                            </summary>
                            <div className="mt-3 space-y-2">
                              {selectedMatches.map((match) => (
                                <Link
                                  key={match.matchId}
                                  href={`/match/${encodeURIComponent(match.matchId)}`}
                                  className="block rounded-xl border border-white/10 bg-black/15 p-3 text-sm text-[#dbe7ff] transition hover:bg-white/10"
                                >
                                  {match.matchId} · {match.mode}
                                </Link>
                              ))}
                            </div>
                          </details>
                          <details className="mt-4 rounded-xl border border-white/10 bg-white/5 p-3">
                            <summary className="cursor-pointer text-sm font-black uppercase tracking-[0.12em] text-[#8cb0a1]">
                              Timeline ({selectedEvents.length})
                            </summary>
                            <div className="mt-3 space-y-2">
                              {selectedEvents.map((event) => (
                                <div
                                  key={event.id}
                                  className="rounded-xl border border-white/10 bg-black/15 p-3 text-sm text-[#dbe7ff]"
                                >
                                  <p className="font-bold">
                                    {event.eventType}
                                  </p>
                                  {event.body ? (
                                    <p className="mt-1 text-[#a9bfd4]">
                                      {event.body}
                                    </p>
                                  ) : null}
                                </div>
                              ))}
                            </div>
                          </details>
                        </>
                      ) : (
                        <p className="text-sm text-[#a9bfd4]">
                          Select a case to review reports, evidence, history,
                          and actions.
                        </p>
                      )}
                    </div>
                  </div>
                </section>
              ) : null}

              {activeTab === "debug" && canManageAdmin ? (
                <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div>
                    <h2 className="text-lg font-black">Debug tools</h2>
                    <p className="mt-1 text-sm text-[#a9bfd4]">
                      Admin-only utilities for exercising production workflows
                      with controlled test data.
                    </p>
                  </div>

                  <div className="mt-5 rounded-2xl border border-white/10 bg-black/15 p-4">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                      <div>
                        <h3 className="font-black text-white">
                          Send Test Reports
                        </h3>
                        <p className="mt-1 text-sm text-[#a9bfd4]">
                          Uses existing registered users as reporters and
                          creates debug match evidence for the target player.
                        </p>
                      </div>
                      {debugReportResult ? (
                        <p className="rounded-xl border border-[#2ad18f]/25 bg-[#2ad18f]/10 px-3 py-2 text-sm font-bold text-[#b9f5da]">
                          {debugReportResult}
                        </p>
                      ) : null}
                    </div>

                    <div className="mt-4 grid gap-3 lg:grid-cols-[minmax(0,1fr)_160px_180px]">
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f8aa5]">
                          Reported player ID
                        </span>
                        <input
                          value={debugReportedUserId}
                          onChange={(event) =>
                            setDebugReportedUserId(event.target.value)
                          }
                          placeholder="user id"
                          className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f8aa5]">
                          Count
                        </span>
                        <input
                          type="number"
                          min={1}
                          max={20}
                          value={debugReportCount}
                          onChange={(event) =>
                            setDebugReportCount(
                              Math.max(
                                1,
                                Math.min(20, Number(event.target.value) || 1),
                              ),
                            )
                          }
                          className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                        />
                      </label>
                      <label className="block">
                        <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f8aa5]">
                          Category
                        </span>
                        <select
                          value={debugReportCategory}
                          onChange={(event) =>
                            setDebugReportCategory(event.target.value)
                          }
                          className="mt-2 min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                        >
                          <option value="cheating">Cheating</option>
                          <option value="boosting">Boosting / throwing</option>
                          <option value="harassment">Harassment</option>
                          <option value="profile">Offensive profile</option>
                          <option value="other">Other</option>
                        </select>
                      </label>
                    </div>

                    <label className="mt-3 block">
                      <span className="text-xs font-bold uppercase tracking-[0.12em] text-[#6f8aa5]">
                        Reason
                      </span>
                      <textarea
                        value={debugReportReason}
                        onChange={(event) =>
                          setDebugReportReason(event.target.value)
                        }
                        className="mt-2 min-h-24 w-full resize-none rounded-xl border border-white/10 bg-[#0d141c] px-3 py-2 text-sm text-white outline-none focus:border-[#2ad18f]/60"
                      />
                    </label>

                    <button
                      type="button"
                      disabled={
                        debugTestReportsMutation.isPending ||
                        !debugReportedUserId.trim()
                      }
                      onClick={() =>
                        void debugTestReportsMutation.mutateAsync()
                      }
                      className="mt-4 min-h-11 rounded-xl border border-[#2ad18f]/30 bg-[#2ad18f]/12 px-4 text-sm font-black text-[#b9f5da] transition hover:bg-[#2ad18f]/18 disabled:cursor-not-allowed disabled:opacity-60"
                    >
                      {debugTestReportsMutation.isPending
                        ? "Sending..."
                        : "Generate test reports"}
                    </button>
                    {debugTestReportsMutation.error instanceof Error ? (
                      <p className="mt-3 text-sm text-red-100">
                        {debugTestReportsMutation.error.message}
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}

              {activeTab === "players" ? (
                <section className="rounded-[24px] border border-white/10 bg-white/5 p-5">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <h2 className="text-lg font-black">Players</h2>
                      <p className="mt-1 text-sm text-[#a9bfd4]">
                        {canManageAdmin
                          ? "Search by user ID, display name, or email."
                          : "Search by user ID or display name."}
                      </p>
                    </div>
                    <input
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search players"
                      className="min-h-11 w-full rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm outline-none focus:border-[#2ad18f]/60 sm:max-w-xs"
                    />
                  </div>
                  <div className="mt-4 overflow-x-auto rounded-2xl border border-white/10 bg-black/15">
                    <table className="w-full min-w-[1080px] border-collapse text-left text-sm">
                      <thead className="bg-white/5 text-xs uppercase tracking-[0.12em] text-[#8cb0a1]">
                        <tr>
                          <th className="px-4 py-3 font-black">Player</th>
                          <th className="px-4 py-3 font-black">
                            {canManageAdmin ? "Email / ID" : "User ID"}
                          </th>
                          <th className="px-4 py-3 font-black">MMR</th>
                          <th className="px-4 py-3 font-black">Record</th>
                          {canManageAdmin ? (
                            <th className="px-4 py-3 font-black">Last IP</th>
                          ) : null}
                          <th className="px-4 py-3 font-black">Status</th>
                          {canManageAdmin ? (
                            <th className="px-4 py-3 font-black">
                              Moderation
                            </th>
                          ) : null}
                          <th className="px-4 py-3 text-right font-black">
                            Actions
                          </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/10">
                        {players.map((player) => (
                          <tr key={player.userId} className="align-top">
                            <td className="max-w-[180px] px-4 py-4">
                              <p className="truncate font-bold text-white">
                                {player.displayName || player.userId}
                              </p>
                              {player.isAdmin ? (
                                <p className="mt-1 text-xs font-bold text-[#2ad18f]">
                                  Admin
                                </p>
                              ) : null}
                              {!player.isAdmin && player.isModerator ? (
                                <p className="mt-1 text-xs font-bold text-[#8fb7ff]">
                                  Moderator
                                </p>
                              ) : null}
                            </td>
                            <td className="max-w-[240px] px-4 py-4">
                              {canManageAdmin ? (
                                <p className="truncate text-[#dbe7ff]">
                                  {player.email || "No email"}
                                </p>
                              ) : null}
                              <p className="mt-1 truncate text-xs text-[#6f8aa5]">
                                {player.userId}
                              </p>
                            </td>
                            <td className="px-4 py-4 font-bold">
                              {player.mmr}
                            </td>
                            <td className="px-4 py-4 text-[#a9bfd4]">
                              {player.wins}W / {player.gamesPlayed}G
                            </td>
                            {canManageAdmin ? (
                              <td className="max-w-[150px] px-4 py-4">
                                <p className="truncate text-[#a9bfd4]">
                                  {player.lastIpAddress || "None"}
                                </p>
                              </td>
                            ) : null}
                            <td className="px-4 py-4">
                              <span
                                className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-bold ${
                                  player.isBanned
                                    ? "border-red-300/30 bg-red-500/15 text-red-100"
                                    : "border-[#2ad18f]/30 bg-[#2ad18f]/12 text-[#b9f5da]"
                                }`}
                              >
                                {player.isBanned ? "Banned" : "Active"}
                              </span>
                              {player.isBanned && player.banReason ? (
                                <p className="mt-2 max-w-[220px] text-xs text-red-200/90">
                                  {player.banReason}
                                </p>
                              ) : null}
                            </td>
                            {canManageAdmin ? (
                              <td className="w-[260px] px-4 py-4">
                                {!player.isBanned ? (
                                  <div className="grid gap-2">
                                    <input
                                      value={banReason[player.userId] || ""}
                                      onChange={(event) =>
                                        setBanReason((current) => ({
                                          ...current,
                                          [player.userId]: event.target.value,
                                        }))
                                      }
                                      placeholder="Optional ban reason"
                                      className="min-h-10 rounded-xl border border-white/10 bg-[#0d141c] px-3 text-sm outline-none focus:border-[#2ad18f]/60"
                                    />
                                    <div className="grid grid-cols-2 gap-2">
                                      <button
                                        type="button"
                                        disabled={banMutation.isPending}
                                        onClick={() =>
                                          void banMutation.mutateAsync({
                                            userId: player.userId,
                                            reason:
                                              banReason[player.userId] || "",
                                          })
                                        }
                                        className="min-h-10 rounded-xl border border-red-400/30 bg-red-500/15 px-3 py-2 text-xs font-bold text-red-100 transition hover:bg-red-500/22 disabled:opacity-60"
                                      >
                                        Ban
                                      </button>
                                      <button
                                        type="button"
                                        disabled={
                                          !player.lastIpAddress ||
                                          banWithIPMutation.isPending
                                        }
                                        title={
                                          player.lastIpAddress
                                            ? `Ban player and block signups from ${player.lastIpAddress}`
                                            : "No recorded IP for this player"
                                        }
                                        onClick={() =>
                                          void banWithIPMutation.mutateAsync({
                                            userId: player.userId,
                                            reason:
                                              banReason[player.userId] || "",
                                            ipAddress:
                                              player.lastIpAddress || "",
                                          })
                                        }
                                        className="min-h-10 rounded-xl border border-red-300/40 bg-red-600/25 px-3 py-2 text-xs font-black text-red-50 transition hover:bg-red-600/35 disabled:cursor-not-allowed disabled:opacity-50"
                                      >
                                        Ban + IP
                                      </button>
                                    </div>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      void unbanMutation.mutateAsync(
                                        player.userId,
                                      )
                                    }
                                    className="min-h-10 rounded-xl border border-[#2ad18f]/30 bg-[#2ad18f]/12 px-3 py-2 text-xs font-bold text-[#b9f5da] transition hover:bg-[#2ad18f]/18"
                                  >
                                    Unban player
                                  </button>
                                )}
                              </td>
                            ) : null}
                            <td className="px-4 py-4 text-right">
                              <div className="relative inline-flex">
                                <button
                                  type="button"
                                  aria-label={`Open actions for ${
                                    player.displayName || player.userId
                                  }`}
                                  onClick={() =>
                                    setOpenPlayerMenuId((current) =>
                                      current === player.userId
                                        ? ""
                                        : player.userId,
                                    )
                                  }
                                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-white/10 bg-white/10 text-white transition hover:bg-white/15"
                                >
                                  <MoreVertical size={18} aria-hidden="true" />
                                </button>
                                {openPlayerMenuId === player.userId ? (
                                  <div className="absolute right-0 top-12 z-10 w-48 rounded-xl border border-white/10 bg-[#0d141c] p-2 text-left shadow-2xl">
                                    <button
                                      type="button"
                                      onClick={() =>
                                        showPlayerHistory(
                                          player.userId,
                                          player.displayName,
                                        )
                                      }
                                      className="block min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-white hover:bg-white/10"
                                    >
                                      View past matches
                                    </button>
                                    {canManageAdmin &&
                                    player.reportMutedUntil &&
                                    new Date(player.reportMutedUntil) >
                                      new Date() ? (
                                      <button
                                        type="button"
                                        disabled={
                                          clearReporterMuteMutation.isPending
                                        }
                                        onClick={() => {
                                          setOpenPlayerMenuId("");
                                          void clearReporterMuteMutation.mutateAsync(
                                            player.userId,
                                          );
                                        }}
                                        className="block min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-[#b9f5da] hover:bg-white/10 disabled:opacity-60"
                                      >
                                        Unmute reports
                                      </button>
                                    ) : null}
                                    {canManageAdmin && !player.isAdmin ? (
                                      player.isModerator ? (
                                        <button
                                          type="button"
                                          disabled={
                                            demoteModeratorMutation.isPending
                                          }
                                          onClick={() => {
                                            setOpenPlayerMenuId("");
                                            void demoteModeratorMutation.mutateAsync(
                                              player.userId,
                                            );
                                          }}
                                          className="block min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-amber-100 hover:bg-white/10 disabled:opacity-60"
                                        >
                                          Remove moderator
                                        </button>
                                      ) : (
                                        <button
                                          type="button"
                                          disabled={
                                            promoteModeratorMutation.isPending
                                          }
                                          onClick={() => {
                                            setOpenPlayerMenuId("");
                                            void promoteModeratorMutation.mutateAsync(
                                              player.userId,
                                            );
                                          }}
                                          className="block min-h-10 w-full rounded-lg px-3 text-left text-sm font-bold text-[#b9f5da] hover:bg-white/10 disabled:opacity-60"
                                        >
                                          Make moderator
                                        </button>
                                      )
                                    ) : null}
                                  </div>
                                ) : null}
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {playersQuery.isLoading ? (
                      <p className="p-4 text-sm text-[#a9bfd4]">
                        Loading players...
                      </p>
                    ) : null}
                    {!playersQuery.isLoading && !players.length ? (
                      <p className="p-4 text-sm text-[#a9bfd4]">
                        No players found.
                      </p>
                    ) : null}
                  </div>

                  {selectedHistoryUserId ? (
                    <div className="mt-4 rounded-2xl border border-white/10 bg-black/15 p-4">
                      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                        <div>
                          <h3 className="font-black">
                            Past matches for {selectedHistoryName}
                          </h3>
                          <p className="mt-1 text-xs text-[#6f8aa5]">
                            {selectedHistoryUserId}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedHistoryUserId("");
                            setSelectedHistoryName("");
                          }}
                          className="min-h-10 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold"
                        >
                          Close
                        </button>
                      </div>
                      <div className="mt-4 grid gap-2 md:grid-cols-2">
                        {selectedMatches.map((match) => (
                          <Link
                            key={match.matchId}
                            href={`/match/${encodeURIComponent(match.matchId)}`}
                            className="rounded-xl border border-white/10 bg-white/5 p-3 text-sm text-[#dbe7ff] transition hover:bg-white/10"
                          >
                            <span className="block truncate font-bold">
                              {match.matchId}
                            </span>
                            <span className="mt-1 block text-xs uppercase tracking-[0.12em] text-[#8cb0a1]">
                              {match.mode}
                              {match.endedAt
                                ? ` · ${new Date(match.endedAt).toLocaleString()}`
                                : ""}
                            </span>
                          </Link>
                        ))}
                      </div>
                      {selectedMatchesQuery.isLoading ? (
                        <p className="mt-3 text-sm text-[#a9bfd4]">
                          Loading matches...
                        </p>
                      ) : null}
                      {!selectedMatchesQuery.isLoading &&
                      !selectedMatches.length ? (
                        <p className="mt-3 text-sm text-[#a9bfd4]">
                          No past matches found.
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </section>
              ) : null}
            </div>
          ) : null}
        </div>
      </main>
    </>
  );
}
