import { defineAsyncComponent, defineComponent } from "vue";
import * as api from '@/api'
import { SubjectSourceConfig } from "@/my_types";
import MyIcon from './MyIcon.vue'

const compute_default_vue_template = (sscfg: SubjectSourceConfig) => (
    sscfg.display_attrs.map((attr, i) =>
        `<span ${i ? "v-else-if" : "v-if"}="attrs.${attr}">{{attrs.${attr}}}</span>`
    ).join('')
)

export default defineAsyncComponent(async () => {
    const sscfgs = (await api.config_ldap()).subject_sources

    const template = sscfgs.map(sscfg => {
        const sub_tmpl = sscfg.vue_template || compute_default_vue_template(sscfg)
        return `<span v-if="(ssdn || subject.sscfg_dn) === '${sscfg.dn}'">${sub_tmpl}</span>`
    }).join("\n")

    return defineComponent({
        props: {
            dn: String,
            subject: {},
            ssdn: String,
        },
        components: { MyIcon },
        computed: {
            attrs() {
                return (this.subject as any).attrs
            },
        },
        methods: {
            first_line(s: string) {
                return s.replace(/\n.*/s, '')
            },
        },
        template,
    });
});