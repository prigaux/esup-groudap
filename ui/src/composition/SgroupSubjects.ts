import { size } from 'lodash'
import { computed, reactive, Ref, ref } from 'vue'
import { asyncComputed } from '@vueuse/core'
import { ref_watching, throttled_ref } from '@/vue_helpers';
import { forEach, some } from '@/helpers';
import { LdapConfigOut, Mright, SgroupAndMoreOut_, SubjectsAndCount_with_more, SubjectsOrNull, Subjects_with_more } from '@/my_types';
import * as api from '@/api'


// call API + add flag "indirect" if indirect + add "sscfg_dn"
async function group_flattened_mright(id: string, mright: Mright, search_token: string, directs: SubjectsOrNull) {
    const r: SubjectsAndCount_with_more = await api.group_flattened_mright({ id, mright, sizelimit: 100, search_token });

    forEach(r.subjects, (subject, dn) => {
        if (!subject) return
        subject.indirect = !(dn in directs);
    });

    r.subjects = await api.add_sscfg_dns_and_sort(r.subjects);

    return r;
}

export const flat_mrights_show_search = (sgroup: Ref<SgroupAndMoreOut_>, mright: Mright, default_show: () => boolean, directs: () => SubjectsOrNull) => {
    let show = ref_watching({ watch: () => sgroup.value.id, value: default_show })
    let searching = ref(false)
    let search_token = throttled_ref('')
    let results = asyncComputed(async () => {
        if (!show.value || sgroup.value.stem) return;
        const search_token_ = search_token.throttled || ''
        //if (search_token_.length < 3) return;
        return await group_flattened_mright(sgroup.value.id, mright, search_token_, directs());
    }, undefined, searching)
    return { show, searching, search_token, results }
}

export type Mrights_flat_or_not = {
    flat: {
        show: boolean,
        searching: boolean,
        search_token: { real: string, throttled: string },
    },
    results: SubjectsAndCount_with_more | undefined,
    details: { 
        real_count: number,
        limited: boolean,
        may_have_indirects: boolean
    } | undefined
}

export const mrights_flat_or_not = (ldapCfg: LdapConfigOut, sgroup: Ref<SgroupAndMoreOut_>, mright: Mright, default_show_flat: () => boolean, directs: () => SubjectsOrNull) : Mrights_flat_or_not => {
    let { results: flat_results, ...flat } = flat_mrights_show_search(sgroup, mright, default_show_flat, directs)
    let results = computed(() => {
        if (flat.show.value) {
            return flat_results.value
        } else {
            const subjects = directs() as Subjects_with_more
            return subjects ? { count: size(subjects), subjects } : undefined
        }
    })
    let details = computed(() => {
        if (!results.value) return;
        const real_count = size(results.value.subjects);
        return {
            real_count,
            limited: results.value.count !== real_count,
            may_have_indirects: some(results.value.subjects, (attrs, _) => attrs?.sscfg_dn === ldapCfg.groups_dn)
        }
    })
    return reactive({ flat, results, details })
}
