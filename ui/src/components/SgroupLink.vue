<script lang="ts">
import { computed } from 'vue';
import { SubjectAttrs } from '@/my_types';
</script>

<script setup lang="ts">
import { RouterLink } from 'vue-router'

const props = defineProps<{
  id?: string,
  attrs: SubjectAttrs
}>()

let id = computed(() => props.id || props.attrs.sgroup_id)
</script>

<template>
    <span :title="attrs.description" v-if="('right' in attrs) && !attrs.right">{{attrs.ou}}</span>
    <RouterLink :to="{ path: '/sgroup', query: { id } }" :title="attrs.description" v-else>{{attrs.ou}}</RouterLink>
 </template>