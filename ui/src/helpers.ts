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

export const objectSortBy = <V>(o: Record<string, V>, f : (v: V, k: string) => string | undefined): Record<string, V> => {
    const sorted_keys = sortBy(Object.keys(o), key => f(o[key] as V, key))
    return pick(o, sorted_keys)
}

export function padStart(value : any, length : number, char : string) : string {
    value = value + '';
    var len = length - value.length;

    if (len <= 0) {
            return value;
    } else {
            return Array(len + 1).join(char) + value;
    }
}

export function addSeconds(date: Date, seconds: number) {
    let r = new Date(date);
    r.setTime(r.getTime() + seconds * 1000);
    return r;
}

export function formatDate(date : Date | string, format : string) : string { 
    const date_ : Date = typeof date === "string" ? new Date(date) : date; 
    if (!date) return ""; 
    return format.split(/(yyyy|MM|dd|HH|mm|ss)/).map(function (item) { 
        switch (item) { 
            case 'yyyy': return date_.getFullYear(); 
            case 'MM': return padStart(date_.getMonth() + 1, 2, '0'); 
            case 'dd': return padStart(date_.getDate(), 2, '0'); 
            case 'HH': return padStart(date_.getHours(), 2, '0'); 
            case 'mm': return padStart(date_.getMinutes(), 2, '0'); 
            case 'ss': return padStart(date_.getSeconds(), 2, '0'); 
            default: return item; 
        } 
    }).join('');    
} 
