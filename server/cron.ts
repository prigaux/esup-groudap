import _ from "lodash";
import * as cache from './cache'
import { next_elapse } from "./periodicity";
import { Mright } from "./my_types";
import { may_update_flattened_mrights_rec } from "./api_post";
import { setTimeoutPromise, throw_ } from "./helpers";
import conf from "./conf";

export async function the_loop() {
    try {
        if (_.isEmpty(conf.remotes)) {
            console.log("nothing to synchronize (no remotes), exiting cron.");
            return
        }
        await the_loop_()
    } catch (err) {
        console.log("synchronize cron failed:", err);
    }
}

export async function the_loop_(): Promise<never> {
    console.log("starting synchronize cron");

    let remote_to_next_time: Map<string, number> = new Map()

    while (true) {
        const remote_to_sgroup_ids = await cache.get_remote_to_sgroup_ids()
        const now = Date.now();
        for (const [remote_name, remote_cfg] of Object.entries(conf.remotes)) {
            if (!remote_cfg) continue
            const next_time = remote_to_next_time.get(remote_name) || now
            if (+next_time <= +now) {
                const sgroup_ids = remote_to_sgroup_ids[remote_name]
                if (sgroup_ids) {
                    console.log("synchronizing {:?}", sgroup_ids);
                    const todo = [...sgroup_ids].map(id => ({ id, mright: 'member' as Mright }))
                    await may_update_flattened_mrights_rec({ TrustedAdmin: true }, todo)
                }
                // compute the next time it should run
                let next_time = await next_elapse(remote_cfg.periodicity)
                remote_to_next_time.set(remote_name, +next_time)
            }
        }
        let earlier_next_time = Math.min(...remote_to_next_time.values()) || throw_("internal error")
        const time_to_sleep = earlier_next_time - Date.now()
        if (time_to_sleep > 0) {
            console.log("sleeping", time_to_sleep);
            await setTimeoutPromise(time_to_sleep)
        } else {
            console.log("next remote became ready during computation of other remotes")
        }
    }
}
