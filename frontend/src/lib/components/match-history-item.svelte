<script lang="ts">
  import { DDragon } from "../services/ddragon";
  import type { Match } from "../../types/lcu/match";
  import { onMount } from "svelte";

  interface Props {
    match: Match;
  }

  let { match }: Props = $props();

  let loading = $state(true);

  // --- Derived references ---
  const participant = $derived(match.participants[0]);
  const player = $derived(
    match.participantIdentities.find(
      (p) => p.participantId === participant.participantId,
    )?.player,
  );
  const stats = $derived(participant.stats);

  // Champion and spell data from cache
  let champ = $state<any>(null);
  let spell1 = $state<any>(null);
  let spell2 = $state<any>(null);

  const items = $derived([
    stats.item0,
    stats.item1,
    stats.item2,
    stats.item3,
    stats.item4,
    stats.item5,
  ]);
  const trinket = $derived(stats.item6);

  // --- Fetched image URLs ---
  let champImg = $state("");
  let spellImg1 = $state("");
  let spellImg2 = $state("");
  let itemIcons = $state<string[]>([]);

  const formatDuration = (sec: number) => {
    const minutes = Math.floor(sec / 60);
    const seconds = sec % 60;
    return `${minutes}m ${seconds}s`;
  };

  onMount(async () => {
    loading = true;

    // Step 1: Get champion and spell data directly from cache using IDs
    champ = DDragon.getChampion(participant.championId);
    spell1 = DDragon.getSummonerSpell(participant.spell1Id.toString());
    spell2 = DDragon.getSummonerSpell(participant.spell2Id.toString());

    // Step 2: Fetch images in parallel
    const [
      fetchedChampImg,
      fetchedSpellImg1,
      fetchedSpellImg2,
      ...fetchedItemIcons
    ] = await Promise.all([
      champ ? DDragon.getChampionIcon(champ.image.full) : Promise.resolve(""),
      spell1
        ? DDragon.getSummonerSpellIcon(spell1.image.full)
        : Promise.resolve(""),
      spell2
        ? DDragon.getSummonerSpellIcon(spell2.image.full)
        : Promise.resolve(""),
      ...items.map((id) =>
        id > 0 ? DDragon.getItemIcon(id) : Promise.resolve(""),
      ),
      trinket > 0 ? DDragon.getItemIcon(trinket) : Promise.resolve(""),
    ]);

    champImg = fetchedChampImg;
    spellImg1 = fetchedSpellImg1;
    spellImg2 = fetchedSpellImg2;
    itemIcons = fetchedItemIcons;

    loading = false;
  });
</script>

<div
  class="relative w-full text-gray-100 rounded-md shadow-lg p-4 flex flex-col md:flex-row md:items-center gap-4 border border-gray-800 overflow-hidden group"
>
  <!-- Base gradient layer -->
  <div
    class="absolute inset-0 rounded-md {stats.win
      ? 'bg-gradient-to-r from-emerald-500 to-10% to-transparent'
      : 'bg-gradient-to-r from-rose-500 to-10% to-transparent'}"
  ></div>
  <!-- Hover gradient layer -->
  <div
    class="absolute inset-0 rounded-md opacity-0 group-hover:opacity-100 transition-opacity duration-200 {stats.win
      ? 'bg-gradient-to-r from-emerald-500 to-90% to-emerald-950'
      : 'bg-gradient-to-r from-rose-500 to-90% to-rose-950'}"
  ></div>
  <!-- Content wrapper -->
  <div
    class="relative z-10 w-full flex flex-col md:flex-row md:items-center gap-4"
  >
    {#if loading}
      <div class="w-full text-center p-8">Loading match data...</div>
    {:else if player}
      <div class="flex items-start gap-4">
        <div class="relative">
          <img
            src={champImg}
            alt={champ?.name}
            class="w-16 h-16 rounded-md border-2 border-gray-700 shrink-0 min-w-16"
          />
          <div
            class="absolute -top-2 -right-2 text-xs bg-gray-800 px-2 py-0.5 rounded-md"
          >
            {stats.champLevel}
          </div>
          <div class="flex gap-1 pt-1 w-full justify-between px-1">
            {#if spellImg1}<img
                src={spellImg1}
                class="w-6 h-6 rounded"
                alt={spell1?.name}
              />{/if}
            {#if spellImg2}<img
                src={spellImg2}
                class="w-6 h-6 rounded"
                alt={spell2?.name}
              />{/if}
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <div class="flex justify-between w-full items-center">
            <span class="text-lg tracking-wide"
              >{stats.kills}/{stats.deaths}/{stats.assists}</span
            >

            <span class="text-sm text-gray-400"
              >{(
                (stats.kills + stats.assists) /
                Math.max(stats.deaths, 1)
              ).toFixed(2)} KDA</span
            >

            <span class="text-xs text-gray-500"
              >{stats.totalMinionsKilled + stats.neutralMinionsKilled} CS</span
            >
          </div>
          <div class="flex flex-wrap gap-1 justify-end items-center">
            {#each items as item, i}
              {#if item > 0 && itemIcons[i]}
                <img
                  src={itemIcons[i]}
                  alt={`Item ${item}`}
                  class="w-7 h-7 rounded border border-gray-700"
                />
              {:else}
                <div
                  class="w-7 h-7 rounded border border-gray-800 bg-gray-800"
                ></div>
              {/if}
            {/each}

            {#if trinket > 0 && itemIcons[6]}
              <img
                src={itemIcons[6]}
                alt={`Trinket ${trinket}`}
                class="w-5 h-5 rounded border border-gray-700"
              />
            {:else}
              <div
                class="w-5 h-5 rounded border border-gray-800 bg-gray-800"
              ></div>
            {/if}
          </div>
          <!-- show this as a tooltop when hovering over the match -->
          <div class="flex items-center justify-between text-right">
            <span class="text-sm font-medium">{match.gameMode}</span>
            <span class="text-xs text-gray-500"
              >{formatDuration(match.gameDuration)}</span
            >
          </div>
        </div>
      </div>
    {/if}
  </div>
</div>
