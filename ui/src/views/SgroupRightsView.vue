<script lang="ts">
import { PRecord, Right } from '@/my_types';
import { right2text } from '@/lib';

</script>

<script setup lang="ts">
import { isEmpty } from 'lodash'
import { Mrights_flat_or_not } from '@/composition/SgroupSubjects'
import SubjectOrGroup from '@/components/SubjectOrGroup.vue';

const emit = defineEmits<{
  (e: 'remove', nb: string, right: Right): void
}>()

defineProps<{
    can_modify: boolean,
    rights: PRecord<Right, Mrights_flat_or_not>
}>()

</script>

<template>
<div v-if="isEmpty(rights)"> <p></p> <i>Aucun</i> </div>
<table class="with-theads" v-else>
    <template v-for="(mright_flat_or_not, right) in rights">
    <thead>
        <td> <h5>Droit "{{right2text[right]}}"</h5> </td>

        <td v-if="mright_flat_or_not">
            <button class="float-right" @click="mright_flat_or_not.flat.show = !mright_flat_or_not.flat.show" 
                v-if="mright_flat_or_not.details?.may_have_indirects">{{mright_flat_or_not.flat.show ? "Cacher les indirects" : "Voir les indirects"}}</button>
        </td>
    </thead>
    <tbody>
        <tr v-for="(subject, dn) in mright_flat_or_not?.results?.subjects">
            <td><SubjectOrGroup :dn="dn" :subject="subject" /></td>
            <td>
                <i v-if="subject.indirect">Indirect</i>
                <button v-else-if="can_modify" @click="emit('remove', dn, right)">Supprimer</button>
            </td>
        </tr>
    </tbody>
    </template>
</table>
</template>

<style scoped>
</style>