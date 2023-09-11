<script lang="ts">
import { DirectOptions, SubjectsAndCount_with_more } from '@/my_types';
import * as helpers from '@/helpers'
</script>

<script setup lang="ts">
import { isEmpty } from 'lodash'
import SubjectOrGroup from '@/components/SubjectOrGroup.vue';

const emit = defineEmits<{
  (e: 'remove', dn: string, attrs?: DirectOptions): void
}>()

defineProps<{
    can_modify: boolean,
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
    last_sync_date?: Date
}>()

const formatDate = (date: Date | string) => helpers.formatDate(helpers.addSeconds(date, -60), 'dd/MM/yyyy')
const formatDateTime = (date: Date) => helpers.formatDate(date, 'dd/MM/yyyy à HH:mm')


</script>

<template>
<div v-if="!results || !details">Veuillez patentier...</div>
<div v-else>
    <p>
        Nombre de membres {{flat.show ? ' indirects' : details.may_have_indirects ? ' directs' : ''}} : {{results.count}}
        <i v-if="last_sync_date">(dernière synchro le {{ formatDateTime(last_sync_date) }})</i>
    </p>

    <div v-if="flat.show && results.count > 4">
        <div v-if="details.limited && !flat.search_token.real">Trop de résultats. Affichage limité à {{details.real_count}} membres</div>
        <div v-else-if="flat.search_token.real">{{details.real_count}} {{details.real_count > 1 ? 'membres correspondent' : 'membre correspond'}}</div>
        Filtre
        <input placeholder="nom du membre" class="search_token" v-model="flat.search_token.real">
    </div>
    <div v-if="flat.searching">Veuillez patentier...</div>
    <div v-else-if="isEmpty(results.subjects)"> <i>Aucun</i> </div>
    <table v-else>
        <tr v-for="(attrs, dn) in results.subjects">
            <td><SubjectOrGroup :dn="dn" :subject="attrs" /></td>
            <td>
                <i v-if="attrs?.indirect">Indirect</i>
                <button v-else-if="can_modify" @click="emit('remove', dn, attrs?.options)">Supprimer</button>
            </td>
            <td v-if="attrs?.options?.enddate">
                jusqu'au {{formatDate(new Date(attrs.options.enddate))}}
            </td>
        </tr>
    </table>
</div>
</template>