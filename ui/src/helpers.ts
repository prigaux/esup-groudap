import { pick, sortBy } from "lodash"
import { PRecord } from "./my_types"

// NB: workaround typescript&lodash limitation on type of V param
export const forEach = <K extends keyof any, V>(o: PRecord<K, V>, f : (v: V, k:K) => void) => {
    for (const k in o) {
        f(o[k] as V, k)
    }
}

export const some = <K extends keyof any, V>(o: PRecord<K, V>, f : (v: V, k:K) => boolean) => {
    for (const k in o) {
        if (f(o[k] as V, k)) return true
    }
    return false
}

export const forEachAsync = async <K extends keyof any, V>(o: PRecord<K, V>, f : (v: V, k:K) => Promise<void>) => {
    for (const k in o) {
        await f(o[k] as V, k)
    }
}

export const objectSortBy = <V>(o: Record<string, V>, f : (v: V, k: string) => string): Record<string, V> => {
    const sorted_keys = sortBy(Object.keys(o), key => f(o[key] as V, key))
    return pick(o, sorted_keys)
}
