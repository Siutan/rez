<script lang="ts">
  let {
    myBans,
    theirBans,
    championImages,
  }: {
    myBans: number[];
    theirBans: number[];
    championImages: Record<number, string>;
  } = $props();
</script>

<div class="flex gap-2 justify-between items-center">
  <div class="flex flex-col gap-2">
    <h3>Your Bans</h3>
    <div class="flex flex-wrap gap-2">
      {#each myBans as banId, i (i)}
        {#if banId > 0 && championImages[banId]}
          <img
            src={championImages[banId]}
            alt="Banned Champion"
            class="w-4 h-4 shrink-0 bg-neutral-900/40 rounded-md flex justify-center items-center"
          />
        {:else if banId > 0}
          <div
            class="w-4 h-4 shrink-0 bg-neutral-900/40 rounded-md flex justify-center items-center"
          >
            ?
          </div>
        {:else}
          <div
            class="w-4 h-4 shrink-0 bg-neutral-900/40 rounded-md flex justify-center items-center"
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
      {#each theirBans as banId, i (i)}
        {#if banId > 0 && championImages[banId]}
          <img
            src={championImages[banId]}
            alt="Banned Champion"
            class="w-8 h-8 shrink-0 bg-neutral-900/40 rounded-md flex justify-center items-center"
          />
        {:else if banId > 0}
          <div
            class="w-8 h-8 shrink-0 bg-neutral-900/40 rounded-md flex justify-center items-center"
          >
            ?
          </div>
        {:else}
          <div
            class="w-8 h-8 shrink-0 bg-neutral-900/40 rounded-md flex justify-center items-center"
          >
            -
          </div>
        {/if}
      {/each}
    </div>
  </div>
</div>


