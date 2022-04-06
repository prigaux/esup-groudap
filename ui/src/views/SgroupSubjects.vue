<script lang="ts">
import { SubjectsAndCount_with_more } from '@/my_types';
import * as helpers from '@/helpers'
</script>

<script setup lang="ts">
import { isEmpty } from 'lodash'
import SubjectOrGroup from '@/components/SubjectOrGroup.vue';

const emit = defineEmits<{
  (e: 'remove', nb: string): void
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
}>()

const formatDate = (date: Date) => helpers.formatDate(helpers.addSeconds(date, -60), 'dd/MM/yyyy')

</script>

<template>
<div v-if="!results || !details">Veuillez patentier...</div>
<div v-else>
    <p>
        Nombre de membres : {{details.real_count}}
        <span v-if="details.limited"> / {{results.count}}</span>
    </p>

    <div v-if="flat.show && results.count > 4">
        <div v-if="details.limited && !flat.search_token.real">Affichage limité, chercher dans les membres</div>
        <div v-else>Filtrer les membres</div>
        <input class="search_token" v-model="flat.search_token.real">
    </div>
    <div v-if="flat.searching">Veuillez patentier...</div>
    <div v-else-if="isEmpty(results.subjects)"> <i>Aucun</i> </div>
    <table v-else>
        <tr v-for="(attrs, dn) in results.subjects">
            <td><SubjectOrGroup :dn="dn" :subject="attrs" /></td>
            <td>
                <i v-if="attrs.indirect">Indirect</i>
                <button v-else-if="can_modify" @click="emit('remove', dn)">Supprimer</button>
            </td>
            <td v-if="attrs.enddate">
                jusqu'au {{formatDate(attrs.enddate)}}
            </td>
        </tr>
    </table>
</div>
</template>