<script lang="ts">
  import type { ChampionStats, SummonerRankResult } from "../services/api";
  import {
    getChampionStatsForPlayer,
    getRankText,
    getRankTier,
    getRankIconSrc,
  } from "../champ-select-utils";
  import ChampSelectPlayer from "./champ-select-player.svelte";

  let {
    title,
    players,
    localPlayerCellId,
    championImages,
    isEnemy,
    playerStats,
    playerRanks,
  }: {
    title: string;
    players: any[];
    localPlayerCellId: number;
    championImages: Record<number, string>;
    isEnemy: boolean;
    playerStats: Record<string, ChampionStats[]>;
    playerRanks: Record<string, SummonerRankResult>;
  } = $props();
</script>

<div
  class="px-2 py-1 pb-2 flex flex-col gap-1  rounded-md text-start"
>
  <h3>{title}</h3>
  <div class="flex flex-col gap-2">
    {#each players as player (player.cellId)}
      {@const displayChampId =
        player.championId > 0 ? player.championId : player.championPickIntent}
      {@const championStats =
        displayChampId > 0
          ? getChampionStatsForPlayer(
              playerStats,
              player.gameName,
              player.tagLine,
              displayChampId,
            )
          : null}
      {@const rankText = getRankText(playerRanks, player.gameName, player.tagLine)}
      {@const rankTier = getRankTier(playerRanks, player.gameName, player.tagLine)}
      {@const rankIcon = getRankIconSrc(rankTier)}

      <ChampSelectPlayer
        {player}
        {localPlayerCellId}
        {isEnemy}
        {championImages}
        {displayChampId}
        {championStats}
        {rankText}
        {rankIcon}
      />
    {/each}
  </div>
</div>
