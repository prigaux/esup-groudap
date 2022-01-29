<script lang="ts">
import { computed } from 'vue';
import { SgroupOutAndRight, SubjectAttrs } from '@/my_types';
</script>

<script setup lang="ts">
import { RouterLink } from 'vue-router'

const props = defineProps<{
  id?: string,
  sgroup: SubjectAttrs | SgroupOutAndRight
}>()

let id = computed(() => props.id || props.sgroup.sgroup_id)
</script>

<template>
    <span :title="sgroup.attrs.description" v-if="('right' in sgroup) && !sgroup.right">{{sgroup.attrs.ou}}</span>
    <RouterLink :to="{ path: '/sgroup', query: { id } }" :title="sgroup.attrs.description" v-else>{{sgroup.attrs.ou}}</RouterLink>
 </template>