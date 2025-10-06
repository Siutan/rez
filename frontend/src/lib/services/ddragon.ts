interface DDragonCache {
    patch: string;
    champions: any; // Indexed by champion name
    championsById: Record<number, any>; // Indexed by champion ID (key)
    items: any;
    summonerSpells: any;
    runes: any;
    lastUpdated: number;
}

export class DDragon {
    // --- CLASS-LEVEL CONSTANTS (private static readonly) ---
    private static readonly BASE_URL = "https://ddragon.leagueoflegends.com"
    private static readonly CACHE_KEY = "ddragon_cache"
    private static readonly CACHE_DURATION = 1000 * 60 * 60 * 24 // 24 hours in milliseconds

    // --- CLASS-LEVEL STATE (private static) ---
    private static cache: DDragonCache | null = null

    // =========================================================================
    //                            PUBLIC UNIFIED GETTERS
    //    These methods implement the "Cache-First" strategy.
    // =========================================================================

    /**
     * Retrieves the current champion list, prioritizing the local cache.
     */
    public static async getChampions(): Promise<any> {
        const cachedData = this.getCacheData('champions');
        if (cachedData) return cachedData;

        console.warn("Champions not in cache. Fetching fresh data...");
        const patch = await this.fetchCurrentPatch();
        const freshData = await this.fetchChampionsData(patch);
        return freshData;
    }

    /**
     * Retrieves the data for a specific champion, prioritizing the local cache.
     * Accepts either a champion name (string) or champion ID (number) for efficient lookup.
     */
    public static getChampion(championIdentifier: string | number): any | null {
        if (typeof championIdentifier === 'number') {
            return this.getCacheData('championsById')?.[championIdentifier] || null;
        } else {
            return this.getCacheData('champions')?.[championIdentifier] || null;
        }
    }

    /**
     * Retrieves the URL for a specific champion's icon.
     * Uses the cached patch version if available, otherwise fetches current patch.
     */
    public static async getChampionIcon(championName: string): Promise<string> {
        const patch = this.getCachedPatch();

        if (patch) {
            // Use cached patch immediately to construct the URL
            return `${this.BASE_URL}/cdn/${patch}/img/champion/${championName}`;
        }

        // Fallback: fetch current patch (network request)
        console.warn("No cached patch. Fetching live patch for icon URL.");
        const currentPatch = await this.fetchCurrentPatch();
        return `${this.BASE_URL}/cdn/${currentPatch}/img/champion/${championName}`;
    }

    /**
     * Retrieves an item by ID, prioritizing the local cache.
     */
    public static getCachedItemById(itemId: string): any | null {
        return this.getCacheData('items')?.[itemId] || null;
    }

    /**
     * Retrieves the URL for an item icon.
     * Uses the cached patch version if available, otherwise fetches current patch.
     */
    public static async getItemIcon(itemId: number): Promise<string> {
        const patch = this.getCachedPatch();

        if (patch) {
            return `${this.BASE_URL}/cdn/${patch}/img/item/${itemId}.png`;
        }

        console.warn("No cached patch. Fetching live patch for icon URL.");
        const currentPatch = await this.fetchCurrentPatch();
        return `${this.BASE_URL}/cdn/${currentPatch}/img/item/${itemId}.png`;
    }

    // Add these methods to the PUBLIC UNIFIED GETTERS section of your DDragon class:

    /**
     * Retrieves the summoner spell list, prioritizing the local cache.
     */
    public static async getSummonerSpells(): Promise<any> {
        const cachedData = this.getCacheData('summonerSpells');
        if (cachedData) return cachedData;
        
        console.warn("Summoner Spells not in cache. Fetching fresh data...");
        const patch = await this.fetchCurrentPatch();
        const freshData = await this.fetchSummonerSpellsData(patch);
        return freshData;
    }

    /**
     * Retrieves a summoner spell by ID, prioritizing the local cache.
     */
    public static getSummonerSpell(spellId: string): any | null {
        // Assuming your cache stores spells by key/name for quick lookup
        const spells = this.getCacheData('summonerSpells');
        if (!spells) return null;

        // DDragon spells are often accessed by name/key, so find it in the object values
        return Object.values(spells).find((spell: any) => spell.key === spellId) || null;
    }
    
    /**
     * Retrieves the URL for a summoner spell icon.
     * Uses the cached patch version if available, otherwise fetches current patch.
     */
    public static async getSummonerSpellIcon(summonerSpellId: string): Promise<string> {
        const patch = this.getCachedPatch();
        
        if (patch) {
            // Use cached patch immediately to construct the URL
            return `${this.BASE_URL}/cdn/${patch}/img/spell/${summonerSpellId}`;
        }

        // Fallback: fetch current patch (network request)
        console.warn("No cached patch. Fetching live patch for spell icon URL.");
        const currentPatch = await this.fetchCurrentPatch();
        return `${this.BASE_URL}/cdn/${currentPatch}/img/spell/${summonerSpellId}`;
    }

    /**
     * Retrieves the runes list, prioritizing the local cache.
     * Note: Runes are an array, not a dictionary.
     */
    public static async getRunes(): Promise<any> {
        const cachedData = this.getCacheData('runes');
        if (cachedData) return cachedData;
        
        console.warn("Runes not in cache. Fetching fresh data...");
        const patch = await this.fetchCurrentPatch();
        const freshData = await this.fetchRunesData(patch);
        return freshData;
    }

    /**
     * Retrieves a rune by ID from the cache.
     * Runes data is often a complex array structure, requiring a deep search.
     */
    public static getRuneById(runeId: number): any | null {
        const runesData = this.getCacheData('runes'); // This is an array of primary trees
        if (!runesData || !Array.isArray(runesData)) return null;

        // Iterate through each rune tree (Precision, Domination, etc.)
        for (const tree of runesData) {
            // Iterate through the slots/rows within each tree
            for (const slot of tree.slots) {
                // Find the specific rune in the 'runes' array of the slot
                const rune = slot.runes.find((r: any) => r.id === runeId);
                if (rune) {
                    return rune;
                }
            }
        }

        return null;
    }

    /**
     * Retrieves the URL for a specific rune icon.
     * Uses the cached patch version if available, otherwise fetches current patch.
     * Note: DDragon uses the 'icon' path provided in the runes data for the image.
     */
    public static async getRuneIcon(runePath: string): Promise<string> {
        const patch = this.getCachedPatch();
        
        if (patch) {
            // DDragon rune icons use the path found in the rune data (e.g., 'perk-images/Styles/Precision/...')
            // We assume the caller provides the full path (e.g., from the riot API)
            return `${this.BASE_URL}/cdn/img/${runePath}`;
        }
        
        // This is a rare case where the URL structure is simpler, not requiring the patch/cdn path.
        // However, if the patch is changing, the available runes/paths might change.
        return `${this.BASE_URL}/cdn/img/${runePath}`;
    }

    // =========================================================================
    //                             CORE UTILITIES
    // =========================================================================

    /**
     * Initialize the DDragon service by fetching and caching all static data.
     */
    public static async init(forceUpdate: boolean = false): Promise<void> {
        // (Implementation remains the same as your original init)
        try {
            console.log("Initializing DDragon service...");

            const needsUpdate = await this.needsUpdate(forceUpdate);

            if (!needsUpdate) {
                console.log("DDragon data is up to date, loading from cache...");
                this.loadFromStorage();
                // Here, you might call the instance's onUpdate() if it was passed in
                return;
            }

            console.log("Fetching fresh DDragon data...");

            const patch = await this.fetchCurrentPatch();
            console.log(`Current patch: ${patch}`);

            // Fetch all data in parallel using the PRIVATE fetchers
            const [champions, items, summonerSpells, runes] = await Promise.all([
                this.fetchChampionsData(patch),
                this.fetchItemsData(patch),
                this.fetchSummonerSpellsData(patch),
                this.fetchRunesData(patch)
            ]);

            // Create a second map indexed by champion ID for O(1) lookup performance
            const championsById: Record<number, any> = {};
            for (const name in champions) {
                const champ = champions[name];
                championsById[parseInt(champ.key)] = champ;
            }

            this.cache = {
                patch,
                champions,
                championsById,
                items,
                summonerSpells,
                runes,
                lastUpdated: Date.now()
            };

            this.saveToStorage();
            console.log("DDragon initialization complete!");
        } catch (error) {
            console.error("Failed to initialize DDragon:", error);
            this.loadFromStorage();
        }
    }

    /**
     * Force update the cached data.
     */
    public static async forceUpdate(): Promise<void> {
        this.cache = null;
        localStorage.removeItem(this.CACHE_KEY);
        await this.init(true);
    }

    // =========================================================================
    //                             PRIVATE HELPERS
    // =========================================================================

    /**
     * Retrieves the cached patch version.
     */
    private static getCachedPatch(): string | null {
        if (!this.cache) {
            this.loadFromStorage();
        }
        return this.cache?.patch || null;
    }

    /**
     * Generic method to get data by key from cache.
     */
    private static getCacheData(key: keyof DDragonCache): any | null {
        if (!this.cache) {
            this.loadFromStorage();
        }
        // Note: The 'patch' and 'lastUpdated' keys are handled by getCachedPatch/needsUpdate
        return this.cache?.[key] || null;
    }

    /**
     * Load cached data from localStorage.
     */
    private static loadFromStorage(): void {
        // (Original loadFromStorage implementation remains here)
        try {
            const stored = localStorage.getItem(this.CACHE_KEY);
            if (stored) {
                this.cache = JSON.parse(stored);
                console.log("Loaded DDragon data from storage");
            }
        } catch (error) {
            console.error("Failed to load from storage:", error);
            this.cache = null;
        }
    }

    /**
     * Save cached data to localStorage.
     */
    private static saveToStorage(): void {
        // (Original saveToStorage implementation remains here)
        try {
            localStorage.setItem(this.CACHE_KEY, JSON.stringify(this.cache));
            console.log("Saved DDragon data to storage");
        } catch (error) {
            console.error("Failed to save to storage:", error);
        }
    }

    /**
     * Check if cached data exists and is still valid (uses fetchCurrentPatch).
     */
    private static async needsUpdate(forceUpdate: boolean = false): Promise<boolean> {
        // (Original needsUpdate implementation remains here)
        if (!this.cache) {
            this.loadFromStorage();
        }

        if (!this.cache) {
            return true;
        }

        const isExpired = forceUpdate || Date.now() - this.cache.lastUpdated > this.CACHE_DURATION;
        if (isExpired) {
            console.log("Cache has expired");
            return true;
        }

        try {
            const currentPatch = await this.fetchCurrentPatch();
            if (currentPatch !== this.cache.patch) {
                console.log(`Patch has changed from ${this.cache.patch} to ${currentPatch}`);
                return true;
            }
        } catch (error) {
            console.error("Failed to check current patch:", error);
            return false;
        }

        return false;
    }

    // =========================================================================
    //                             PRIVATE NETWORK FETCHERS
    //    These are the original public methods, now renamed and made private.
    // =========================================================================

    private static async fetchCurrentPatch(): Promise<string> {
        const response = await fetch(`${this.BASE_URL}/api/versions.json`);
        const data = await response.json();
        return data[0];
    }

    private static async fetchChampionsData(patch: string): Promise<any> {
        const response = await fetch(`${this.BASE_URL}/cdn/${patch}/data/en_US/champion.json`);
        const data = await response.json();
        return data.data;
    }

    // The previous getChampion(patch, name) is no longer needed as we rely 
    // on the full champion data being loaded into cache by fetchChampionsData

    private static async fetchItemsData(patch: string): Promise<any> {
        const response = await fetch(`${this.BASE_URL}/cdn/${patch}/data/en_US/item.json`);
        const data = await response.json();
        return data.data;
    }

    private static async fetchSummonerSpellsData(patch: string): Promise<any> {
        const response = await fetch(`${this.BASE_URL}/cdn/${patch}/data/en_US/summoner.json`);
        const data = await response.json();
        return data.data;
    }

    private static async fetchRunesData(patch: string): Promise<any> {
        try {
            const response = await fetch(`${this.BASE_URL}/cdn/${patch}/data/en_US/runesReforged.json`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.warn("Runes data not available, using empty object:", error);
            return {};
        }
    }
}