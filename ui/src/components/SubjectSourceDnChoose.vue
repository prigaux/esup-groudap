<script setup lang="ts">
import { ref, watch } from 'vue';
import { LdapConfigOut } from '@/my_types';

const props = defineProps<{
  ldapCfg: LdapConfigOut,
}>();
let emit = defineEmits(['chosen'])

let search_subject_source_dn = ref('')

watch(search_subject_source_dn, val => emit('chosen', val))

</script>

<template>
    <label>
        <input type="radio" value="" v-model="search_subject_source_dn">
        {{ props.ldapCfg.subject_sources.map(e => e.name.toLocaleLowerCase()).join('/') }}
    </label>
    <label v-for="sscfg in props.ldapCfg.subject_sources">
        &nbsp;<input type="radio" :value="sscfg.dn" v-model="search_subject_source_dn"> {{sscfg.name.toLocaleLowerCase()}}
    </label>
</template>
