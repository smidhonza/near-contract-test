import { NearBindgen, view } from 'near-sdk-js';

@NearBindgen({})
export class SayHiContract {

    @view({})
    get_hi(): string {
        return "Hi";
    }
}
