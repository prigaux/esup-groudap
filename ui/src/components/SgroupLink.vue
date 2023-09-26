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
    <span v-if="
        // @ts-expect-error
        !sgroup.options && !sgroup.right
    " :title="sgroup.attrs.description">{{
        sgroup.attrs.ou || id
    }}</span>
    <RouterLink v-else :to="{ path: '/sgroup', query: { id } }" :title="sgroup.attrs.description">{{
        sgroup.attrs.ou || id
    }}</RouterLink>
 </template>