import { Elysia, t } from "elysia";

export const championTiers = new Elysia({prefix: "/champion-tiers"}).get("/:role", ({ params}) => {
    const { role } = params;
    
    switch (role) {
        case "all":
            // return championTiers.all();
        default:
            // return championTiers.get(role);
    }
},
{
    tags: ["champion-tiers"],
    params: t.Object({
        role: t.String({
            enum: ["adc", "jungle", "mid", "support", "top", "all"],
        }),
    }),
});