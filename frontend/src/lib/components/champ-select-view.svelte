<script lang="ts">
  import { DDragon } from "../services/ddragon";
  import { watch } from "runed";

  let { champSelectData = $bindable() }: { champSelectData: any } = $props();

  let championImages = $state<Record<number, string>>({});
  let loading = $state(true);

  // Reactively load champion images when data changes
  watch(
    () => champSelectData,
    () => {
      loadChampionImages();
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
            <div
              class="flex justify-between items-center p-1 bg-sky-900/40 rounded-md"
              class:border={player.cellId === localPlayerCellId}
              class:border-sky-500={player.cellId === localPlayerCellId}
            >
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
              <div
                class="flex justify-between items-center p-1 bg-rose-900/40 rounded-md"
              >
                <div class="flex items-center gap-2">
                  {#if player.assignedPosition}
                    {player.assignedPosition}
                    {getPositionIcon(player.assignedPosition)}
                  {/if}
                </div>
                {#if displayChampId > 0 && championImages[displayChampId]}
                  <img
                    src={championImages[displayChampId]}
                    alt="Champion"
                    class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center"
                    class:hovering={!isLocked}
                  />
                {:else}
                  <div class="w-8 h-8 shrink-0 bg-slate-900/40 rounded-md flex justify-center items-center">?</div>
                {/if}
                {#if player.gameName}
                  <span class="text-xs"
                    >{player.gameName}</span
                  >
                {:else}
                  <span class="text-xs">Player {player.cellId + 1}</span>
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
