import { describe, expect, test } from 'bun:test';
import { mapFromLCU } from '../../src/lib/draft/mapping';
import type { LcuChampSelectSession } from '../../src/lib/draft/types';
import blueBanPhaseRaw from '../../src/mocks/draft/blue_side_ban_phase.json';

describe('mapFromLCU', () => {
  test('maps basic team and bans correctly', () => {
    const raw = blueBanPhaseRaw as LcuChampSelectSession;
    const mapped = mapFromLCU(raw);

    expect(mapped.myTeam.length).toBeGreaterThan(0);
    expect(mapped.theirTeam.length).toBeGreaterThan(0);

    expect(mapped.bans.myTeamBans.length).toBe(raw.bans.myTeamBans.length);
    expect(mapped.bans.theirTeamBans.length).toBe(raw.bans.theirTeamBans.length);

    expect(mapped.localPlayerCellId).toBe(raw.localPlayerCellId);
  });

  test('maps timer fields', () => {
    const raw = blueBanPhaseRaw as LcuChampSelectSession;
    const mapped = mapFromLCU(raw);

    expect(mapped.timer).not.toBeNull();
    expect(mapped.timer?.phase).toBe(raw.timer?.phase);
    expect(mapped.timer?.timeRemainingMs).toBe(raw.timer?.adjustedTimeLeftInPhase);
    expect(mapped.timer?.totalTimeMs).toBe(raw.timer?.totalTimeInPhase);
  });
});


