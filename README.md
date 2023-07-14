# Configuration

  * configure `server/conf.ts`
  * add `resources/schema/groupald.schema` (or `groupald.ldif`) to your LDAP server
  * manually add an admin to the root of Groupald: add `owner: uid=xxx,ou=people,...` to `ou=groups,...` (or whatever you configured in `conf.ldap.groups_dn`)

# Build and start

## Production

In production, you must 
* first build Vue.js UI
* then build & start the server code (the API)

### Build Vue.js production UI
```
cd ui && npm install && npm run build && cd ..
```

### Build and start server production code

* build once
```
cd server && npm install && npm run build
```
* start 
```
node server/dist/main.js
```

## server/API development

Build a start the server/API, restarting when a source file changes:

```
cd server && npm run start:w
```

## Vue.js UI development

First start the server/API (see above), then:

```
cd ui && npm run dev -- --open
```

NB : the requests to API are proxied to the server/API (cf `vite.config.ts`)

# API

Example of API use:

```bash
curl -s -H 'Authorization: Bearer aa' localhost:8000/api/set_test_data
```

# Divers

## Migration from grouper

See [documentation](./resources/migration-grouper/README.md).
