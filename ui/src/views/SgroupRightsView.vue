<script lang="ts">
import { PRecord, Right, Subjects } from '@/my_types';
import { right2text } from '@/lib';

</script>

<script setup lang="ts">
import { isEmpty } from 'lodash'
import SubjectOrGroup from '@/components/SubjectOrGroup.vue';

const emit = defineEmits<{
  (e: 'remove', nb: string, right: Right): void
}>()

defineProps<{
    can_modify: boolean,
    rights: PRecord<Right, Subjects>,
}>()

</script>

<template>
<div v-if="isEmpty(rights)"> <p></p> <i>Aucun</i> </div>
<table class="with-theads" v-else>
    <template v-for="(subjects, right) in rights">
    <thead>
        <h5>Droit "{{right2text[right]}}"</h5> 
        <!--<button @click="flat_rights[right].show = !flat_rights[right].show">{{flat_rights[right].show ? "Cacher les indirects" : "Voir les indirects"}}</button>-->
    </thead>
    <tbody>
        <tr v-for="(subject, dn) in subjects">
            <td><SubjectOrGroup :dn="dn" :subject="subject" /></td>
            <td><button v-if="can_modify" @click="emit('remove', dn, right)">Supprimer</button></td>
            <td></td>
        </tr>
    </tbody>
    </template>
</table>
</template>