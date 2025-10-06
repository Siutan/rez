<script lang="ts">
  import MatchHistoryItem from "./match-history-item.svelte";
  import type { Match } from "../../types/lcu/match";

  let { matchHistoryData }: { matchHistoryData: { games: { games: Match[] } } } = $props();
</script>

<div class="p-1">
  <div class="flex flex-col gap-4">
    {#each matchHistoryData.games.games as match}
      <div class="match-history-item">
        <MatchHistoryItem {match} />
      </div>
    {/each}
  </div>
</div>

