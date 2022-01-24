<script lang="ts">
import { Ref, ref } from 'vue'
import { SgroupsWithAttrs } from '@/my_types';
import * as api from '@/api'
</script>

<script setup lang="ts">
import SgroupLink from '@/components/SgroupLink.vue';
import MyIcon from '@/components/MyIcon.vue';

let mygroups = ref(undefined as SgroupsWithAttrs | undefined)
api.mygroups().then(mygroups_ => mygroups.value = mygroups_)

let search_token = ref('')
let search_results = ref(undefined as SgroupsWithAttrs | undefined)
const search = async () => {
    search_results.value = await api.search_sgroups({ sizelimit: 10, search_token: search_token.value, right: "updater" })
}
</script>

<template>
<fieldset v-if="mygroups">
    <legend><h3>Mes groupes</h3></legend>
    <ul>
        <li v-for="(attrs, id) in mygroups">
            <MyIcon name="users" class="on-the-left" />
            <SgroupLink :attrs="attrs" :id="id" />
        </li>
    </ul>
</fieldset>
<fieldset>
    <legend><h3>Recherche</h3></legend>
    <form @submit.prevent="search">
        <input v-model="search_token">
    </form>
    <div v-if="search_results">            
        <h4>Résultats</h4>
        <ul>
            <li v-for="(attrs, id) in search_results">
                <MyIcon :name="id.endsWith('.') ? 'folder' : 'users'" class="on-the-left" />
                <SgroupLink :attrs="attrs" :id="id" />
            </li>
        </ul>
    </div>
</fieldset>
</template>
