<script lang="ts">
import { Ref, ref } from 'vue'
import { asyncComputed } from '@vueuse/core';
import { SgroupsWithAttrs } from '@/my_types';
import * as api from '@/api'
</script>

<script setup lang="ts">
import SgroupLink from '@/components/SgroupLink.vue';
import MyIcon from '@/components/MyIcon.vue';
import { isEmpty } from 'lodash';
import { throttled_ref } from '@/vue_helpers';

let mygroups = asyncComputed(api.mygroups)

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

let search_token = throttled_ref('')
let searching = ref(false)
let search_results = asyncComputed(async () => (
    api.search_sgroups({ sizelimit: 10, search_token: search_token.throttled, right: "updater" })
), null, searching)
</script>

<template>
<fieldset>
    <legend><h3>Recherche</h3></legend>
    <input v-model="search_token.real">
    <div v-if="search_token.real">            
        <h4>Résultats</h4>
        <div v-if="searching">...</div>
        <div v-else-if="isEmpty(search_results)"><i>Aucun</i></div>
        <ul v-else>
            <li v-for="(attrs, id) in search_results">
                <MyIcon :name="id.endsWith('.') ? 'folder' : 'users'" class="on-the-left" />
                <SgroupLink :attrs="attrs" :id="id" />
            </li>
        </ul>
    </div>
</fieldset>
<fieldset>
    <legend><h3>Mes groupes</h3></legend>
    <div v-if="!mygroups">Veuillez patentier...</div>
    <div v-else-if="isEmpty(mygroups)"> <p></p> <i>Aucun</i> </div>    
    <ul v-else>
        <li v-for="(attrs, id) in mygroups">
            <MyIcon name="users" class="on-the-left" />
            <SgroupLink :attrs="attrs" :id="id" />
        </li>
    </ul>
</fieldset>
</template>
