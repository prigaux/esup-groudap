import _ from "lodash";
import ldap_filter from "./ldap_filter";
import * as ldp from "./ldap_read_search"
import { dn_to_rdn_and_parent_dn, dn_to_sgroup_id, dn_to_subject_source_cfg, urls_to_dns } from "./dn";
import { Dn, DnsOpts, hMyMap, MyMap, Option, SubjectAttrs, Subjects, SubjectSourceConfig, toDn } from "./my_types";
import { mono_attrs } from "./ldap_helpers";
import { get_delete } from "./helpers";

export const hSubjectSourceConfig = {
    export: (self: SubjectSourceConfig) => (
        _.omit(self, ['search_filter'])
    ),
    search_filter_: (sscfg: SubjectSourceConfig, term: string) => (
        sscfg.search_filter.replace(/%TERM%/g, term).replace(/ /g, "")
    ),
}

export async function search_subjects(base_dn: Dn, attrs: string[], filter: string, dn2opts: DnsOpts, sizeLimit: Option<number>): Promise<Subjects> {
    const entries = await ldp.searchRaw(base_dn, filter, attrs, { sizeLimit });
    return _.fromPairs(entries.map(entry => { 
        const sgroup_id = dn_to_sgroup_id(entry.dn);
        const options = get_delete(dn2opts, entry.dn) ?? {};
        const subjectAttrs: SubjectAttrs = { attrs: mono_attrs(entry), sgroup_id, options };
        return [ toDn(entry.dn), subjectAttrs ]
    }))
}   

async function get_subjects_from_same_branch(sscfg: SubjectSourceConfig, base_dn: Dn, rdns: string[], dn2opts: DnsOpts, search_token: Option<string>) {
    const rdns_filter = ldap_filter.or(rdns.map(ldap_filter.rdn));
    const filter = search_token ?
        ldap_filter.and2(rdns_filter, hSubjectSourceConfig.search_filter_(sscfg, search_token)) :
        rdns_filter
    return await search_subjects(base_dn, sscfg.display_attrs, filter, dn2opts, undefined)
}

export const get_subjects_from_urls = async (urls: string[]) => (
    await get_subjects_(urls_to_dns(urls))
)

const fromPairsGrouped = <K extends string, V>(l: [K,V][]): MyMap<K, V[]> => (
    hMyMap.mapValues(
        _.groupBy(l, e => e[0]),
        l => l.map(e => e[1]))
)

export async function get_subjects_(dn2opts: DnsOpts) : Promise<Subjects> {
    const dns = hMyMap.keys(dn2opts);

    return await get_subjects(dns, dn2opts, undefined, undefined)
}

export async function get_subjects(dns: Dn[], dn2opts: DnsOpts, search_token: Option<string>, sizelimit: Option<number>) : Promise<Subjects> {
    const parent_dn_to_rdns = fromPairsGrouped(_.compact(dns.map(dn => (
        dn_to_rdn_and_parent_dn(dn)?.oMap(([rdn, parent_dn]) => [parent_dn, rdn])
    ))))

    const r = {};

    await hMyMap.eachAsync(parent_dn_to_rdns, async (rdns, parent_dn) => {
        const sscfg = dn_to_subject_source_cfg(parent_dn)
        if (sscfg) {
            let count = 0;
            for (const rdns_ of _.chunk(rdns, 10)) {
                const subjects = await get_subjects_from_same_branch(sscfg, parent_dn, rdns_, dn2opts, search_token);
                count += _.size(subjects);
                Object.assign(r, subjects)
                if (sizelimit) {
                    if (count >= sizelimit) break;
                }
            }
        }
    })

    return r
}
