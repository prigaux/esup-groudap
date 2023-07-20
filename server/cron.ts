import _ from "lodash";
import * as cache from './cache'
import { Periodicity, next_elapse } from "./periodicity";
import { IdMright, may_update_flattened_mrights_rec } from "./api_post";
import { setTimeoutPromise, throw_ } from "./helpers";
import { hMyMap } from "./my_types";
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

// @ts-expect-error
const date_min = (...dates: Date[]) => Math.min(...dates)

export async function the_loop_(): Promise<never> {
    console.log("starting synchronize cron");

    let periodicity_to_next_time: Map<Periodicity, Date> = new Map()

    while (true) {
        const periodicity_to_sgroup_ids = await cache.get_periodicity_to_sgroup_ids()
        const now = Date.now();
        hMyMap.eachAsync(periodicity_to_sgroup_ids, async (sgroup_ids, periodicity) => {
            const next_time = periodicity_to_next_time.get(periodicity) || now
            if (+next_time <= +now) {
                console.log("synchronizing {:?}", sgroup_ids);
                const todo: IdMright[] = [...sgroup_ids].map(id => ({ id, mright: 'member' }))
                await may_update_flattened_mrights_rec(todo)

                // compute the next time it should run
                let next_time = next_elapse(periodicity)
                periodicity_to_next_time.set(periodicity, next_time)
            }
        })
        let earlier_next_time = date_min(...periodicity_to_next_time.values()) || throw_("internal error")
        const time_to_sleep = earlier_next_time - Date.now()
        if (time_to_sleep > 0) {
            console.log("sleeping", time_to_sleep);
            await setTimeoutPromise(time_to_sleep)
        } else {
            console.log("next remote became ready during computation of other remotes")
        }
    }
}
