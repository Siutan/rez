<script lang="ts">
  import ChampSelectView from "../components/champ-select-view.svelte";
  import { mockDraftStates } from "./mockStates";
  import type { DraftState } from "./types";

  const options = Object.entries(mockDraftStates).map(([key, value]) => ({
    key,
    label: key,
    draft: value as DraftState,
  }));

  let selectedKey = $state(options[0]?.key ?? "");

  const selectedDraft = $derived(
    options.find((o) => o.key === selectedKey)?.draft ?? null,
  );
</script>

<div
  class="min-h-screen bg-black flex items-start justify-center text-neutral-100"
>
  <div class="w-full p-4 space-y-4 flex flex-col items-center">
    <header class="w-full flex items-center justify-between gap-4">
      <h1 class="text-lg font-semibold">Champ Select Preview</h1>

      <label class="text-xs flex items-center gap-2">
        <span class="uppercase tracking-wide text-neutral-400">Scenario</span>
        <select
          bind:value={selectedKey}
          class="bg-neutral-900 border border-neutral-700 rounded px-2 py-1 text-xs"
        >
          {#each options as o (o.key)}
            <option value={o.key}>{o.label}</option>
          {/each}
        </select>
      </label>
    </header>

    {#if selectedDraft}
      <section
        class="w-[400px] border border-neutral-800 rounded-lg bg-neutral-950 p-2"
      >
        <ChampSelectView draft={selectedDraft} regionId="na1" useMockStats={false} />
      </section>
    {:else}
      <p class="text-sm text-neutral-400">No preview state selected.</p>
    {/if}
  </div>
</div>
