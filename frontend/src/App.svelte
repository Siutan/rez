<script lang="ts">
  import { onMount } from "svelte";
  import logo from "./assets/images/logo-universal.png";
  import {
    GetCurrentSummoner,
    GetSummonerProfile,
    IsLCUConnected,
    GetMatchHistory,
  } from "../wailsjs/go/main/App.js";
  import { EventsOn } from "../wailsjs/runtime/runtime.js";
  import { DDragon } from "./lib/services/ddragon";
  import MatchHistoryItem from "./lib/components/match-history-item.svelte";
  import type { Match } from "./types/lcu/match";
  let lcuConnected = false;
  let summonerData = null;
  let profileData = null;
  let matchHistoryData: { games: { games: Match[] } } = null;
  let errorMessage = "";
  let loading = false;

  // initialize ddragon by calling it
  DDragon.init();

  onMount(() => {
    // Listen for LCU connection events
    EventsOn("lcu:connected", (info) => {
      console.log("LCU Connected:", info);
      lcuConnected = true;
      errorMessage = "";
      loadUserData();
    });

    EventsOn("lcu:disconnected", () => {
      console.log("LCU Disconnected");
      lcuConnected = false;
      summonerData = null;
      profileData = null;
      matchHistoryData = null;
    });

    // Check if already connected
    checkConnection();
  });

  async function checkConnection() {
    try {
      lcuConnected = await IsLCUConnected();
      if (lcuConnected) {
        await loadUserData();
      }
    } catch (err) {
      console.error("Error checking connection:", err);
    }
  }

  async function loadUserData() {
    loading = true;
    errorMessage = "";

    try {
      const [summoner, profile, matchHistory] = await Promise.all([
        GetCurrentSummoner(),
        GetSummonerProfile(),
        GetMatchHistory(),
      ]);

      summonerData = summoner;
      profileData = profile;
      console.log("Summoner:", summoner);
      console.log("Profile:", profile);
      console.log("Match History:", matchHistory);
      matchHistoryData = matchHistory as { games: { games: Match[] } };
    } catch (err) {
      console.error("Error loading user data:", err);
      errorMessage = err.toString();
    } finally {
      loading = false;
    }
  }
</script>

<main>
  <div class="container">
    <img alt="League Logo" id="logo" src={logo} />

    <div class="status">
      {#if lcuConnected}
        <span class="status-indicator connected"></span>
        <span>League Client Connected</span>
      {:else}
        <span class="status-indicator disconnected"></span>
        <span>Waiting for League Client...</span>
      {/if}
    </div>

    {#if loading}
      <div class="loading">Loading user data...</div>
    {:else if errorMessage}
      <div class="error">{errorMessage}</div>
    {:else if summonerData}
      <div class="user-info">
        <div class="match-history">
          <h3>Match History</h3>
          <div class="flex flex-col gap-4">
            {#each matchHistoryData.games.games as match}
              <div class="match-history-item">
                <MatchHistoryItem match={match} />
              </div>
            {/each}
          </div>
        </div>

        <button class="btn refresh" on:click={loadUserData}>
          Refresh Data
        </button>
      </div>
    {/if}
  </div>
</main>

<style>
  main {
    height: 100vh;
    overflow-y: auto;
  }

  .container {
    padding: 1.5rem;
    max-width: 100%;
  }

  #logo {
    display: block;
    width: 80px;
    height: 80px;
    margin: 0 auto 1rem;
  }

  .status {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.75rem;
    margin-bottom: 1rem;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.05);
    font-size: 0.9rem;
  }

  .status-indicator {
    width: 10px;
    height: 10px;
    border-radius: 50%;
    animation: pulse 2s infinite;
  }

  .status-indicator.connected {
    background: #4caf50;
  }

  .status-indicator.disconnected {
    background: #ff5252;
  }

  @keyframes pulse {
    0%,
    100% {
      opacity: 1;
    }
    50% {
      opacity: 0.5;
    }
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: #888;
    font-style: italic;
  }

  .error {
    padding: 1rem;
    background: rgba(255, 82, 82, 0.1);
    border: 1px solid #ff5252;
    border-radius: 8px;
    color: #ff5252;
    margin-bottom: 1rem;
    font-size: 0.85rem;
  }

  .user-info {
    animation: fadeIn 0.3s ease-in;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  h2 {
    margin: 0 0 1.5rem 0;
    text-align: center;
    font-size: 1.5rem;
    color: #f0e6d2;
    text-shadow: 0 2px 4px rgba(0, 0, 0, 0.3);
  }

  h3 {
    margin: 1.5rem 0 1rem 0;
    font-size: 1.1rem;
    color: #c89b3c;
    border-bottom: 1px solid rgba(200, 155, 60, 0.3);
    padding-bottom: 0.5rem;
  }

  .info-grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.75rem;
    margin-bottom: 1rem;
  }

  .info-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.03);
    border-radius: 6px;
    border: 1px solid rgba(255, 255, 255, 0.1);
  }

  .info-item.full-width {
    grid-column: 1 / -1;
    flex-direction: column;
    align-items: flex-start;
    gap: 0.5rem;
  }

  .label {
    font-weight: 600;
    color: #a09b8c;
    font-size: 0.85rem;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }

  .value {
    color: #f0e6d2;
    font-weight: 500;
  }

  .value.small {
    font-size: 0.75rem;
    word-break: break-all;
    color: #888;
  }

  .profile-section {
    margin-top: 1.5rem;
    padding-top: 1rem;
  }

  .btn {
    width: 100%;
    padding: 0.75rem;
    border: none;
    border-radius: 6px;
    background: linear-gradient(135deg, #c89b3c 0%, #f0e6d2 100%);
    color: #1e2328;
    font-weight: 600;
    font-size: 0.9rem;
    cursor: pointer;
    transition: all 0.3s ease;
    margin-top: 1rem;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .btn:hover {
    transform: translateY(-2px);
    box-shadow: 0 4px 12px rgba(200, 155, 60, 0.4);
  }

  .btn:active {
    transform: translateY(0);
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(200, 155, 60, 0.5);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(200, 155, 60, 0.7);
  }
</style>
