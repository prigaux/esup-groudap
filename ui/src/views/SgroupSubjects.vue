<script lang="ts">
import { isEmpty, size } from 'lodash'
import { computed, reactive, Ref, ref } from 'vue'
import { asyncComputed } from '@vueuse/core'
import { throttled_ref } from '@/vue_helpers';
import { forEach, some } from '@/helpers';
import { LdapConfigOut, Mright, Subjects, SubjectsAndCount_with_more, Subjects_with_more } from '@/my_types';
import * as api from '@/api'

// call API + add flag "indirect" if indirect + add "sscfg_dn"
async function group_flattened_mright(id: string, mright: Mright, search_token: string, directs: Subjects) {
    const r: SubjectsAndCount_with_more = await api.group_flattened_mright({ id, mright, sizelimit: 100, search_token });
    forEach(r.subjects, (attrs, dn) => {
        attrs.indirect = !(dn in directs);
    });
    await api.add_sscfg_dns(r.subjects);
    return r;
}

export const flat_mrights_show_search = (props: Readonly<{ id: string; }>, mright: Mright, directs: () => Subjects) => {
    let show = ref(false)
    let searching = ref(false)
    let search_token = throttled_ref('')
    let results = asyncComputed(async () => {
        if (!show.value) return;
        const search_token_ = search_token.throttled || ''
        //if (search_token_.length < 3) return;
        return await group_flattened_mright(props.id, mright, search_token_, directs());
    }, undefined, searching)
    return { show, searching, search_token, results }
}

export const mrights_flat_or_not = (sscfgs: Ref<LdapConfigOut>, props: Readonly<{ id: string; }>, mright: Mright, directs: () => Subjects) => {
    let { results: flat_results, ...flat } = flat_mrights_show_search(props, mright, directs)
    let results = computed(() => {
        if (flat.show.value) {
            return flat_results.value
        } else {
            const subjects = directs() as Subjects_with_more
            return subjects ? { count: size(subjects), subjects } : undefined
        }
    })
    let details = computed(() => {
        if (!results.value || !sscfgs.value) return;
        const real_count = size(results.value.subjects);
        return {
            real_count,
            limited: results.value.count !== real_count,
            may_have_indirects: some(results.value.subjects, (attrs, _) => attrs.sscfg_dn === sscfgs.value.groups_dn)
        }
    })
    return reactive({ flat, results, details })
}

</script>

<script setup lang="ts">
import SubjectOrGroup from '@/components/SubjectOrGroup.vue';
const emit = defineEmits<{
  (e: 'remove', nb: string): void
}>()
defineProps<{
    can_modify_member: boolean,
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
}>()

</script>

<template>
<div v-if="flat.searching">Veuillez patentier...</div>
<div v-else>
    <p>Nombre : {{details?.real_count}}
        <span v-if="details?.limited"> / {{results?.count}}</span>
    </p>

        <div v-if="flat.show">
            <div v-if="details?.limited && !flat.search_token.real">Affichage limité, chercher dans les membres</div>
            <div v-else>Filtrer les membres</div>
            <input class="search_token" v-model="flat.search_token.real">
        </div>
    <div v-if="isEmpty(results?.subjects)"> <i>Aucun</i> </div>
    <table>
        <tr v-for="(attrs, dn) in results?.subjects">
            <td><SubjectOrGroup :dn="dn" :subject="attrs" /></td>
            <td>
                <i v-if="attrs.indirect">Indirect</i>
                <button v-else-if="can_modify_member" @click="emit('remove', dn)">Supprimer</button>
            </td>
        </tr>
    </table>
</div>
</template>