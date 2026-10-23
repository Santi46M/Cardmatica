import { API_CACHE } from "./config.js";

export class CatalogApi {
    constructor(
        base = document.querySelector('meta[name="cardmatica-api"]')?.content || location.origin
    ) {
        this.base = base;
        this.cache = new Map();
    }

    async get(path, parameters = {}, { signal, fresh = false } = {}) {
        const url = new URL(`/api/v1/${path}`, this.base);
        for (const [key, value] of Object.entries(parameters)) {
            if (value !== undefined && value !== null && value !== "")
                url.searchParams.set(key, value);
        }
        const cached = this.cache.get(url.href);
        if (!fresh && cached && cached.expires > Date.now()) return cached.data;
        const response = await fetch(url, { signal, headers: { Accept: "application/json" } });
        let data;
        try {
            data = await response.json();
        } catch {
            throw new Error("La API no devolvió una respuesta válida.");
        }
        if (!response.ok)
            throw new Error(data.error?.message || "No se pudo consultar el catálogo.");
        if (this.cache.size >= API_CACHE.maxEntries)
            this.cache.delete(this.cache.keys().next().value);
        this.cache.set(url.href, { data, expires: Date.now() + API_CACHE.ttlMs });
        return data;
    }
}
