import { is } from "./helpers";
import { Config } from "./my_types";
import { main_ldap_connect } from "./conf";
    
export default is<Config['remotes']>({
    main_ldap: {
        periodicity: "tous les jours à 6h00",
        driver: "ldap",
        connect: main_ldap_connect,
        search_branch: "dc=nodomain",
    },

    g2t: {
        periodicity: "tous les jours",
        driver: "mysql",
        host: "apogee.univ.fr", /*port: 3306,*/ user: "user", password: "xxx",
        db_name: "g2t",
    },
    
    foo: {
        periodicity: "toutes les heures",
        driver: "mysql",
        host: "localhost", user: "groupald", password: "xxx",
        db_name: "foo",
    },
})
