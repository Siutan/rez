<script lang="ts">
  import { DDragon } from "../services/ddragon";
  import {
    getPlayerChampionStats,
    type ChampionStats,
    fetchSummonerRanks,
    type SummonerRankResult,
  } from "../services/api";
  import { watch } from "runed";
  import type { DraftState } from "../draft/types";
  import { toNumber } from "../utils";
  import ChampSelectTeam from "./Champ-select-team.svelte";

  let {
    draft,
    regionId,
  }: {
    draft: DraftState | null;
    regionId: string;
  } = $props();

  let championImages = $state<Record<number, string>>({});
  let loading = $state(true);
  let playerStats = $state<Record<string, ChampionStats[]>>({});
  let playerRanks = $state<Record<string, SummonerRankResult>>(/** @type {any} */ ({}));

  // Reactively load champion images and player stats when data changes
  watch(
    () => draft,
    () => {
      loadChampionImages();
      loadPlayerStats();
      loadPlayerRanks();
    },
  );

  async function loadChampionImages() {
    loading = true;
    const championIds = new Set<number>();

    // Collect all champion IDs from both teams
    draft?.myTeam?.forEach((player) => {
      if (player.championId > 0)
        championIds.add(toNumber(player.championId));
      if (player.championPickIntent > 0)
        championIds.add(toNumber(player.championPickIntent));
    });

    draft?.theirTeam?.forEach((player) => {
      if (player.championId > 0)
        championIds.add(toNumber(player.championId));
      if (player.championPickIntent > 0)
        championIds.add(toNumber(player.championPickIntent));
    });

    draft?.bans?.myTeamBans?.forEach((id) => {
      if (id > 0) championIds.add(id);
    });

    draft?.bans?.theirTeamBans?.forEach((id) => {
      if (id > 0) championIds.add(id);
    });

    // Load champion images
    for (const id of championIds) {
      try {
        const champData = DDragon.getChampion(id);
        if (champData && champData.id) {
          championImages[id] = await DDragon.getChampionIcon(champData.id);
        }
      } catch (err) {
        console.error(`Failed to load champion ${id}:`, err);
      }
    }
    championImages = { ...championImages };
    loading = false;
  }

  async function loadPlayerRanks() {
    if (!draft) return;
    const inputs: { riotUserName: string; riotTagLine: string; regionId: string }[] = [];

    const pushPlayer = (p: any) => {
      if (p?.gameName && p?.tagLine && regionId) {
        inputs.push({ riotUserName: p.gameName, riotTagLine: p.tagLine, regionId });
      }
    };

    draft.myTeam?.forEach(pushPlayer);
    draft.theirTeam?.forEach(pushPlayer);

    if (inputs.length === 0) return;

    const res = await fetchSummonerRanks(inputs);
    if (res.success && res.data) {
      const map: Record<string, SummonerRankResult> = {};
      for (const entry of res.data) {
        map[`${entry.riotUserName}#${entry.riotTagLine}`] = entry;
      }
      playerRanks = map;
    }
  }

  async function loadPlayerStats() {
    const newPlayerStats: Record<string, ChampionStats[]> = {};

    // Load stats for all players in both teams
    const allPlayers = [...(draft?.myTeam || []), ...(draft?.theirTeam || [])];

    // Create array of promises for parallel execution
    const playerPromises = allPlayers
      .filter(player => player.gameName && player.tagLine)
      .map(async (player) => {
        const playerKey = `${player.gameName}#${player.tagLine}`;
        try {
          const response = await getPlayerChampionStats(player.gameName, player.tagLine, regionId)
          
          if (response.success && response.data) {
            return { playerKey, data: response.data, status: response.success ? 'success' : 'error' };
          }
          return { playerKey, data: [], status: 'missing' };
        } catch (error) {
          console.error(`Failed to load stats for ${playerKey}:`, error);
          return { playerKey, data: [], status: 'error' };
        }
      });

    // Execute all requests in parallel
    const results = await Promise.all(playerPromises);
    
    // Process results
    results.forEach(({ playerKey, data, status }) => {
      newPlayerStats[playerKey] = data;
      
      // Log status for debugging
      if (status === 'stale' || status === 'expired') {
        console.log(`📊 ${playerKey}: Using ${status} data (background update queued)`);
      } else if (status === 'missing') {
        console.log(`📊 ${playerKey}: No data available (background update queued)`);
      }
    });

    playerStats = newPlayerStats;
  }

  const myTeam = $derived(draft?.myTeam || []);
  const theirTeam = $derived(draft?.theirTeam || []);
  const myBans = $derived(draft?.bans?.myTeamBans || []);
  const theirBans = $derived(draft?.bans?.theirTeamBans || []);
  const localPlayerCellId = $derived(draft?.localPlayerCellId || -1);
</script>

<div class="champ-select-container">
  {#if loading}
    <div class="loading">Loading champion data...</div>
  {:else}
    <div class="content">
      <!-- Bans
       Going to leave this out for now as i'm not sure if its needed.
       The bans are already displayed in the draft state on the client.
      -->
      <!-- <ChampSelectBans {myBans} {theirBans} {championImages} /> -->

      <!-- My Team -->
      <ChampSelectTeam
        title="Your Team"
        players={myTeam}
        {localPlayerCellId}
        {championImages}
        isEnemy={false}
        {playerStats}
        {playerRanks}
      />

      <!-- Enemy Team -->
      {#if theirTeam.length > 0}
        <ChampSelectTeam
          title="Enemy Team"
          players={theirTeam}
          {localPlayerCellId}
          {championImages}
          isEnemy={true}
          {playerStats}
          {playerRanks}
        />
      {/if}

      <!-- Analytics Section (Placeholder) -->
      <div class="analytics-section">
        <h3>Analytics</h3>
        <div class="analytics-placeholder">
          <p>Champion analytics will appear here</p>
          <ul>
            <li>Win rates</li>
            <li>Matchup data</li>
            <li>Recommended items</li>
            <li>Counter picks</li>
          </ul>
        </div>
      </div>
    </div>
  {/if}
</div>

<style>
  .champ-select-container {
    padding: 1rem;
    height: 100%;
    overflow-y: auto;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: #888;
    font-style: italic;
  }

  .content {
    display: flex;
    flex-direction: column;
    gap: 1.5rem;
  }
</style>
