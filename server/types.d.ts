interface Object {
    // ambiant method added in helpers.ts
    // similar to "map" in Maybe monad
    oMap: <T, R>(this: T, mapper: (v: T) => R) => R
}

declare module 'ldapjs-promise-disconnectwhenidle' {
    import * as ldapjs from 'ldapjs'
    function init(conf: { uri: string[]; dn?: string; password?: string; disconnectWhenIdle_duration?: number; verbose?: boolean }): void
    function clientP(): ldapjs.Client
    function destroy(): void
    function search(base: string, filter: string, attributes: string[], options: ldapjs.SearchOptions): Promise<ldapjs.SearchEntryObject[]>
    function add(dn: string, entry: Record<string, unknown>): Promise<void>
    function del(dn: string): Promise<void>
    function modify(dn: string, change: ldapjs.Change | Array<ldapjs.Change>): Promise<void>
}

declare module 'ldapjs/lib/filters/escape' {
    function escape(s: string): string;
}
