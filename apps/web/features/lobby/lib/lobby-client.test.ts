import { afterEach, describe, expect, it, vi } from "vitest";
import { createRuntimeConfigFixture } from "../../../test/runtime-config.fixture";
import { createLobby, fetchLobby, updateLobbySettings } from "./lobby-client";

describe("lobby-client", () => {
  const originalFetch = global.fetch;
  const runtimeConfig = createRuntimeConfigFixture({
    apiURL: "http://api.example.test",
    queueURL: "http://coordinator.example.test/",
  });

  afterEach(() => {
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("sends lobby commands to the match coordinator", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "lob-1",
        inviteCode: "ABC123",
        ownerUserId: "u1",
        state: "open",
        mode: "duel",
        mapScope: "world",
        members: [],
      }),
    }) as Response) as typeof fetch;

    await createLobby(runtimeConfig, "access-token");
    await updateLobbySettings(
      runtimeConfig,
      "lob-1",
      "access-token",
      { ruleset: "moving", roundTimerMode: "none" },
      "team_duel",
    );

    expect(global.fetch).toHaveBeenNthCalledWith(
      1,
      "http://coordinator.example.test/lobbies",
      expect.objectContaining({ method: "POST" }),
    );
    expect(global.fetch).toHaveBeenNthCalledWith(
      2,
      "http://coordinator.example.test/lobbies/lob-1/settings",
      expect.objectContaining({ method: "PATCH" }),
    );
  });

  it("fetches invite snapshots from the match coordinator", async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        id: "lob-1",
        inviteCode: "ABC123",
        ownerUserId: "u1",
        state: "open",
        mode: "duel",
        mapScope: "world",
        members: [],
      }),
    }) as Response) as typeof fetch;

    await fetchLobby(runtimeConfig, "ABC123");

    expect(global.fetch).toHaveBeenCalledWith(
      "http://coordinator.example.test/lobbies/ABC123",
    );
  });
});
