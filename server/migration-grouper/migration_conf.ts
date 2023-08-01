import { Dictionary } from "lodash";
import { is } from "../helpers";
import { MyMap, RemoteSqlConfig } from "../my_types";
import { Periodicity } from "../periodicity";

export default {
    grouper_sql_config: is<RemoteSqlConfig>({
        driver: 'mysql',
        host: '127.0.0.1',
        port: 3307,
        user: 'grouper',
        password: 'xxx',
        db_name: 'grouper',
    }),
    
    wheel_group: 'etc:sysadmingroup',
    GrouperAll_group: 'applications.grouper.updaters',
    main_ldap_remote_cfg_name: 'main_ldap',

    remap_periodicities: is<MyMap<Periodicity, Periodicity>>({
        "toutes les 10 minutes": "toutes les 5 minutes",
        "tous les jours à 6h10": "tous les jours à 6h00",
    }),

    // grouper utilise un namespace différent pour les accès LDAP et les accès base de données
    // par défaut le script de migration va utiliser le premier nom court disponible, puis utiliser un nom long avec le type d'accès comme préfixe
    // Il est ici possible de forcer des noms plutôt que de laisser le script choisir
    remap_remote_cfg_name: is<Dictionary<Dictionary<string>>>({
        ldap: { apogee: 'ldap_apogee' },
        db: { apogee: 'apogee' },
    }),

    default_periodicity_if_remote_config_is_unused: is<Periodicity>('jamais'),
}
