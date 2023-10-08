import express from 'express';
import swaggerUi from 'swagger-ui-express';
import { OpenAPIV3 } from "openapi-types";
import { MyMap, Right, SgroupAndMoreOut, SgroupLogs, SubjectsAndCount, SubjectsOrNull, hMright, toDn } from "./my_types";

const examples = {
    group: {
        attrs: { description: "Collaboration Admins Foo\nGroupe Ticket machin", ou: "Collab Foo" },
        group: { "direct_members": { [toDn("uid=prigaux,ou=people,dc=nodomain")]: { attrs: { "displayName": "Pascal Rigaux", "uid": "prigaux" }, "options": {} } } },
        parents: [ 
            { attrs: { description: "Groups. Droits sur l'arborescence entière", ou: "Racine" }, right: "admin", sgroup_id: "" },
            { attrs: { description: "Collaboration", ou: "Collaboration" }, right: "admin", sgroup_id: "collab." } 
        ],
        right: "admin"
    } satisfies SgroupAndMoreOut,

    stem: {
        attrs: { description: "Collaboration", ou: "Collaboration" },
        parents: [ { attrs: { description: "Groups. Droits sur l'arborescence entière", ou: "Racine" }, right: "admin", sgroup_id: "" } ],
        right: "admin",
        stem: { "children": { "collab.DSIUN": { description: "Collaboration DSIUN", ou: "Collaboration DSIUN" }, "collab.foo": { description: "Collaboration Admins Foo\nGroupe Ticket machin", ou: "Collab Foo" } } }
    } satisfies SgroupAndMoreOut,

    direct_rights: {
        admin: { [toDn("cn=collab.DSIUN,ou=groups,dc=nodomain")]: { attrs: { "cn": "collab.DSIUN", description: "Collaboration DSIUN", ou: "Collaboration DSIUN" }, "options": {}, sgroup_id: "collab.DSIUN" } }
    } satisfies MyMap<Right, SubjectsOrNull>,

    logs: {
        "last_log_date": new Date("2023-09-28T21:13:47.355Z"),
        "logs": [
          { "action": "create", "description": "Collaboration Admins Foo\nGroupe Ticket machin", "ou": "Collab Foo", "when": new Date("2023-09-28T21:13:47.350Z"), "who": "prigaux" },
          { "action": "modify_members_or_rights", "admin": { "add": { "cn=collab.DSIUN,ou=groups,dc=nodomain": {} } }, "when": new Date("2023-09-28T21:13:47.358Z"), "who": "prigaux" }
        ],
        "whole_file": true
    } satisfies SgroupLogs,

    flattened_mright: {
        "count":2,
        "subjects":{ 
            [toDn("uid=prigaux,ou=people,dc=nodomain")]: {"attrs":{"uid":"prigaux","displayName":"Pascal Rigaux"},"options":{}},
            [toDn("uid=aanli,ou=people,dc=nodomain")]: {"attrs":{"uid":"aanli","displayName":"Aymar Anli","mail":"Aymar.Anli@univ-paris1.fr"},"options":{}}
        },
    } satisfies SubjectsAndCount,
}

const responses = {
    ok: {
        "200": {
            description: "OK",
            content: {
                "application/json": {
                    schema: { 
                        type: "object",
                        properties: { "ok": { "enum": [true] } }
                    }
                }
            }
        },
    } satisfies OpenAPIV3.ResponsesObject,

    err_already_exists: {
        "500": {
            description: "Error",
            content: {
              "application/json": {
                schema: { 
                    type: "object",
                    properties: { "error": { enum: [true] }, msg: { type: "string", example: "sgroup already exists" } }
                }
              }
            }
        }
    } satisfies OpenAPIV3.ResponsesObject,

    err_does_not_exist: {
        "500": {
            description: "Error",
            content: {
              "application/json": {
                schema: { 
                    type: "object",
                    properties: { "error": { enum: [true] }, msg: { type: "string", example: "sgroup does not exist" } }
                }
              }
            }
        }
    } satisfies OpenAPIV3.ResponsesObject,
}

const parameters = {
    id: {
        name: "id", description: "group/stem identifier",
        in: "query", required: true, schema: { type: "string" }
    } satisfies OpenAPIV3.ParameterObject,

    sync: {
        name: "sync", description: "include flattened mrights synchronization ?",
        in: "query", schema: { type: "boolean" }
    } satisfies OpenAPIV3.ParameterObject,

    strict: {
        name: "strict", description: "by default, actions already done are ignored. If set, actions are executed as is",
        in: "query", schema: { type: "boolean" }
    } satisfies OpenAPIV3.ParameterObject,

    msg: {
        name: "msg", description: "optional message explaining why the user did this action",
        in: "query", schema: { type: "string" }
    } satisfies OpenAPIV3.ParameterObject,

    mright: {
        name: "mright", description: "group/stem identifier",
        in: "query", required: true, schema: { enum: hMright.list() }
    } satisfies OpenAPIV3.ParameterObject,

    sizelimit: {
        name: "sizelimit", description: "is applied for each subject source, so the max number of results is sizeLimit * nb_subject_sources",
        in: "query", schema: { type: "integer" }
    } satisfies OpenAPIV3.ParameterObject,

    search_token: {
        name: "search_token", description: "return subjects matching this string",
        in: "query", schema: { type: "string" }
    } satisfies OpenAPIV3.ParameterObject,

    bytes: {
        name: "bytes", description: "maximum number of bytes to read",
        in: "query", schema: { type: "integer" }
    } satisfies OpenAPIV3.ParameterObject,
}

const openAPIDocument: OpenAPIV3.Document = {
  openapi: "3.0.0",
  info: { title: "Groupald API", version: "1.0" },
  security: [ { "BearerAuth": [] } ],

  paths: {
    "/api/get": { "get": {
        summary: "Get various group/stem information (tailored for Vue.js UI)",
        operationId: "get",
        tags: [ "basic" ],
        parameters: [ parameters.id ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: {} },
                examples: { 
                  "group" : { value: examples.group },
                  "stem": { value: examples.stem },
                }
              }
            }
          }
        }
    } },

    "/api/exists": { "get": {
        summary: "Does the group/stem exist?",
        operationId: "exists",
        tags: [ "basic" ],
        parameters: [ parameters.id ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "boolean" },
              }
            }
          }
        }
    } },

    "/api/direct_rights": { "get": {
        summary: "Get the direct privileges on the group/stem",
        operationId: "direct_rights",
        tags: [ "members|rights" ],
        parameters: [ parameters.id ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: {} },
                example: examples.direct_rights
              }
            }
          }
        }
    } },

    "/api/flattened_mright": { "get": {
        summary: "Get/search the flattened subjects who have the requested mright on this group/stem",
        operationId: "flattened_mright",
        tags: [ "members|rights", "remote" ],
        parameters: [ parameters.id, parameters.mright, parameters.search_token, parameters.sizelimit ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: {} },
                example: examples.flattened_mright
              }
            }
          }
        }
    } },

    "/api/logs": { "get": {
        summary: "Read group/stem log entries",
        operationId: "logs",
        tags: [ "logs" ],
        parameters: [ parameters.id, parameters.bytes, parameters.sync ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                schema: { type: "object", additionalProperties: {} },
                example: examples.logs
              }
            }
          }
        }
    } },    

    "/api/create": { "post": {
        summary: "Create group/stem",
        operationId: "create",
        tags: [ "basic" ],
        parameters: [ parameters.id, parameters.strict ],
        requestBody: {
            required: true,
            content: { "application/json": { 
                schema: { type: "object", additionalProperties: { type: "string" } },
                example: { description:"Collaboration Admins Foo", "ou":"Collab Foo" }
            } }
        },
        responses: { ...responses.ok, ...responses.err_already_exists },
    } },

    "/api/delete": { "post": {
        summary: "Delete group/stem",
        operationId: "delete",
        tags: [ "basic" ],
        parameters: [ parameters.id ],
        responses: { ...responses.ok, ...responses.err_does_not_exist },
    } },

    "/api/modify_attrs": { "post": {
        summary: "Get group/stem direct rights",
        operationId: "modify_attrs",
        tags: [ "basic" ],
        parameters: [ parameters.id ],
        requestBody: {
            required: true,
            content: { "application/json": { 
                schema: { type: "object", additionalProperties: { type: "string" } },
                example: { description:"Collaboration Admins Foo", "ou":"Collab Foo" }
            } }
        },
        responses: { ...responses.ok, ...responses.err_does_not_exist },
    } },

    "/api/modify_members_or_rights": { "post": {
        summary: "Modify the group/stem members or rights + synchronize indirect",
        operationId: "modify_members_or_rights",
        tags: [ "members|rights" ],
        parameters: [ parameters.id, parameters.strict, parameters.msg ],
        requestBody: {
            required: true,
            content: { "application/json": { 
                schema: { type: "object", additionalProperties: { type: "string" } },
                examples: { 
                    "add": { value: { "member": { "add": { "uid=prigaux,ou=people,dc=nodomain": {} } } } },
                    "delete": { value: { "member": { "delete": { "uid=prigaux,ou=people,dc=nodomain": {} } } } },
                }
            } }
        },
        responses: { ...responses.ok, ...responses.err_does_not_exist },
    } },

    "/api/modify_remote_query": { "post": {
        summary: "Set or modify the LDAP/SQL query for a group + synchronize the members",
        operationId: "modify_remote_query",
        tags: [ "remote" ],
        parameters: [ parameters.id, parameters.msg ],
        requestBody: {
            required: true,
            content: { "application/json": { 
                schema: { type: "object", additionalProperties: { type: "string" } },
                examples: { 
                    "sql": { value: { "remote_cfg_name": "apogee", "select_query": "select uid from users", "to_subject_source": { "ssdn": "ou=people,dc=univ-paris1,dc=fr" } } },
                    "ldap": { value: { "remote_cfg_name": "main_ldap", "filter": "(supannEntiteAffectation=DGHA)" } },
                }
            } }
        },
        responses: { ...responses.ok, ...responses.err_does_not_exist },
    } },

    "/api/sync": { "post": {
        summary: "Synchronize group indirect rights/members or stem indirect rights",
        operationId: "sync",
        tags: [ "remote", "members|rights" ],
        parameters: [ parameters.id, { ...parameters.mright, required: false } ],
        responses: {
          "200": {
            description: "OK",
            content: {
              "application/json": {
                examples: {
                    "unchanged": { value: { unchanged: true } },
                    "changed": { value: { new_count: 123, added: ["uid=prigaux,ou=people,dc=nodomain"], removed: [] } }
                },
              }
            }
          }
        }
    } }

  },

  components: {
    securitySchemes: {
      "BearerAuth": { type: "http", scheme: "bearer" }
    }
  }
}

export async function expressJS(app: express.Express) {
    // no clear auto-discovery mechanism. At least this is enough for Restish
    app.get('/openapi.json', (_req, res) => res.send(openAPIDocument))
    
    // the "standard" location for SwaggerUI html doc
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(openAPIDocument, { swaggerOptions: { 
        tryItOutEnabled: true,
        requestSnippetsEnabled: true,

        // NB: this will be sent stringified to the browser
        plugins: [ { fn: { requestSnippetGenerator_curl_bash: (request: any) => { 
            let cmd = ["curl", "-s"]

            const auth = request.get("headers")?.get('Authorization')
            if (auth) { 
                cmd.push("-H", `Authorization: ${auth}`)
            }
            cmd.push(request.get("url"))

            if (request.get("method") === "POST") {
                const is_json = request.get("headers")?.get('Content-Type') === 'application/json'
                cmd.push(is_json ? "--json" : "-d", request.get("body") || '')
            }

            return cmd.map((str) => (
                !str || str.match(/[^\w\-]/) ? "'" + str.replace(/'/g, "'\\''") + "'" : str
            )).join(" ")
        } } } ],

    } }));
}
