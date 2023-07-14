<script lang="ts">
import { ref } from 'vue'
import { asyncComputed } from '@vueuse/core'
import { MonoAttrs } from '@/my_types';
import * as api from '@/api'

</script>

<script setup lang="ts">
import SgroupLink from '@/components/SgroupLink.vue';
import router from '@/router';

const props = defineProps<{
  parent_id: string,
  is_stem?: true,
}>()

const ldapCfg = asyncComputed(api.config_ldap)

let parent = asyncComputed(async () => (
    await api.sgroup(props.parent_id)
))
let all_parents = computed(() => [
    ...parent.value.parents, 
    { sgroup_id: props.parent_id, ...parent.value },
])

let rel_id = ref('')
let attrs = ref({} as MonoAttrs)

const create = async () => {
    let id = props.parent_id + rel_id.value;
    if (props.is_stem && !id.endsWith(".")) {
        id += "."
    }
    await api.create(id, attrs.value)
    router.push({ path: '/sgroup', query: { id } })
}

</script>

<template>
<div v-if="!parent">
Veuillez patienter
</div>
<div v-else-if="parent.group">
Erreur : impossible de créer un groupe/dossier dans un groupe.
</div>
<form v-else @submit.prevent="create">
    <a href=".">Accueil</a> &gt;
    <span v-for="p in all_parents">
        <SgroupLink :sgroup="p" />
        <span> &gt; </span>
    </span>
    <h2><input autofocus v-model="attrs.ou" :placeholder="ldapCfg.sgroup_attrs.ou.label" :title="ldapCfg.sgroup_attrs.ou.description"></h2>

    <fieldset>
        <legend>
            <h4>Identifiant</h4>
        </legend>
        <input v-model="rel_id">
    </fieldset>

    <fieldset>
        <legend>
            <h4 :title="ldapCfg.sgroup_attrs.description.description">{{ldapCfg.sgroup_attrs.description.label}}</h4>
        </legend>
        <textarea class="description" v-model="attrs.description"></textarea>
    </fieldset>
    <p></p>
    <button :disabled="!rel_id || !attrs.ou">Créer le {{props.is_stem ? 'dossier' : 'groupe'}}</button>
</form>
</template>

