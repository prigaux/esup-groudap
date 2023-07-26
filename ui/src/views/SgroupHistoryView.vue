<script lang="ts">
import { computed, ref } from 'vue';
import { asyncComputed } from '@vueuse/core'
import * as api from '@/api'
import * as helpers from '@/helpers'
import { isEmpty } from 'lodash';
import { DnsOpts, MonoAttrs, Mright, MyMod } from '@/my_types';

</script>

<script setup lang="ts">

const props = defineProps<{
  id: string,
}>()

let bytes = ref(5000)

const mod2text: Record<MyMod, string> = {
    add: "Ajout",
    delete: "Suppression",
    replace: 'Remplacement',
}
const mright2text: Record<Mright, string> = {
    member: "membre",
    reader: "lecteur",
    updater: "modifieur",
    admin: "admin",
}
const sgroup_attrs_to_lines = (o: MonoAttrs) => (
    Object.entries(o).map(([k,v]) => `- ${k} : ${v}`)
)
const modify_members_or_rights_to_lines = (o: DnsOpts) => (
    Object.entries(o).flatMap(([mright,o_]) => (
        Object.entries(o_).flatMap(([mod,dnsOpts]) => (
            Object.entries(dnsOpts).map(([dn, opts]) => (
                `${mod2text[mod as MyMod]} ${mright2text[mright as Mright]} : ${dn} ${isEmpty(opts) ? '' : JSON.stringify(opts)}`
            ))
        ))
    ))
)
const history = asyncComputed(() => api.sgroup_logs(props.id, bytes.value))
const logs = computed(() => (
    (history.value?.logs || []).map(({ when, who, action, ...o }) => {
        let what: string[]
        if (action === 'modify_members_or_rights' ) {
            what = modify_members_or_rights_to_lines(o as any)
        } else if (action === 'create') {
            what = ["Création", ...sgroup_attrs_to_lines(o) ]
        } else if (action === 'modify_attrs') {
            what = ["Modification", ...sgroup_attrs_to_lines(o) ]
        } else {
            throw "TODO"
        }
        return { when, who, what }
    })
))

const formatDate = (date: Date) => helpers.formatDate(date, 'dd/MM/yyyy à HH:mm')
</script>

<template>
<table>
    <tr>
       <th>Quand</th> 
       <th>Qui</th>
       <th>Action</th>
    </tr>
    <tr v-for="{ when, who, what } in logs">
        <td>{{formatDate(when)}}</td>
        <td>{{who}}</td>
        <td>
            <template v-for="line of what"> {{ line }}<br></template>
        </td>
    </tr>
</table>
<button v-if="!history?.whole_file" @click="bytes *= 2">Voir plus</button>
</template>

