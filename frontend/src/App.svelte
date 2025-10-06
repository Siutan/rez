<script lang="ts">
  import { onMount } from "svelte";
  import {
    GetCurrentSummoner,
    GetSummonerProfile,
    IsLCUConnected,
    GetMatchHistory,
  } from "../wailsjs/go/main/App.js";
  import { EventsOn } from "../wailsjs/runtime/runtime.js";
  import { DDragon } from "./lib/services/ddragon";
  import MatchHistoryView from "./lib/components/match-history-view.svelte";
  import ChampSelectView from "./lib/components/champ-select-view.svelte";
  import type { Match } from "./types/lcu/match";

  // App state
  let lcuConnected = false;
  let summonerData = null;
  let profileData = null;
  let matchHistoryData: { games: { games: Match[] } } = null;
  let errorMessage = "";
  let loading = false;

  // Router state
  let currentView: "match-history" | "champ-select" = "match-history";
  let champSelectData = null;

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
      champSelectData = null;
      currentView = "match-history";
    });

    EventsOn("lcu:champ-select", (data) => {
      console.log("Champ Select:", data);
      champSelectData = data;
      currentView = "champ-select";
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
  <div class="container bg-slate-950">
    {#if !lcuConnected}
      <div
        class="w-full p-2 bg-slate-900/40 rounded-md flex justify-center items-center gap-2"
      >
        <div class="w-2 h-2 bg-red-500 rounded-full"></div>
        <span>Waiting for League Client...</span>
      </div>
    {/if}

    <!-- View Navigation -->
    {#if summonerData && matchHistoryData}
      <div class="view-tabs">
        <button
          class="tab"
          class:bg-red-500={currentView === "match-history"}
          on:click={() => (currentView = "match-history")}
        >
          Match History
        </button>
        {#if champSelectData}
          <button
            class="tab"
            class:active={currentView === "champ-select"}
            on:click={() => (currentView = "champ-select")}
          >
            <span class="live-indicator"></span>
            Champion Select
          </button>
        {/if}
      </div>
    {/if}

    {#if loading}
      <div class="loading">Loading user data...</div>
    {:else if errorMessage}
      <div class="error">{errorMessage}</div>
    {:else if summonerData}
      <div class="user-info">
        {#if currentView === "match-history"}
          <MatchHistoryView {matchHistoryData} />
        {:else if currentView === "champ-select" && champSelectData}
          <ChampSelectView {champSelectData} />
        {/if}
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

  .view-tabs {
    display: flex;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .tab {
    flex: 1;
    padding: 0.75rem 1rem;
    border: none;
    background: transparent;
    color: #888;
    font-weight: 600;
    font-size: 0.85rem;
    cursor: pointer;
    transition: all 0.3s ease;
    text-transform: uppercase;
    letter-spacing: 1px;
    border-bottom: 3px solid transparent;
    position: relative;
  }

  .live-indicator {
    display: inline-block;
    width: 8px;
    height: 8px;
    border-radius: 50%;
    background: #4caf50;
    margin-right: 0.5rem;
    animation: pulse 2s infinite;
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
