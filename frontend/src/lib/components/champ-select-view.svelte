<script lang="ts">
  import { DDragon } from "../services/ddragon";
  import { getPlayerChampionStats, type ChampionStats } from "../services/api";
  import { watch } from "runed";

  let { champSelectData = $bindable() }: { champSelectData: any } = $props();

  let championImages = $state<Record<number, string>>({});
  let loading = $state(true);
  let playerStats = $state<Record<string, ChampionStats[]>>({});

  // Reactively load champion images and player stats when data changes
  watch(
    () => champSelectData,
    () => {
      loadChampionImages();
      loadPlayerStats();
    },
  );

  async function loadChampionImages() {
    loading = true;
    const championIds = new Set<number>();

    // Collect all champion IDs from both teams
    champSelectData.myTeam?.forEach((player) => {
      console.log({ player });
      if (player.championId > 0)
        championIds.add(Number.parseInt(player.championId));
      if (player.championPickIntent > 0)
        championIds.add(Number.parseInt(player.championPickIntent));
    });

    champSelectData.theirTeam?.forEach((player) => {
      if (player.championId > 0)
        championIds.add(Number.parseInt(player.championId));
      if (player.championPickIntent > 0)
        championIds.add(Number.parseInt(player.championPickIntent));
    });

    champSelectData.bans?.myTeamBans?.forEach((id) => {
      if (id > 0) championIds.add(id);
    });

    champSelectData.bans?.theirTeamBans?.forEach((id) => {
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

  async function loadPlayerStats() {
    const newPlayerStats: Record<string, ChampionStats[]> = {};

    // Load stats for all players in both teams
    const allPlayers = [...(champSelectData.myTeam || []), ...(champSelectData.theirTeam || [])];

    for (const player of allPlayers) {
      if (player.gameName && player.tagLine) {
        const playerKey = `${player.gameName}#${player.tagLine}`;
        const response = await getPlayerChampionStats(player.gameName, player.tagLine);
        
        if (response.success && response.data) {
          newPlayerStats[playerKey] = response.data;
        }
      }
    }

    playerStats = newPlayerStats;
  }

  function getChampionStatsForPlayer(gameName: string, tagLine: string, championId: number): ChampionStats | null {
    if (!gameName || !tagLine) return null;
    
    const playerKey = `${gameName}#${tagLine}`;
    const stats = playerStats[playerKey];
    
    if (!stats) return null;
    
    return stats.find((stat) => stat.champion_id === championId) || null;
  }

  function getPositionIcon(position: string) {
    const icons = {
      top: "Top",
      jungle: "Jg",
      middle: "Mid",
      bottom: "Adc",
      utility: "Sup",
    };
    return icons[position?.toLowerCase()] || "?";
  }

  function formatTime(milliseconds: number) {
    const totalSeconds = Math.floor(milliseconds / 1000);
    const mins = Math.floor(totalSeconds / 60);
    const secs = totalSeconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  const myTeam = $derived(champSelectData?.myTeam || []);
  const theirTeam = $derived(champSelectData?.theirTeam || []);
  const myBans = $derived(champSelectData?.bans?.myTeamBans || []);
  const theirBans = $derived(champSelectData?.bans?.theirTeamBans || []);
  const localPlayerCellId = $derived(champSelectData?.localPlayerCellId || -1);
</script>

<div class="champ-select-container">
  {#if loading}
    <div class="loading">Loading champion data...</div>
  {:else}
    <div class="content">
      <!-- Bans -->
      <div class="flex gap-2 justify-between items-center">
        <div class="flex flex-col gap-2">
          <h3>Your Bans</h3>
          <div class="flex flex-wrap gap-2">
            {#each myBans as banId}
              {#if banId > 0 && championImages[banId]}
                <img
                  src={championImages[banId]}
                  alt="Banned Champion"
                  class="w-4 h-4 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                />
              {:else if banId > 0}
                <div
                  class="w-4 h-4 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                >
                  ?
                </div>
              {:else}
                <div
                  class="w-4 h-4 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                >
                  -
                </div>
              {/if}
            {/each}
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <h3>Enemy Bans</h3>
          <div class="flex flex-wrap gap-2">
            {#each theirBans as banId}
              {#if banId > 0 && championImages[banId]}
                <img
                  src={championImages[banId]}
                  alt="Banned Champion"
                  class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                />
              {:else if banId > 0}
                <div
                  class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                >
                  ?
                </div>
              {:else}
                <div
                  class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                >
                  -
                </div>
              {/if}
            {/each}
          </div>
        </div>
      </div>
      <!-- My Team -->
      <div
        class="px-2 py-1 pb-2 flex flex-col gap-1 bg-slate-900 rounded-md text-start"
      >
        <h3>Your Team</h3>
        <div class="flex flex-col gap-2">
          {#each myTeam as player}
            {@const displayChampId =
              player.championId > 0
                ? player.championId
                : player.championPickIntent}
            {@const isLocked = player.championId > 0}
            {@const championStats = displayChampId > 0 ? getChampionStatsForPlayer(player.gameName, player.tagLine, displayChampId) : null}
            <div
              class="flex flex-col gap-1 p-1 bg-sky-900/40 rounded-md"
              class:border={player.cellId === localPlayerCellId}
              class:border-sky-500={player.cellId === localPlayerCellId}
            >
              <div class="flex justify-between items-center">
                <div class="flex items-center gap-2">
                  {#if player.assignedPosition}
                  <div
                    class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                  >
                    {getPositionIcon(player.assignedPosition)}
                  </div>
                {/if}
                {#if displayChampId > 0 && championImages[displayChampId]}
                  <img
                    src={championImages[displayChampId]}
                    alt="Champion"
                    class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                    class:border={!isLocked}
                    class:border-sky-500={!isLocked}
                  />
                {:else}
                  <div
                    class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                  >
                    ?
                  </div>
                {/if}
                </div>
                {#if player.gameName}
                  <span class="text-xs"
                    >{player.gameName}#{player.tagLine || ""}</span
                  >
                {:else}
                  <span class="text-xs">Player {player.cellId + 1}</span>
                {/if}
              </div>
              {#if championStats}
                <div class="flex gap-2 text-[10px] text-slate-300 pl-1">
                  <span class="text-emerald-400">{championStats.win_rate.toFixed(1)}% WR</span>
                  <span>{championStats.total_matches}G</span>
                  <span>{championStats.avg_kda.toFixed(2)} KDA</span>
                </div>
              {/if}
            </div>
          {/each}
        </div>
      </div>

      <!-- Enemy Team -->
      {#if theirTeam.length > 0}
        <div
          class="px-2 py-1 pb-2 flex flex-col gap-1 bg-slate-900 rounded-md text-start"
        >
          <h3>Enemy Team</h3>
          <div class="flex flex-col gap-2">
            {#each theirTeam as player}
              {@const displayChampId =
                player.championId > 0
                  ? player.championId
                  : player.championPickIntent}
              {@const isLocked = player.championId > 0}
              {@const championStats = displayChampId > 0 ? getChampionStatsForPlayer(player.gameName, player.tagLine, displayChampId) : null}
              <div
                class="flex flex-col gap-1 p-1 bg-rose-900/40 rounded-md"
              >
                <div class="flex justify-between items-center">
                  <div class="flex items-center gap-2">
                    {#if player.assignedPosition}
                      <div
                        class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                      >
                        {getPositionIcon(player.assignedPosition)}
                      </div>
                    {/if}
                    {#if displayChampId > 0 && championImages[displayChampId]}
                      <img
                        src={championImages[displayChampId]}
                        alt="Champion"
                        class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                        class:border={!isLocked}
                        class:border-rose-500={!isLocked}
                      />
                    {:else}
                      <div class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center">?</div>
                    {/if}
                  </div>
                  {#if player.gameName}
                    <span class="text-xs"
                      >{player.gameName}#{player.tagLine || ""}</span
                    >
                  {:else}
                    <span class="text-xs">Player {player.cellId + 1}</span>
                  {/if}
                </div>
                {#if championStats}
                  <div class="flex gap-2 text-[10px] text-slate-300 pl-1">
                    <span class="text-rose-400">{championStats.win_rate.toFixed(1)}% WR</span>
                    <span>{championStats.total_matches}G</span>
                    <span>{championStats.avg_kda.toFixed(2)} KDA</span>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        </div>
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
