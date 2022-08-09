import { Config } from "./my_types";

const conf: Config = {
    trusted_auth_bearer: "aa",
    log_dir: "/tmp",
    cas: {
        prefix_url: "https://cas-test.univ-paris1.fr/cas",
    },
    //trust_proxy: 'loopback', // http://expressjs.com/en/guide/behind-proxies.html

    session_store: {
        options: { 
            secret: 'xx', // NB: express-session sends session ID signed with this secret => something harder to randomly guess...
        },
        file_store: { path: "/tmp" },
    },
    
    ldap: {
        connect: {
            uri: ["ldap://localhost:2389"],
            dn: "cn=Manager,dc=nodomain",
            password: "secret",
        },
        base_dn: "dc=nodomain",
        groups_dn: "ou=groups,dc=nodomain",
        group_object_classes: [ "groupald", "groupOfNames", "supannGroupe" ],
        stem_object_classes: [ "groupald", "organizationalRole" ], // root stem will have groupald & organizationalUnit,
        sgroup_filter: "(objectClass=groupald)",
        stem: {
            filter: "(&(objectClass=groupald)(!(objectClass=groupOfNames)))",
            //default_separator: ".",
            //TODO cn: { label: "ID du groupe", description: "l'ID est l'identifiant unique de ce groupe au sein du dossier. Il doit être simple et court, et peut avoir des restrictions de caractères. Une fois créé, il est déconseillé de le modifier." },
            
        },
        sgroup_attrs: {
            description: {
                label: "Description",
                description: "La description contient des informations sur le groupe, par exemple : ce que le groupe représente, pourquoi il a été créé...",                
            },
            ou: {
                label: "Nom du groupe",
                description: "Le nom du groupe, il peut être modifié ultérieurement.",                
            },
            "labeledURI;x-assistance": {
                label: "URL vers le ticket d'assitance associé",
                input_attrs: { placeholder: "url" },
                vue_template: `<a target=blank :href='value'>{{value.replace(/.*ticket[.]form[.]php[?]id=/, 'GLPI #')}}</a>`,
            },
            "groupaldOptions;x-comptex-externe-profilename": {
                label: "Profils comptex/externe autorisés",
                only_in_stem: "collab.",
                input_attrs: { placeholder: "exemple : {COMPTEX:EXTERNE}auditor {COMPTEX:EXTERNE}orator" },
                description: "Identifiants de profils, séparées par des espaces",
            },
            // if no "default", "max" est pris
            "groupaldOptions;x-member-ttl-max": {
                label: "Durée d'appartenance max",
                description: "Valeur en jours",
                vue_template: "{{value}} jours",
                input_attrs: { inputmode: "number" },
            },
            "groupaldOptions;x-member-ttl-default": {
                label: "Durée d'appartenance par défaut",
                description: "Valeur en jours",
                vue_template: "{{value}} jours",
                input_attrs: { inputmode: "number" },
            },
        },
        groups_flattened_attr: {
            member: "member",
            reader: "supannGroupeLecteurDN",
            updater: "supannGroupeAdminDN",
            admin: "owner",
        },
        subject_sources: [
            // NB: order of "default.ldap.subject_sources" impacts UI subjects ordering,
            {
                dn: "ou=admin,dc=nodomain",
                name: "Applications",
                search_filter: "(|(cn=%TERM%)(displayName=*%TERM%*))",
                display_attrs: ["displayName", "description", "cn"],
                id_attrs: ["cn"],
                vue_template: `<MyIcon name="cogs" /> <span :title='attrs.description'>{{attrs.cn}} - {{attrs.displayName || first_line(attrs.description)}}</span>`,
                // default template is "display first non empty attr value"
            },
            {
                dn: "ou=groups,dc=nodomain",
                name: "Groupes",
                search_filter: "(&(|(cn=*%TERM%*)(ou=*%TERM%*)(description=*%TERM%*)) (objectClass=groupOfNames) )",
                display_attrs: ["ou", "description", "cn"],
                id_attrs: ["cn"],
                // default template is "display first non empty attr value"
            },
            {
                dn: "ou=people,dc=nodomain",
                name: "Personnes",
                search_filter: "(& (|(uid=%TERM%)(cn=*%TERM%*)(displayName=*%TERM%*)) )", // (!(accountStatus=disabled))
                display_attrs: ["displayName", "mail", "eduPersonPrimaryAffiliation", "uid" ],
                id_attrs: ["mail", "uid", "eduPersonPrincipalName"],
                vue_template: `<MyIcon name="user" /> {{ 
                    ({ teacher: 'enseignant', student: 'étudiant', staff: 'biatss', researcher: 'chercheur', emeritus: 'professeur émérite', affiliate: 'invité', alum: 'ancien étudiant', retired: 'retraité', 'registered-reader': 'Lecteur externe', 'library-walk-in': 'visiteur bibliothèque' }[attrs.eduPersonPrimaryAffiliation] || 'autre')
                  }} - <a target='_blank' :href='"https://annuaire.univ-paris1.fr/ent/" + attrs.mail'>{{attrs.displayName}}</a>`
            },                
        ],
    },
    remotes: {
        g2t: {
            periodicity: "12:00",
            driver: "mysql",
            host: "apogee.univ.fr",
            //port: 3306,
            user: "user",
            password: "xxx",
            db_name: "g2t",
        },
        
        foo: {
            periodicity: "hourly",
            driver: "mysql",
            host: "localhost",
            user: "groupald",
            password: "xxx",
            db_name: "foo",
        },
    },
};
export default conf
