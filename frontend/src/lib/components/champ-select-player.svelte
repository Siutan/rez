<script lang="ts">
  import type { ChampionStats } from "../services/api";
  import { getLaneIconSrc, getStatColor } from "../champ-select-utils";

  let {
    player,
    localPlayerCellId,
    isEnemy,
    championImages,
    displayChampId,
    championStats,
    rankText,
    rankIcon,
  }: {
    player: any;
    localPlayerCellId: number;
    isEnemy: boolean;
    championImages: Record<number, string>;
    displayChampId: number;
    championStats: ChampionStats | null;
    rankText: string;
    rankIcon: string | null;
  } = $props();

  const isLocked = $derived(player.championId > 0);

  const laneIconSrc = $derived(getLaneIconSrc(player.assignedPosition));
  const winRate = $derived(championStats?.win_rate ?? null);
  const winRateColor = $derived(
    winRate === null ? undefined : getStatColor(winRate, 0, 100),
  );
  const gamesPlayed = $derived(championStats?.total_matches ?? null);
  const kda = $derived(championStats?.avg_kda ?? null);
</script>

<div
  class="flex gap-3 p-2 rounded-xl bg-neutral-900/90"
  class:border={player.cellId === localPlayerCellId}
  class:border-sky-500={player.cellId === localPlayerCellId && !isEnemy}
  class:border-rose-500={player.cellId === localPlayerCellId && isEnemy}
>
  <!-- Champ icon -->
  <div class="shrink-0">
    {#if displayChampId > 0 && championImages[displayChampId]}
      <img
        src={championImages[displayChampId]}
        alt="Champion"
        class="w-12 h-12 rounded-md object-cover"
      />
    {:else}
      <div
        class="w-12 h-12 rounded-md bg-neutral-800 flex items-center justify-center text-xs text-neutral-500"
      >
        ?
      </div>
    {/if}
  </div>

  <!-- Details -->
  <div class="flex-1 flex flex-col gap-1 min-w-0">
    <!-- Top stat row -->
    <div class="flex items-center gap-2 text-[11px]">
      {#if rankIcon}
        <img src={rankIcon} alt="Rank" class="w-4 h-4 rounded-sm" />
      {/if}
      {#if winRate !== null}
        <span style={`color: ${winRateColor}`}>
          {winRate.toFixed(1)}%
        </span>
      {/if}
      <span class="text-neutral-600">•</span>
      {#if gamesPlayed !== null}
        <span class="text-teal-300">
          +{Math.round(Math.max(0, winRate ?? 0) - 50)}
        </span>
        <span class="text-neutral-600">•</span>
        <span class="text-sky-300">
          {gamesPlayed * 10}
        </span>
      {/if}
    </div>

    <!-- Second stat row -->
    <div class="flex items-center gap-2 text-[11px] text-neutral-300">
      {#if laneIconSrc}
        <img src={laneIconSrc} alt="Role" class="w-4 h-4 rounded-full" />
      {/if}
      {#if kda !== null}
        <span class="text-teal-300">
          {(kda ?? 0).toFixed(1)}
        </span>
        <span>
          {#if championStats}
            {championStats.kills.toFixed(1)}/{championStats.deaths.toFixed(1)}/{championStats.assists.toFixed(1)}
            ({kda.toFixed(1)})
          {:else}
            KDA data unavailable
          {/if}
        </span>
      {/if}
    </div>

    <!-- Name & games -->
    <div class="flex items-baseline gap-1">
      <span class="text-sm font-medium truncate">
        {player.gameName || `Player ${player.cellId + 1}`}
      </span>
      {#if gamesPlayed !== null}
        <span class="text-[11px] text-neutral-500 truncate">
          • {gamesPlayed} games played
        </span>
      {/if}
    </div>

    <!-- Rank text subtle line -->
    {#if rankText}
      <div class="text-[10px] text-neutral-500">
        {rankText}
      </div>
    {/if}
  </div>
</div>