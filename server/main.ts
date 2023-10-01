import express from 'express';
import path from 'path';
import bodyParser from 'body-parser'

import * as express_helpers from './express_helpers'
import conf from './conf';
import api_routes from './api_routes'
import * as openapi from './openapi'

const staticFilesOptions = { maxAge: process.env.NODE_ENV === 'production' ? 60 * 60 * 1000 : 0 };

const rel_ui_dist_dir = (__filename.endsWith('/dist/main.js') ? '../' : '') + '../ui/dist';
const ui_dist_dir = path.join(__dirname, rel_ui_dist_dir)

const index_html = (_req: express.Request, res: express.Response): void => {
    res.sendFile(path.join(ui_dist_dir, "index.html"), err => {
        if (err) console.error(err)
    })
};

//thread::spawn(move || cron::the_loop(config, all_caches));

const app = express();

if (conf.trust_proxy) app.set('trust proxy', conf.trust_proxy)
app.use(express_helpers.session_store());
openapi.expressJS(app)

app.use("/api", 
    bodyParser.urlencoded(), // for CAS back-channel LogoutRequest
    bodyParser.json({type: '*/*'}), // do not bother checking, everything else we will get is JSON :)
    api_routes)
app.use("/", express.static(ui_dist_dir, staticFilesOptions));
app.get(/[/](sgroup|new_sgroup|sgroup_history)$/, // keep in sync with ui/src/router/index.ts "routes" "path"
        index_html)

const port = process.env.PORT || 8080;        // set our port
app.listen(port);
console.log('Started on port', port);
