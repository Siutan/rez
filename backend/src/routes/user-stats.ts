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
          isCurrentUser: body.isCurrentUser ?? false,
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
        isCurrentUser: t.Optional(t.Boolean()),
      }),
    }
  )
  // Get user stats by username and tagline
  .get(
    "/:riotUserName/:riotTagLine",
    async ({ params, query }) => {
      try {
        const result = await getUserStats(
          params.riotUserName,
          params.riotTagLine,
          query.regionId,
          query.isCurrentUser ?? false
        );

        return {
          success: true,
          data: result.data,
          status: result.status,
          lastUpdatedAt: result.lastUpdatedAt,
          needsUpdate: result.needsUpdate,
          priority: result.priority,
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
        riotUserName: t.String(),
        riotTagLine: t.String(),
      }),
      query: t.Object({
        regionId: t.Optional(t.String()),
        isCurrentUser: t.Optional(t.Boolean()),
      }),
    }
  );

