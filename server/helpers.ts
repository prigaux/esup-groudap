import { MyMap, Option } from './my_types'

export const build_url_from_parts = (scheme: Option<string>, host_only: string, port: Option<string>, path_and_query: string) => {
    const scheme_ = scheme ?? (port === "443" || port === "8443" ? "https" : "http")
    return port && port !== "80" && port !== "443" ?
        `${scheme_}://${host_only}:${port}${path_and_query}` :
        `${scheme_}://${host_only}${path_and_query}`
}

export const parse_host_and_port = (host: string) => {
    const m = host?.match("(.*):(.*)");
    if (m) {
        const [, host_only, port ] = m
        return { host_only, port }
    } else {
        return { host_only: host }
    }
}

// yyyy-mm-ddThh:mm:ss => yyyymmddhhmmssZ 
export const iso8601_to_generalized_time = (time: string) => {
    const gtime = time.replace(/\D/g, '').substring(0, 14)
    return gtime.length === 14 ? gtime + "Z" : undefined
}

// yyyymmddhhmmssZ => yyyy-mm-ddThh:mm:ss
export const generalized_time_to_iso8601 = (gtime: string) => {
    const m = gtime.match(/^(....)(..)(..)(..)(..)(..)Z/)
    if (m) {
        const [ , year, month, day, hh, mm, ss ] = m
        return `${year}-${month}-${day}T${hh}:${mm}:${ss}`
    } else {
        return undefined
    }
}

export const hashmap_difference = <K extends string, V>(m1: MyMap<K,V>, m2 : MyMap<K,V>) => {
    const r : MyMap<K,V> = {}
    for (const k in m1) {
        const v = m1[k]
        if (m2[k] !== v) {
            r[k] = v
        }
    }
    return r
}

import { spawn } from 'child_process';
import { promisify } from 'util'

export function popen(inText: string, cmd: string, params: string[], env?: NodeJS.ProcessEnv): Promise<string> {
    const p = spawn(cmd, params, { env });
    p.stdin.write(inText);
    p.stdin.end();

    return  new Promise((resolve, reject) => {
        let output = '';
        const get_ouput = (data: any) => { output += data; };

        p.stdout.on('data', get_ouput);
        p.stderr.on('data', get_ouput);
        p.on('error', event => {
            reject(event);
        });
        p.on('close', code => {
            if (code === 0) resolve(output); else reject(output);
        });
    });
}

export const strip_prefix = (s: string, prefix: string) => (
    s.startsWith(prefix) ? s.substring(prefix.length) : undefined
)

export const strip_suffix = (s: string, suffix: string) => (
    s.endsWith(suffix) ? s.substring(0, s.length - suffix.length) : undefined
)

export const may_strip_suffix = (s: string, suffix: string) => (
    s.endsWith(suffix) ? s.substring(0, s.length - suffix.length) : s
)

export const before_and_after = (s: string, sep: string): [string, string] | undefined => {
    const i = s.indexOf(sep)
    return i >= 0 ? [ s.substring(0, i), s.substring(i + sep.length) ] : undefined
}

export const before_and_between_and_after = (s: string, sep1: string, sep2: string): [string, string, string] | undefined => {
    const r = before_and_after(s, sep1)
    if (r === undefined) return undefined;
    const [beg, s_] = r
    const r2 = before_and_after(s_, sep2)
    if (r2 === undefined) return undefined;
    const [between, end] = r2
    return [beg, between, end]
}

export function get_delete<T>(o: Record<string, T>, key: string): T {
    const val = o[key];
    delete o[key];
    return val;
}

Object.defineProperty(Object.prototype, 'oMap', {
    value: function<T, R>(this: T, mapper: (v: T) => R): R {
        // unwrap Number/String
        // @ts-expect-error (easier that way...)
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-call
        return mapper(this.valueOf ? this.valueOf() : this)
    },
    enumerable: false,
})

export function throw_(err: Error | string): never {
    throw err
}

export function internal_error(): never {
    throw new Error("internal error")
}

export function dbg(a: any) {
    console.log('\x1b[33mdbg: %s\x1b[0m', a)
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return
    return a
}

export const promisify_method = (o: any, method: string) => (
    // eslint-disable-next-line @typescript-eslint/no-unsafe-return, @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-member-access
    promisify(o[method]).bind(o)
)

export const setTimeoutPromise = (time: number) => (
    new Promise((resolve, _) => setTimeout(resolve, time))
)

export function addSeconds(date: Date | string, seconds: number) {
    let r = new Date(date);
    r.setTime(r.getTime() + seconds * 1000);
    return r;
}
