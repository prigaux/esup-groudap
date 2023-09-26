<script lang="ts">
import { asyncComputed } from '@vueuse/core';
import { map } from 'lodash';
import router from '@/router';
import { SgroupOutAndRight } from '@/my_types';
import * as api from '@/api'
</script>

<script setup lang="ts">
import SgroupLink from '@/components/SgroupLink.vue';
import MyIcon from '@/components/MyIcon.vue';
import { isEmpty } from 'lodash';
import Typeahead, { UnknownT } from '@/components/Typeahead.vue';

let mygroups = asyncComputed(api.mygroups)

let search_limit = 30
let search = async (search_token: string) => {
    let h = await api.search_sgroups({ sizelimit: search_limit + 1, search_token, right: "updater" })
    return map(h, (attrs, sgroup_id) => {
        const sgroup: SgroupOutAndRight = { sgroup_id, attrs }
        return sgroup
    })
}

const goto = (sgroup: UnknownT) => {
    router.push({ path: '/sgroup', query: { id: sgroup.sgroup_id } })
}
</script>

<template>
<h2>Accueil</h2>

<fieldset>
    <legend><h3>Recherche</h3></legend>
    <Typeahead :focus="true" @update:model-value="goto" :minChars="3" :limit="search_limit" :options="search" v-slot="{ item: sgroup }">
        <MyIcon :name="sgroup.sgroup_id.endsWith('.') ? 'folder' : 'users'" class="on-the-left" />
        <SgroupLink :sgroup="sgroup" />
    </Typeahead>
</fieldset>
<fieldset>
    <legend><h3>Mes groupes</h3></legend>
    <div v-if="!mygroups">Veuillez patentier...</div>
    <div v-else-if="isEmpty(mygroups)"> <p></p> <i>Aucun</i> </div>    
    <ul v-else>
        <li v-for="(attrs, id) in mygroups">
            <MyIcon name="users" class="on-the-left" />
            <SgroupLink :sgroup="{ attrs, right: 'updater', sgroup_id: id }" />
        </li>
    </ul>
</fieldset>
</template>

<style scoped>
ul {
    line-height: 1.5;
}
</style>