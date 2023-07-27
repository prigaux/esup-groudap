<script lang="ts">
import { computed, ref } from 'vue';
import { asyncComputed } from '@vueuse/core'
import * as api from '@/api'
import * as helpers from '@/helpers'
import { isEmpty, sortBy } from 'lodash';
import { DnsOpts, MonoAttrs, Mright, MyMod } from '@/my_types';
import { mright2noun } from '@/lib';

</script>

<script setup lang="ts">

const props = defineProps<{
  id: string,
  show_sync: boolean,
}>()

let bytes = ref(5000)

const mod2text: Record<MyMod, string> = {
    add: "+",
    delete: "−",
    replace: 'Remplacement',
}
const sgroup_attrs_to_lines = (o: MonoAttrs) => (
    Object.entries(o).map(([k,v]) => `- ${k} : ${v}`)
)
const modify_members_or_rights_to_lines = (o: DnsOpts) => (
    Object.entries(o).flatMap(([mright,o_]) => (
        Object.entries(o_).flatMap(([mod,dnsOpts]) => (
            Object.entries(dnsOpts).map(([dn, opts]) => (
                `${mod2text[mod as MyMod]} ${mright2noun[mright as Mright]} ${dn} ${isEmpty(opts) ? '' : JSON.stringify(opts)}`
            ))
        ))
    ))
)
const history = asyncComputed(() => api.sgroup_logs(props.id, bytes.value))
const history_sync = asyncComputed(() => props.show_sync ? api.sgroup_logs(props.id, bytes.value, { sync: true }) : undefined)
const logs = computed(() => (
    sortBy([ ... history.value?.logs || [], ... history_sync.value?.logs || [] ], 'when').map(({ when, who, action, new_count, ...o }) => {
        let what: string[]
        if (action === 'modify_members_or_rights' ) {
            what = modify_members_or_rights_to_lines(o as any)
        } else if (action === 'create') {
            what = ["Création", ...sgroup_attrs_to_lines(o) ]
        } else if (action === 'modify_attrs') {
            what = ["Modification", ...sgroup_attrs_to_lines(o) ]
        } else if (action === 'modify_remote_query') {
            what = isEmpty(o) ? ["Ne plus synchroniser le groupe"] : ["Modification des paramètres du groupe synchronisé", ...sgroup_attrs_to_lines(o) ]
        } else {
            const mright = mright2noun[o.mright as Mright]
            what = [
                // @ts-expect-error
                ...o.added.map(one => `+ ${mright} ${one}`),
                // @ts-expect-error
                ...o.removed.map(one => `− ${mright} ${one}`),
            ]
        }
        return { when, who, what, new_count }
    })
))

const formatDate = (date: Date) => helpers.formatDate(date, 'dd/MM/yyyy à HH:mm')

</script>

<template>
<RouterLink :to="{ query: { id, ...(show_sync ? {} : { show_sync: 'true' }) } }"><button>{{ 
    props.show_sync ? "Cacher les logs synchro" : "Afficher les logs de synchro"
}}</button></RouterLink>

<p></p>
<table>
    <tr>
       <th>Quand</th> 
       <th>Qui</th>
       <th>Action</th>
       <th></th>
    </tr>
    <tr v-for="{ when, who, what, new_count } in logs" :class="{ sync: !who }">
        <td>{{formatDate(when)}}</td>
        <td>{{who}}</td>
        <td>
            <template v-for="line of what"> {{ line }}<br></template>
        </td>
        <td><span v-if="new_count !== undefined">=> {{new_count}}</span></td>
    </tr>
</table>
<button v-if="!history?.whole_file" @click="bytes *= 2">Voir plus</button>
</template>

<style>
.sync {
    color: #00225E;
}
</style>