<script lang="ts">
  import { onMount, onDestroy } from "svelte";
  import ChampSelectView from "../components/champ-select-view.svelte";
  import { draftState } from "./store";
  import { pushLiveDraftUpdate, clearLiveDraft } from "./liveProvider";
  import type { DraftState, LcuChampSelectSession } from "./types";

  let {
    regionId,
  }: {
    regionId: string;
  } = $props();

  let unsubscribe: () => void;
  const draft = $derived($draftState);

  /**
   * Wire the shell to the existing Wails champ select events.
   * This keeps the event hookup near the UI, while the mapping
   * and store are encapsulated in the provider.
   */
  onMount(async () => {
    const { EventsOn } = await import("../../../wailsjs/runtime/runtime.js");

    const stopSelect = EventsOn("lcu:champ-select", (data: LcuChampSelectSession) => {
      pushLiveDraftUpdate(data);
    });

    const stopEnded = EventsOn("lcu:champ-select-ended", () => {
      clearLiveDraft();
    });

    unsubscribe = () => {
      stopSelect();
      stopEnded();
    };
  });

  onDestroy(() => {
    if (unsubscribe) unsubscribe();
  });
</script>

{#if draft}
  <ChampSelectView {draft} {regionId} />
{/if}

