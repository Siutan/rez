import { Elysia, t } from "elysia";
import { fetchAndStoreUserStats, getUserStats } from "../services/user-stats";

export const userStatsRoute = new Elysia({ prefix: "/user-stats" })
  // Fetch and store user stats
  .post(
    "/champions",
    async ({ body }) => {
      try {
        const stats = await fetchAndStoreUserStats({
          riotUserName: body.riotUserName,
          riotTagLine: body.riotTagLine,
          regionId: body.regionId,
        });

        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      tags: ["user-stats"],
      body: t.Object({
        riotUserName: t.String(),
        riotTagLine: t.String(),
        regionId: t.String(),
      }),
    }
  )
  // Get user stats by PUUID
  .get(
    "/:puuid",
    async ({ params }) => {
      try {
        const stats = await getUserStats(params.puuid);

        return {
          success: true,
          data: stats,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Unknown error",
        };
      }
    },
    {
      tags: ["user-stats"],
      params: t.Object({
        puuid: t.String(),
      }),
    }
  );

