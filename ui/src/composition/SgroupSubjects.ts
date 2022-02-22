import { size } from 'lodash'
import { computed, reactive, Ref, ref } from 'vue'
import { asyncComputed } from '@vueuse/core'
import { ref_watching, throttled_ref } from '@/vue_helpers';
import { forEach, objectSortBy, some } from '@/helpers';
import { LdapConfigOut, Mright, SgroupAndMoreOut_, Subjects, SubjectsAndCount_with_more, Subjects_with_more } from '@/my_types';
import * as api from '@/api'


// call API + add flag "indirect" if indirect + add "sscfg_dn"
async function group_flattened_mright(id: string, mright: Mright, search_token: string, directs: Subjects) {
    const r: SubjectsAndCount_with_more = await api.group_flattened_mright({ id, mright, sizelimit: 100, search_token });

    forEach(r.subjects, (subject, dn) => {
        subject.indirect = !(dn in directs);
    });

    await api.add_sscfg_dns_and_sort_field(r.subjects);
    r.subjects = objectSortBy(r.subjects, (subject, _) => subject.sort_field);
    forEach(r.subjects, (attrs, _) => delete attrs.sort_field)

    return r;
}

export const flat_mrights_show_search = (sgroup: Ref<SgroupAndMoreOut_>, mright: Mright, directs: () => Subjects) => {
    let show = ref_watching({ watch: () => sgroup.value?.id, value: () => !sgroup.value?.remotegroup })
    let searching = ref(false)
    let search_token = throttled_ref('')
    let results = asyncComputed(async () => {
        if (!show.value || !sgroup.value || sgroup.value.stem) return;
        console.log("WWWWW", sgroup.value?.id, sgroup.value)
        const search_token_ = search_token.throttled || ''
        //if (search_token_.length < 3) return;
        return await group_flattened_mright(sgroup.value.id, mright, search_token_, directs());
    }, undefined, searching)
    return { show, searching, search_token, results }
}

export const mrights_flat_or_not = (sscfgs: LdapConfigOut, sgroup: Ref<SgroupAndMoreOut_>, mright: Mright, directs: () => Subjects) => {
    let { results: flat_results, ...flat } = flat_mrights_show_search(sgroup, mright, directs)
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
            may_have_indirects: some(results.value.subjects, (attrs, _) => attrs.sscfg_dn === sscfgs.groups_dn) || true
        }
    })
    return reactive({ flat, results, details })
}
