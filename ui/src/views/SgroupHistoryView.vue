<script lang="ts">
import { ref } from 'vue';
import { asyncComputed } from '@vueuse/core'
import * as api from '@/api'
import * as helpers from '@/helpers'

</script>

<script setup lang="ts">

const props = defineProps<{
  id: string,
}>()

let bytes = ref(5000)

const history = asyncComputed(() => api.sgroup_logs(props.id, bytes.value))

const formatDate = (date: Date) => helpers.formatDate(date, 'dd/MM/yyyy à HH:mm')
</script>

<template>
<table>
    <tr>
       <th>Quand</th> 
       <th>Qui</th>
       <th>Action</th>
       <th>Params</th>
    </tr>
    <tr v-for="{ when, who, action, ...o } in history?.logs">
        <td>{{formatDate(when)}}</td>
        <td>{{who}}</td>
        <td>{{action}}</td>
        <td>{{o}}</td>
    </tr>
</table>
<button v-if="!history?.whole_file" @click="bytes *= 2">Voir plus</button>
</template>

