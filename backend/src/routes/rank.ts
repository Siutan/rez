import { Elysia, t } from "elysia";
import { fetchSummonerRanks, type SummonerKey } from "../services/rank";

export const rankRoute = new Elysia()
  .post(
    "/rank",
    async ({ body }) => {
      try {
        const summoners = body.summoners as SummonerKey[];
        const results = await fetchSummonerRanks(summoners);
        return { success: true, data: results };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      tags: ["rank"],
      body: t.Object({
        summoners: t.Array(
          t.Object({
            riotUserName: t.String(),
            riotTagLine: t.String(),
            regionId: t.String(),
          })
        ),
      }),
    }
  );


