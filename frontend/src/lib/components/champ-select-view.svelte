<script lang="ts">
  import { DDragon } from "../services/ddragon";

  export let champSelectData;

  let championImages = {};
  let loading = true;

  $: if (champSelectData) {
    loadChampionImages();
  }

  async function loadChampionImages() {
    loading = true;
    const championIds = new Set<number>();

    // Collect all champion IDs
    champSelectData.myTeam?.forEach((player) => {
      if (player.championId > 0) championIds.add(player.championId);
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
      top: "🛡️",
      jungle: "🌲",
      middle: "⚔️",
      bottom: "🏹",
      utility: "✨",
    };
    return icons[position?.toLowerCase()] || "❓";
  }

  function formatTime(seconds: number) {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, "0")}`;
  }

  $: currentPhase = champSelectData?.timer?.phase || "Unknown";
  $: timeLeft = champSelectData?.timer?.adjustedTimeLeftInPhase || 0;
  $: myTeam = champSelectData?.myTeam || [];
  $: myBans = champSelectData?.bans?.myTeamBans || [];
  $: theirBans = champSelectData?.bans?.theirTeamBans || [];
  $: localPlayerCellId = champSelectData?.localPlayerCellID || -1;
</script>

<div class="champ-select-container">
  <div class="header">
    <h2>Champion Select</h2>
    <div class="timer">
      <span class="phase">{currentPhase}</span>
      <span class="time">{formatTime(timeLeft)}</span>
    </div>
  </div>

  {#if loading}
    <div class="loading">Loading champion data...</div>
  {:else}
    <div class="content">
      <!-- My Team -->
      <div class="section">
        <h3>Your Team</h3>
        <div class="team-grid">
          {#each myTeam as player}
            <div
              class="player-card"
              class:is-you={player.cellId === localPlayerCellId}
            >
              <div class="position">
                {getPositionIcon(player.assignedPosition)}
              </div>
              {#if player.championId > 0 && championImages[player.championId]}
                <img
                  src={championImages[player.championId]}
                  alt="Champion"
                  class="champion-icon"
                />
              {:else}
                <div class="champion-placeholder">?</div>
              {/if}
              <div class="player-info">
                <span class="cell-id">Player {player.cellId + 1}</span>
                {#if player.cellId === localPlayerCellId}
                  <span class="you-badge">YOU</span>
                {/if}
              </div>
            </div>
          {/each}
        </div>
      </div>

      <!-- Bans -->
      <div class="bans-section">
        <div class="ban-column">
          <h3>Your Bans</h3>
          <div class="ban-grid">
            {#each myBans as banId}
              {#if banId > 0 && championImages[banId]}
                <img
                  src={championImages[banId]}
                  alt="Banned Champion"
                  class="ban-icon"
                />
              {:else if banId > 0}
                <div class="ban-placeholder">?</div>
              {:else}
                <div class="ban-placeholder empty">-</div>
              {/if}
            {/each}
          </div>
        </div>

        <div class="ban-column">
          <h3>Enemy Bans</h3>
          <div class="ban-grid">
            {#each theirBans as banId}
              {#if banId > 0 && championImages[banId]}
                <img
                  src={championImages[banId]}
                  alt="Banned Champion"
                  class="ban-icon"
                />
              {:else if banId > 0}
                <div class="ban-placeholder">?</div>
              {:else}
                <div class="ban-placeholder empty">-</div>
              {/if}
            {/each}
          </div>
        </div>
      </div>

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

  .header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1.5rem;
    padding-bottom: 1rem;
    border-bottom: 2px solid rgba(200, 155, 60, 0.3);
  }

  h2 {
    margin: 0;
    font-size: 1.5rem;
    color: #c89b3c;
    text-transform: uppercase;
    letter-spacing: 2px;
  }

  .timer {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    gap: 0.25rem;
  }

  .phase {
    font-size: 0.85rem;
    color: #888;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .time {
    font-size: 1.5rem;
    font-weight: bold;
    color: #c89b3c;
    font-family: monospace;
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

  .section h3,
  .bans-section h3,
  .analytics-section h3 {
    margin: 0 0 1rem 0;
    font-size: 1rem;
    color: #c89b3c;
    text-transform: uppercase;
    letter-spacing: 1px;
  }

  .team-grid {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .player-card {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: rgba(255, 255, 255, 0.05);
    border-radius: 8px;
    border: 2px solid transparent;
    transition: all 0.2s ease;
  }

  .player-card.is-you {
    background: rgba(200, 155, 60, 0.1);
    border-color: #c89b3c;
  }

  .position {
    font-size: 1.5rem;
    width: 30px;
    text-align: center;
  }

  .champion-icon {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    border: 2px solid rgba(200, 155, 60, 0.5);
  }

  .champion-placeholder {
    width: 48px;
    height: 48px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888;
    font-size: 1.5rem;
    border: 2px solid rgba(255, 255, 255, 0.1);
  }

  .player-info {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    flex: 1;
  }

  .cell-id {
    font-size: 0.9rem;
    color: #ddd;
  }

  .you-badge {
    display: inline-block;
    padding: 0.2rem 0.5rem;
    background: #c89b3c;
    color: #1e2328;
    font-size: 0.7rem;
    font-weight: bold;
    border-radius: 4px;
    width: fit-content;
  }

  .bans-section {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 1rem;
  }

  .ban-column {
    background: rgba(255, 255, 255, 0.03);
    padding: 1rem;
    border-radius: 8px;
  }

  .ban-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(40px, 1fr));
    gap: 0.5rem;
  }

  .ban-icon {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    border: 2px solid rgba(255, 82, 82, 0.5);
    opacity: 0.7;
  }

  .ban-placeholder {
    width: 40px;
    height: 40px;
    border-radius: 6px;
    background: rgba(255, 255, 255, 0.1);
    display: flex;
    align-items: center;
    justify-content: center;
    color: #888;
    border: 2px solid rgba(255, 255, 255, 0.1);
  }

  .ban-placeholder.empty {
    opacity: 0.3;
  }

  .analytics-section {
    background: rgba(200, 155, 60, 0.05);
    padding: 1rem;
    border-radius: 8px;
    border: 1px solid rgba(200, 155, 60, 0.2);
  }

  .analytics-placeholder {
    color: #888;
  }

  .analytics-placeholder p {
    margin: 0 0 0.75rem 0;
    font-style: italic;
  }

  .analytics-placeholder ul {
    margin: 0;
    padding-left: 1.5rem;
  }

  .analytics-placeholder li {
    margin: 0.5rem 0;
  }

  /* Scrollbar styling */
  ::-webkit-scrollbar {
    width: 8px;
  }

  ::-webkit-scrollbar-track {
    background: rgba(0, 0, 0, 0.2);
  }

  ::-webkit-scrollbar-thumb {
    background: rgba(200, 155, 60, 0.5);
    border-radius: 4px;
  }

  ::-webkit-scrollbar-thumb:hover {
    background: rgba(200, 155, 60, 0.7);
  }
</style>

