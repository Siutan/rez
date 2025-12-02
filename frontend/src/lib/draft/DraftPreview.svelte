<script lang="ts">
  import ChampSelectView from "../components/champ-select-view.svelte";
  import { mockDraftStates } from "./mockStates";
  import type { DraftState } from "./types";

  const options = Object.entries(mockDraftStates).map(([key, value]) => ({
    key,
    label: key,
    draft: value as DraftState,
  }));

  let selectedKey = options[0]?.key ?? "";

  $: selectedDraft = options.find((o) => o.key === selectedKey)?.draft ?? null;
</script>

<div class="p-4 space-y-4 bg-slate-950 min-h-screen text-slate-100">
  <header class="flex items-center justify-between gap-4">
    <div>
      <h1 class="text-lg font-semibold">Champ Select Preview</h1>
      <p class="text-xs text-slate-400">
        These states are loaded from static JSON fixtures – no League client required.
      </p>
    </div>

    <label class="text-xs flex items-center gap-2">
      <span class="uppercase tracking-wide text-slate-400">Scenario</span>
      <select
        bind:value={selectedKey}
        class="bg-slate-900 border border-slate-700 rounded px-2 py-1 text-xs"
      >
        {#each options as o}
          <option value={o.key}>{o.label}</option>
        {/each}
      </select>
    </label>
  </header>

{#if selectedDraft}
    <section class="border border-slate-800 rounded-lg bg-slate-900/60 p-2">
      <ChampSelectView draft={selectedDraft} regionId={"na1"} />
    </section>
  {:else}
    <p class="text-sm text-slate-400">No preview state selected.</p>
  {/if}
</div>


